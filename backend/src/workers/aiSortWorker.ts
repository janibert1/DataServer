import { Worker, Job } from 'bullmq';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { getSignedDownloadUrl } from '../lib/s3';
import { logger } from '../lib/logger';
import { createNotification } from '../services/notificationService';

const execFileAsync = promisify(execFile);

export interface AiSortJobData {
  userId: string;
  maxDepth: number;
  userPrompt: string;
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

interface GeminiResponse {
  moves: { fileId: string; toPath: string }[];
  folderMoves?: { folderId: string; toParentPath: string }[];
  mergeFolders?: { sourceFolderId: string; targetFolderId: string }[];
  fileRenames?: { fileId: string; newName: string }[];
  folderRenames?: { folderId: string; newName: string }[];
}

const MAX_VIDEO_FRAMES = 5;
const MAX_IMAGE_DESCRIPTIONS = 100;
const DESC_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

// ── Video frame extraction ────────────────────────────────────

function splitJpegBuffer(buf: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd9) {
      frames.push(buf.subarray(start, i + 2));
      start = i + 2;
    }
  }
  return frames;
}

async function extractVideoFrames(storageKey: string): Promise<string[]> {
  try {
    const url = await getSignedDownloadUrl(storageKey, 180);
    const { stdout } = await execFileAsync(
      'ffmpeg',
      ['-i', url, '-t', '60', '-vf', 'fps=1/20,scale=320:-2', '-frames:v', '3',
       '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '10', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024, timeout: 45000 }
    );
    const frames = splitJpegBuffer(stdout as unknown as Buffer);
    return frames.map((f) => f.toString('base64'));
  } catch {
    return [];
  }
}

// ── Gemini Lite (Flash-Lite) — image/video descriptions ───────

async function callGeminiLite(parts: GeminiPart[]): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${config.gemini.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini Lite API error ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = await response.json() as any;
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

type DescribableFile = {
  id: string;
  name: string;
  mimeType: string;
  storageKey: string;
  thumbnailKey: string | null;
};

async function describeFile(
  file: DescribableFile,
  videoFrames: Map<string, string[]>,
): Promise<string | null> {
  let imageParts: GeminiPart[];

  if (file.mimeType.startsWith('video/')) {
    const frames = videoFrames.get(file.id);
    if (!frames || frames.length === 0) return null;
    imageParts = frames.map((f) => ({ inline_data: { mime_type: 'image/jpeg', data: f } }));
  } else if (file.mimeType.startsWith('image/')) {
    const key = file.thumbnailKey ?? file.storageKey;
    try {
      const signedUrl = await getSignedDownloadUrl(key, 60);
      const imgResp = await fetch(signedUrl);
      if (!imgResp.ok) return null;
      const buf = Buffer.from(await imgResp.arrayBuffer());
      const mime = file.thumbnailKey ? 'image/jpeg' : file.mimeType;
      imageParts = [{ inline_data: { mime_type: mime, data: buf.toString('base64') } }];
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const medium = file.mimeType.startsWith('video/') ? 'video (shown as frames)' : 'image';
  const promptParts: GeminiPart[] = [
    { text: `Describe this ${medium} in 1-2 sentences for file organization. File: "${file.name}". Focus on subject, content type, and key details. Be concise.` },
    ...imageParts,
  ];

  const description = await callGeminiLite(promptParts);
  if (description) await redis.setex(`ai-desc:${file.id}`, DESC_CACHE_TTL, description);
  return description || null;
}

// ── Gemini API (Flash) — sort decisions ──────────────────────

async function callGemini(parts: GeminiPart[]): Promise<GeminiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.gemini.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');

  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(clean) as GeminiResponse;
}

// ── Folder resolution (find or create by path) ────────────────

async function resolveFolder(
  userId: string,
  targetPath: string,
  folderCache: Map<string, string>,
): Promise<string | null> {
  const parts = targetPath.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  let currentParentId: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    const name = parts[i];
    const cacheKey: string = `${currentParentId ?? 'root'}:${name}`;

    if (folderCache.has(cacheKey)) {
      currentParentId = folderCache.get(cacheKey)!;
      continue;
    }

    let folderId: string;
    const existing = await prisma.folder.findFirst({
      where: { ownerId: userId, name, parentId: currentParentId, isTrashed: false, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      folderId = existing.id;
    } else {
      const parentFolder = currentParentId
        ? await prisma.folder.findUnique({ where: { id: currentParentId }, select: { path: true } })
        : null;
      const folderPath = parentFolder ? `${parentFolder.path}/${name}` : `/${name}`;

      const created = await prisma.folder.create({
        data: { name, ownerId: userId, parentId: currentParentId, path: folderPath, depth: i },
        select: { id: true },
      });
      folderId = created.id;
    }

    folderCache.set(cacheKey, folderId);
    currentParentId = folderId;
  }

  return currentParentId;
}

// ── Folder move (updates the folder and all descendants' paths) ──

async function moveFolder(
  userId: string,
  folderId: string,
  toParentPath: string,
  folderCache: Map<string, string>,
): Promise<void> {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ownerId: userId, isTrashed: false, deletedAt: null },
    select: { name: true, parentId: true, path: true, depth: true },
  });
  if (!folder) throw new Error(`Folder ${folderId} not found`);

  const cleanParent = (toParentPath ?? '/').replace(/\/$/, '') || '/';

  let newParentId: string | null = null;
  let newParentPath = '';
  let newParentDepth = -1;

  if (cleanParent !== '/') {
    newParentId = await resolveFolder(userId, cleanParent, folderCache);
    if (newParentId) {
      const pf = await prisma.folder.findUnique({ where: { id: newParentId }, select: { path: true, depth: true } });
      newParentPath = pf?.path ?? '';
      newParentDepth = pf?.depth ?? 0;
    }
  }

  if (newParentId === folderId) throw new Error('Cannot move folder into itself');

  const newPath = newParentPath ? `${newParentPath}/${folder.name}` : `/${folder.name}`;
  const oldPath = folder.path;

  if (newPath === oldPath) return; // nothing to do

  // Prevent moving into own descendant
  if (newPath.startsWith(oldPath + '/')) throw new Error('Cannot move folder into its own descendant');

  const newDepth = newParentDepth + 1;
  const depthDelta = newDepth - folder.depth;

  await prisma.folder.update({
    where: { id: folderId },
    data: { parentId: newParentId, path: newPath, depth: newDepth },
  });

  // Update all descendants in one query (cast to int — Prisma passes bigint by default)
  const pathOffset = oldPath.length + 1;
  await prisma.$executeRaw`
    UPDATE "Folder"
    SET path = ${newPath} || SUBSTRING(path, ${pathOffset}::int),
        depth = depth + ${depthDelta}::int
    WHERE path LIKE ${oldPath + '/%'}
    AND "ownerId" = ${userId}
  `;

  // Refresh the folder cache entry
  const parentCacheKey: string = `${newParentId ?? 'root'}:${folder.name}`;
  folderCache.set(parentCacheKey, folderId);
}

// ── Folder tree builder ───────────────────────────────────────

function buildFolderTree(
  folders: { id: string; name: string; parentId: string | null; depth: number }[],
  maxDepth: number,
): string {
  const byParent = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const key = f.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(f);
  }
  const lines: string[] = ['/'];
  function render(parentId: string | null, indent: string) {
    for (const child of byParent.get(parentId) ?? []) {
      if (child.depth < maxDepth) {
        lines.push(`${indent}${child.name}/`);
        render(child.id, indent + '  ');
      }
    }
  }
  render(null, '  ');
  return lines.join('\n');
}

// ── Empty folder cleanup ──────────────────────────────────────

async function deleteEmptyFolders(userId: string): Promise<number> {
  let deleted = 0;
  for (let round = 0; round < 20; round++) {
    const empty = await prisma.folder.findMany({
      where: {
        ownerId: userId,
        isTrashed: false,
        deletedAt: null,
        files: { none: { isTrashed: false } },
        children: { none: { isTrashed: false, deletedAt: null } },
      },
      select: { id: true },
    });
    if (empty.length === 0) break;
    await prisma.folder.deleteMany({ where: { id: { in: empty.map((f) => f.id) } } });
    deleted += empty.length;
  }
  return deleted;
}

// ── Main job processor ────────────────────────────────────────

async function processAiSort(job: Job<AiSortJobData>): Promise<void> {
  const { userId, maxDepth, userPrompt } = job.data;
  logger.info('AI sort job started', { jobId: job.id, userId, maxDepth });

  const allFolders = await prisma.folder.findMany({
    where: { ownerId: userId, isTrashed: false, deletedAt: null },
    select: { id: true, name: true, parentId: true, path: true, depth: true },
    orderBy: { depth: 'asc' },
  });

  const eligibleFolderIds = allFolders.filter((f) => f.depth < maxDepth).map((f) => f.id);

  const allFiles = await prisma.file.findMany({
    where: {
      ownerId: userId,
      isTrashed: false,
      status: { in: ['ACTIVE' as any, 'PROCESSING' as any] },
      OR: [{ folderId: null }, { folderId: { in: eligibleFolderIds } }],
    },
    select: { id: true, name: true, mimeType: true, folderId: true, storageKey: true, thumbnailKey: true },
  });

  if (allFiles.length === 0 && allFolders.length === 0) {
    await createNotification({
      userId,
      type: 'TASK_COMPLETED',
      title: 'AI Sort complete',
      body: 'No files to organize.',
      link: '/drive/my-drive',
    });
    return;
  }

  // ── Extract video frames (for description phase) ──────────
  const videoFiles = allFiles
    .filter((f) => f.mimeType.startsWith('video/'))
    .slice(0, MAX_VIDEO_FRAMES);

  const videoFrames = new Map<string, string[]>();

  for (const vf of videoFiles) {
    const frames = await extractVideoFrames(vf.storageKey);
    if (frames.length > 0) {
      videoFrames.set(vf.id, frames);
      logger.info('Extracted video frames', { jobId: job.id, fileId: vf.id, count: frames.length });
    }
  }

  // ── Describe images and videos with Flash-Lite (two-pass) ─
  const fileDescriptions = new Map<string, string>();
  const describableFiles = allFiles.filter(
    (f) => f.mimeType.startsWith('image/') || videoFrames.has(f.id),
  );

  // Load cached descriptions first
  const uncachedFiles: typeof describableFiles = [];
  for (const f of describableFiles) {
    const cached = await redis.get(`ai-desc:${f.id}`);
    if (cached) {
      fileDescriptions.set(f.id, cached);
    } else {
      uncachedFiles.push(f);
    }
  }

  // Generate missing descriptions (cap total at MAX_IMAGE_DESCRIPTIONS)
  const toDescribe = uncachedFiles.slice(0, Math.max(0, MAX_IMAGE_DESCRIPTIONS - fileDescriptions.size));
  logger.info('Describing files with Flash-Lite', {
    jobId: job.id, cached: fileDescriptions.size, toDescribe: toDescribe.length,
  });

  const DESCRIPTION_CONCURRENCY = 5;
  for (let i = 0; i < toDescribe.length; i += DESCRIPTION_CONCURRENCY) {
    const chunk = toDescribe.slice(i, i + DESCRIPTION_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (f) => {
        try {
          const desc = await describeFile(f, videoFrames);
          return { id: f.id, desc };
        } catch (err) {
          logger.warn('Failed to describe file', { jobId: job.id, fileId: f.id, err });
          return { id: f.id, desc: null };
        }
      }),
    );
    for (const { id, desc } of results) {
      if (desc) fileDescriptions.set(id, desc);
    }
  }

  // ── Build Gemini prompt context ───────────────────────────
  const folderPathMap = new Map(allFolders.map((f) => [f.id, f.path]));
  const folderTree = buildFolderTree(allFolders, maxDepth);

  // Only include folders within the eligible depth range in the prompt
  const eligibleFolders = allFolders.filter((f) => f.depth < maxDepth);
  const folderList = eligibleFolders
    .map((f) => `${f.id} | ${f.path}`)
    .join('\n');

  const depthNote = maxDepth === 1 ? 'one level (root folders only)' : `${maxDepth} levels deep`;

  // Pre-populate folder cache from existing folders
  const folderCache = new Map<string, string>();
  for (const f of allFolders) {
    folderCache.set(`${f.parentId ?? 'root'}:${f.name}`, f.id);
  }

  const validFileIds = new Set(allFiles.map((f) => f.id));
  const validFolderIds = new Set(allFolders.map((f) => f.id));

  // ── Batch Gemini calls, applying moves between batches ────
  // Applying moves between batches ensures subsequent batches see newly-created
  // folders in their folder list, preventing duplicate folder creation.
  const BATCH_SIZE = 1000;
  const totalBatches = Math.ceil(allFiles.length / BATCH_SIZE);

  const allFolderMoveResults: { folderId: string; toParentPath: string }[] = [];
  const allFolderMergeResults: { sourceFolderId: string; targetFolderId: string }[] = [];
  const allFileRenameResults: { fileId: string; newName: string }[] = [];
  const allFolderRenameResults: { folderId: string; newName: string }[] = [];
  let movedCount = 0;

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchFiles = allFiles.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);
    const isFirstBatch = batchIdx === 0;
    const batchNote = totalBatches > 1 ? `\nBatch ${batchIdx + 1} of ${totalBatches} (${batchFiles.length} files of ${allFiles.length} total).` : '';

    // Refresh folder list each batch so Gemini sees folders created by previous batches
    const currentFolders = isFirstBatch
      ? allFolders
      : await prisma.folder.findMany({
          where: { ownerId: userId, isTrashed: false, deletedAt: null },
          select: { id: true, name: true, parentId: true, path: true, depth: true },
          orderBy: { depth: 'asc' },
        });

    const currentFolderTree = buildFolderTree(currentFolders, maxDepth);
    const currentEligibleFolders = currentFolders.filter((f) => f.depth < maxDepth);
    const currentFolderList = currentEligibleFolders.map((f) => `${f.id} | ${f.path}`).join('\n');
    const currentFolderPathMap = new Map(currentFolders.map((f) => [f.id, f.path]));

    const fileList = batchFiles
      .map((f) => {
        const loc = f.folderId ? `${currentFolderPathMap.get(f.folderId) ?? folderPathMap.get(f.folderId) ?? ''}/` : '/';
        const desc = fileDescriptions.get(f.id);
        return `${f.id} | ${loc} | ${f.name} | ${f.mimeType}${desc ? ` | AI: ${desc}` : ''}`;
      })
      .join('\n');

    const promptText = [
      'You are an intelligent file organizer for a cloud drive.',
      batchNote,
      '',
      `Current folder structure (up to depth ${maxDepth}):`,
      currentFolderTree,
      '',
      'Existing folders (folderId | path) — use folderId for folderMoves and folderRenames:',
      currentFolderList,
      '',
      `Files to organize (fileId | current_path | name | mime_type${fileDescriptions.size > 0 ? ' | ai_description' : ''}):`,
      fileList,
      '',
      userPrompt ? `User instruction: ${userPrompt}` : '',
      '',
      'Return a JSON object:',
      '{',
      '  "moves": [{"fileId":"<id>","toPath":"/Target/Folder/"},...],',
      '  "folderMoves": [{"folderId":"<id>","toParentPath":"/"},...],',
      '  "mergeFolders": [{"sourceFolderId":"<id>","targetFolderId":"<id>"},...],',
      '  "fileRenames": [{"fileId":"<id>","newName":"clean name.ext"},...],',
      '  "folderRenames": [{"folderId":"<id>","newName":"Clean Name"},...]',
      '}',
      '',
      'Rules:',
      '- Only move files that clearly belong somewhere else',
      `- Prefer existing folders; you may create new folders but keep paths within ${depthNote}`,
      '- You may move folders using their folderId; toParentPath is the new parent path ("/" for root) — moving a folder moves all its contents automatically',
      '- If two folders serve the same purpose (e.g. "Photos" and "Pictures", "Docs" and "Documents"), use mergeFolders to merge the worse-named one (source) into the better-named one (target) — all files move automatically and the source is deleted',
      '- Never delete files',
      '- Rename generic/auto-generated filenames (e.g. IMG_1234.jpg, DSC_0001.jpg, photo_2024-01-01.jpg, screenshot-20240101-123456.png) to a short descriptive name using the ai_description column; always keep the original extension',
      '- Rename folders only if the name is unclear; use the folderId from the folder list',
      '- Omit any array that has nothing to add',
      '- Return ONLY the JSON, no markdown',
    ].filter(Boolean).join('\n');

    const parts: GeminiPart[] = [{ text: promptText }];

    logger.info('Calling Gemini', { jobId: job.id, batch: batchIdx + 1, totalBatches, fileCount: batchFiles.length, descriptions: fileDescriptions.size });

    let result: GeminiResponse;
    try {
      result = await callGemini(parts);
    } catch (err) {
      logger.error('Gemini call failed', { err, jobId: job.id, batch: batchIdx + 1 });
      throw err;
    }

    // Apply file moves immediately so next batch sees the updated folder state
    const batchMoves = Array.isArray(result.moves) ? result.moves : [];
    for (const move of batchMoves) {
      if (!move.fileId || !validFileIds.has(move.fileId)) continue;
      try {
        const targetFolderId = await resolveFolder(userId, move.toPath ?? '/', folderCache);
        await prisma.file.update({ where: { id: move.fileId }, data: { folderId: targetFolderId } });
        movedCount++;
      } catch (err) {
        logger.error('Failed to move file during AI sort', { err, fileId: move.fileId, toPath: move.toPath });
      }
    }

    // Collect folder operations for later (after all file moves are done)
    allFolderMoveResults.push(...(Array.isArray(result.folderMoves) ? result.folderMoves : []));
    allFolderMergeResults.push(...(Array.isArray(result.mergeFolders) ? result.mergeFolders : []));
    allFileRenameResults.push(...(Array.isArray(result.fileRenames) ? result.fileRenames : []));
    allFolderRenameResults.push(...(Array.isArray(result.folderRenames) ? result.folderRenames : []));

    await job.updateProgress(Math.round(((batchIdx + 1) / totalBatches) * 60));

    // Pause between batches to avoid Gemini rate limits
    if (batchIdx < totalBatches - 1) await new Promise((r) => setTimeout(r, 2000));
  }

  const folderMoves = allFolderMoveResults;
  logger.info('All batches done', { jobId: job.id, batches: totalBatches, movedCount, folderMoveCount: folderMoves.length });

  let movedFolderCount = 0;

  // ── Apply folder moves ────────────────────────────────────
  for (let i = 0; i < folderMoves.length; i++) {
    const fm = folderMoves[i];
    if (!fm.folderId || !validFolderIds.has(fm.folderId)) continue;

    try {
      await moveFolder(userId, fm.folderId, fm.toParentPath ?? '/', folderCache);
      movedFolderCount++;
    } catch (err) {
      logger.error('Failed to move folder during AI sort', { err, folderId: fm.folderId, toParentPath: fm.toParentPath });
    }

    await job.updateProgress(Math.round(60 + ((i + 1) / Math.max(folderMoves.length, 1)) * 20));
  }

  // ── Apply folder merges ───────────────────────────────────
  const folderMerges = allFolderMergeResults.filter(
    (m, i, arr) => arr.findIndex((x) => x.sourceFolderId === m.sourceFolderId && x.targetFolderId === m.targetFolderId) === i
  );
  let mergedFolderCount = 0;
  for (const merge of folderMerges) {
    if (!merge.sourceFolderId || !merge.targetFolderId) continue;
    if (!validFolderIds.has(merge.sourceFolderId) || !validFolderIds.has(merge.targetFolderId)) continue;
    if (merge.sourceFolderId === merge.targetFolderId) continue;
    try {
      // Move all files from source into target
      await prisma.file.updateMany({
        where: { folderId: merge.sourceFolderId, isTrashed: false },
        data: { folderId: merge.targetFolderId },
      });
      // Move direct subfolders of source into target
      const subfolders = await prisma.folder.findMany({
        where: { parentId: merge.sourceFolderId, isTrashed: false, deletedAt: null },
        select: { id: true },
      });
      for (const sf of subfolders) {
        try {
          await moveFolder(userId, sf.id, (await prisma.folder.findUnique({ where: { id: merge.targetFolderId }, select: { path: true } }))?.path ?? '/', folderCache);
        } catch { /* ignore subfolder move errors */ }
      }
      mergedFolderCount++;
      logger.info('Merged folder', { jobId: job.id, sourceFolderId: merge.sourceFolderId, targetFolderId: merge.targetFolderId });
    } catch (err) {
      logger.error('Failed to merge folders', { err, jobId: job.id, ...merge });
    }
  }

  // ── Apply file renames ────────────────────────────────────
  const fileRenames = allFileRenameResults.filter(
    (r, i, arr) => arr.findIndex((x) => x.fileId === r.fileId) === i
  );
  let renamedFileCount = 0;
  for (const rename of fileRenames) {
    if (!rename.fileId || !validFileIds.has(rename.fileId) || !rename.newName) continue;
    const newName = String(rename.newName).trim().slice(0, 255);
    if (!newName) continue;
    try {
      await prisma.file.update({ where: { id: rename.fileId }, data: { name: newName } });
      renamedFileCount++;
    } catch (err) {
      logger.error('Failed to rename file during AI sort', { err, fileId: rename.fileId });
    }
  }

  // ── Apply folder renames ──────────────────────────────────
  const folderRenames = allFolderRenameResults.filter(
    (r, i, arr) => arr.findIndex((x) => x.folderId === r.folderId) === i
  );
  let renamedFolderCount = 0;
  for (const rename of folderRenames) {
    if (!rename.folderId || !validFolderIds.has(rename.folderId) || !rename.newName) continue;
    const newName = String(rename.newName).trim().slice(0, 255);
    if (!newName) continue;
    try {
      await prisma.folder.update({ where: { id: rename.folderId }, data: { name: newName } });
      renamedFolderCount++;
    } catch (err) {
      logger.error('Failed to rename folder during AI sort', { err, folderId: rename.folderId });
    }
  }

  if (mergedFolderCount > 0 || renamedFileCount > 0 || renamedFolderCount > 0) {
    logger.info('AI sort post-processing applied', { jobId: job.id, mergedFolderCount, renamedFileCount, renamedFolderCount });
  }

  // ── Delete empty folders ──────────────────────────────────
  const deletedFolderCount = await deleteEmptyFolders(userId);
  if (deletedFolderCount > 0) {
    logger.info('AI sort deleted empty folders', { jobId: job.id, deletedFolderCount });
  }

  await job.updateProgress(100);

  const summaryParts: string[] = [];
  if (movedCount > 0) summaryParts.push(`moved ${movedCount} file${movedCount !== 1 ? 's' : ''}`);
  if (movedFolderCount > 0) summaryParts.push(`moved ${movedFolderCount} folder${movedFolderCount !== 1 ? 's' : ''}`);
  if (mergedFolderCount > 0) summaryParts.push(`merged ${mergedFolderCount} duplicate folder${mergedFolderCount !== 1 ? 's' : ''}`);
  if (renamedFileCount > 0) summaryParts.push(`renamed ${renamedFileCount} file${renamedFileCount !== 1 ? 's' : ''}`);
  if (renamedFolderCount > 0) summaryParts.push(`renamed ${renamedFolderCount} folder${renamedFolderCount !== 1 ? 's' : ''}`);
  if (deletedFolderCount > 0) summaryParts.push(`removed ${deletedFolderCount} empty folder${deletedFolderCount !== 1 ? 's' : ''}`);
  const body = summaryParts.length > 0 ? `${summaryParts.join(', ')}.` : 'Nothing to organize.';

  await createNotification({
    userId,
    type: 'TASK_COMPLETED',
    title: 'AI Sort complete',
    body,
    link: '/drive/my-drive',
  });

  logger.info('AI sort job done', { jobId: job.id, userId, movedCount, movedFolderCount, mergedFolderCount, renamedFileCount, renamedFolderCount, deletedFolderCount });
}

// ── Worker ────────────────────────────────────────────────────

export const aiSortWorker = new Worker<AiSortJobData>('ai-sort-queue', processAiSort, {
  connection: { url: config.redis.url },
  concurrency: 1,
  lockDuration: 600000, // 10 minutes — allows time for multi-batch Gemini calls
});

aiSortWorker.on('completed', (job) => {
  logger.info('AI sort job completed', { jobId: job.id });
});

aiSortWorker.on('failed', (job, err) => {
  const userId = job?.data?.userId ?? 'unknown';
  logger.error('AI sort job failed', { jobId: job?.id, userId, error: err.message });

  if (userId !== 'unknown') {
    createNotification({
      userId,
      type: 'TASK_COMPLETED',
      title: 'AI Sort failed',
      body: 'There was a problem organizing your files. Please try again.',
      link: '/drive/my-drive',
    }).catch((e) => logger.error('Failed to send AI sort failure notification', { e }));
  }
});
