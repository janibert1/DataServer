import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDriveOpsStore } from '../store/driveOpsStore';
import toast from 'react-hot-toast';
import { api, getErrorMessage } from '../lib/axios';
import { DriveFile, SortField, SortDir } from '../types';
import { useUploadStore, clearPendingUpload } from '../store/uploadStore';

export function useFiles(params: {
  folderId?: string | null;
  search?: string;
  sortBy?: SortField;
  sortDir?: SortDir;
  page?: number;
}) {
  return useQuery({
    queryKey: ['files', params],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/files', {
        params: {
          folderId: params.folderId,
          search: params.search,
          sortBy: params.sortBy ?? 'updatedAt',
          sortDir: params.sortDir ?? 'desc',
          page: params.page ?? 1,
          limit: 500,
        },
      });
      return res.data as { files: DriveFile[]; pagination: any };
    },
  });
}

export function useRecentFiles() {
  return useQuery({
    queryKey: ['files', 'recent'],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/files/recent');
      return res.data.files as DriveFile[];
    },
  });
}

export function useStarredFiles() {
  return useQuery({
    queryKey: ['files', 'starred'],
    queryFn: async () => {
      const res = await api.get('/files/starred');
      return res.data.files as DriveFile[];
    },
  });
}

export function useTrashedFiles(page: number = 1) {
  return useQuery({
    queryKey: ['files', 'trash', page],
    queryFn: async () => {
      const res = await api.get('/files/trash', { params: { page } });
      return {
        files: res.data.files as DriveFile[],
        pagination: res.data.pagination as { page: number; limit: number; total: number; totalPages: number },
      };
    },
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: ['files', id],
    queryFn: async () => {
      const res = await api.get(`/files/${id}`);
      return res.data.file as DriveFile;
    },
    enabled: !!id,
  });
}

// ── Adaptive upload parameters ───────────────────────────────

// Cached measured speed from the most recent upload (persists within the session)
let sessionSpeedMbps: number | null = null;

interface UploadParams {
  chunkSize: number;   // bytes per chunk (min 5 MB — S3 multipart minimum)
  parallel: number;    // concurrent chunk uploads
  threshold: number;   // file size above which chunked upload is used
}

// Real measured probe instead of navigator.connection — Safari doesn't
// implement that API at all, so it always silently fell back to a hardcoded
// 10 Mbps guess and badly under-provisioned chunk size/parallelism for every
// Safari upload, regardless of actual connection speed.
const PROBE_BYTES = 3 * 1024 * 1024; // 3 MB — big enough that transfer time isn't dominated by request overhead, small enough to be quick even on a slow link

async function measureUploadSpeedMbps(): Promise<number> {
  const data = new Uint8Array(PROBE_BYTES);
  const start = performance.now();
  await api.post('/files/upload/probe', data, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  const elapsedSec = Math.max(0.02, (performance.now() - start) / 1000);
  return (PROBE_BYTES * 8) / (elapsedSec * 1_000_000);
}

async function estimateSpeedMbps(): Promise<number> {
  if (sessionSpeedMbps !== null) return sessionSpeedMbps;
  try {
    const measured = await measureUploadSpeedMbps();
    sessionSpeedMbps = measured;
    return measured;
  } catch {
    return 10; // probe failed (offline, server unreachable) — conservative fallback
  }
}

function paramsForSpeed(mbps: number): UploadParams {
  // Chunk size: target ~5s per chunk at the given speed
  // Minimum 5 MB (S3 multipart limit), maximum 20 MB
  const targetSeconds = 5;
  const rawBytes = (mbps * 1_000_000 * targetSeconds) / 8;
  const MB = 1024 * 1024;
  const chunkSize = Math.min(20 * MB, Math.max(5 * MB, Math.round(rawBytes / MB) * MB));

  // Parallel chunks: 1 on slow connections, up to 5 on fast ones
  const parallel = mbps < 2 ? 1 : mbps < 10 ? 2 : mbps < 50 ? 3 : mbps < 200 ? 4 : 5;

  // Threshold: use chunked path for files above this size
  // On slow connections use a lower threshold so even medium files get resumability
  const threshold = mbps < 5 ? 5 * MB : 10 * MB;

  return { chunkSize, parallel, threshold };
}

export async function uploadChunked(
  file: File,
  folderId: string | null | undefined,
  uploadItemId: string,
  updateUpload: (id: string, u: any) => void,
  queryClient: any,
  resumeState?: { fileId: string; uploadId: string; storageKey: string; completedParts: { partNumber: number; etag: string }[]; chunkSize: number; totalChunks: number },
) {
  let speedMbps = await estimateSpeedMbps();

  // Lock chunkSize for this entire upload — byte offsets for each part number must stay consistent.
  // On resume, use the saved chunkSize so parts align with what was already uploaded to S3.
  const chunkSize = resumeState?.chunkSize ?? paramsForSpeed(speedMbps).chunkSize;
  const totalChunks = resumeState?.totalChunks ?? Math.ceil(file.size / chunkSize);

  let fileId: string;
  let s3UploadId: string;
  let storageKey: string;
  let completedParts: { partNumber: number; etag: string }[];

  if (resumeState) {
    ({ fileId, uploadId: s3UploadId, storageKey } = resumeState);
    completedParts = [...resumeState.completedParts];
  } else {
    const { data: init } = await api.post('/files/upload/init', {
      name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream', folderId: folderId ?? null,
    });
    fileId = init.fileId;
    s3UploadId = init.uploadId;
    storageKey = init.storageKey;
    completedParts = [];
  }

  updateUpload(uploadItemId, {
    chunked: { fileId, uploadId: s3UploadId, storageKey, name: file.name, size: file.size, mimeType: file.type, folderId: folderId ?? null, completedParts, totalChunks, chunkSize },
  });

  const completedNums = new Set(completedParts.map((p) => p.partNumber));
  let batchStart = 0;

  while (batchStart < totalChunks) {
    // chunkSize is fixed; only parallel count adapts with measured speed
    const parallel = paramsForSpeed(speedMbps).parallel;
    const batchEnd = Math.min(batchStart + parallel, totalChunks);

    const batch: { partNumber: number; chunk: Blob }[] = [];
    for (let j = batchStart; j < batchEnd; j++) {
      const partNumber = j + 1;
      if (!completedNums.has(partNumber)) {
        const byteStart = j * chunkSize;
        batch.push({ partNumber, chunk: file.slice(byteStart, Math.min(byteStart + chunkSize, file.size)) });
      }
    }

    if (batch.length > 0) {
      const t0 = Date.now();
      const results = await Promise.all(
        batch.map(({ partNumber: pn, chunk }) =>
          api.post(
            `/files/upload/part?uploadId=${encodeURIComponent(s3UploadId)}&storageKey=${encodeURIComponent(storageKey)}&partNumber=${pn}`,
            chunk,
            { headers: { 'Content-Type': 'application/octet-stream' } },
          ).then((r) => ({ partNumber: pn, etag: r.data.etag as string })),
        ),
      );
      completedParts.push(...results);

      const elapsedSec = Math.max(0.1, (Date.now() - t0) / 1000);
      const bytesSent = batch.reduce((s, b) => s + b.chunk.size, 0);
      const measured = (bytesSent * 8) / (elapsedSec * 1_000_000);
      sessionSpeedMbps = sessionSpeedMbps === null ? measured : sessionSpeedMbps * 0.6 + measured * 0.4;
      speedMbps = sessionSpeedMbps;
    }

    batchStart = batchEnd;
    const progress = Math.round((batchEnd / totalChunks) * 95);
    updateUpload(uploadItemId, {
      progress,
      chunked: { fileId, uploadId: s3UploadId, storageKey, name: file.name, size: file.size, mimeType: file.type, folderId: folderId ?? null, completedParts, totalChunks, chunkSize },
    });
  }

  await api.post('/files/upload/complete', {
    fileId, uploadId: s3UploadId, storageKey,
    parts: completedParts.sort((a, b) => a.partNumber - b.partNumber),
  });

  clearPendingUpload(fileId);
  updateUpload(uploadItemId, { status: 'complete', progress: 100 });
  queryClient.invalidateQueries({ queryKey: ['files'] });
  queryClient.invalidateQueries({ queryKey: ['folders'] });
  queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
}

export function useUploadFiles() {
  const queryClient = useQueryClient();
  const { addUpload, updateUpload } = useUploadStore();

  // Core uploader — returns successful count, no toast/invalidation side effects
  async function performUploads(files: File[], folderId?: string | null): Promise<number> {
    const uploadIds = files.map((f) => addUpload(f));
    uploadIds.forEach((id) => updateUpload(id, { status: 'uploading' }));
    let totalUploaded = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uploadId = uploadIds[i];
      try {
        const params = paramsForSpeed(await estimateSpeedMbps());
        if (file.size >= params.threshold) {
          await uploadChunked(file, folderId, uploadId, updateUpload, queryClient);
          totalUploaded++;
        } else {
          const formData = new FormData();
          formData.append('files', file);
          if (folderId) formData.append('folderId', folderId);
          const res = await new Promise<{ data: any }>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/files/upload/', true);
            xhr.withCredentials = true;
            xhr.timeout = 120000;
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) updateUpload(uploadId, { progress: Math.round((e.loaded / e.total) * 100) });
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ data: JSON.parse(xhr.responseText) });
              } else {
                try { reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed')); }
                catch { reject(new Error('Upload failed')); }
              }
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.ontimeout = () => reject(new Error('Upload timed out'));
            xhr.send(formData);
          });
          const { errors } = res.data;
          if (errors?.length > 0) {
            updateUpload(uploadId, { status: 'error', error: errors[0].error });
            errors.forEach((e: any) => toast.error(`${e.filename}: ${e.error}`));
          } else {
            updateUpload(uploadId, { status: 'complete', progress: 100 });
            totalUploaded++;
          }
        }
      } catch (err) {
        const msg = getErrorMessage(err);
        updateUpload(uploadId, { status: 'paused', error: msg });
        toast.error(`${file.name}: ${msg} — tap to resume`);
      }
    }
    return totalUploaded;
  }

  const upload = async (files: File[], folderId?: string | null) => {
    if (!files || files.length === 0) { toast.error('No files selected.'); return; }
    const uploaded = await performUploads(files, folderId);
    if (uploaded > 0) {
      toast.success(`Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''}.`);
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    }
  };

  const uploadFolder = async (fileList: FileList, parentFolderId?: string | null) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const rootName = files[0].webkitRelativePath.split('/')[0];
    try {
      const tid = toast.loading(`Creating folder structure for "${rootName}"…`);
      const rootRes = await api.post('/folders', { name: rootName, parentId: parentFolderId ?? null });
      const rootFolderId: string = rootRes.data.folder.id;
      const pathToId = new Map<string, string>();
      pathToId.set(rootName, rootFolderId);

      const dirPaths = new Set<string>();
      for (const f of files) {
        const parts = f.webkitRelativePath.split('/');
        for (let i = 2; i < parts.length; i++) dirPaths.add(parts.slice(0, i).join('/'));
      }
      for (const dirPath of [...dirPaths].sort((a, b) => a.split('/').length - b.split('/').length)) {
        const parts = dirPath.split('/');
        const parentPath = parts.slice(0, -1).join('/');
        const parentId = pathToId.get(parentPath) ?? rootFolderId;
        try {
          const res = await api.post('/folders', { name: parts[parts.length - 1], parentId });
          pathToId.set(dirPath, res.data.folder.id);
        } catch (e: any) {
          if (e?.response?.status === 409) {
            try {
              const existing = await api.get('/folders', { params: { parentId, search: parts[parts.length - 1] } });
              const match = existing.data.folders?.find((f: any) => f.name === parts[parts.length - 1]);
              if (match) pathToId.set(dirPath, match.id);
            } catch { /* ignore */ }
          } else {
            throw e;
          }
        }
      }

      const filesByFolder = new Map<string, File[]>();
      for (const file of files) {
        const parts = file.webkitRelativePath.split('/');
        const folderPath = parts.slice(0, -1).join('/');
        const targetId = pathToId.get(folderPath) ?? rootFolderId;
        if (!filesByFolder.has(targetId)) filesByFolder.set(targetId, []);
        filesByFolder.get(targetId)!.push(file);
      }

      toast.dismiss(tid);
      const totalFiles = [...filesByFolder.values()].reduce((n, arr) => n + arr.length, 0);
      const diagId = toast.loading(`Uploading ${totalFiles} file${totalFiles !== 1 ? 's' : ''} across ${filesByFolder.size} folder${filesByFolder.size !== 1 ? 's' : ''}\u2026`);
      let totalUploaded = 0;
      for (const [fid, folderFiles] of filesByFolder) totalUploaded += await performUploads(folderFiles, fid);
      toast.dismiss(diagId);

      toast.success(`Folder "${rootName}" uploaded (${totalUploaded} file${totalUploaded !== 1 ? 's' : ''}).`);
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return { upload, uploadFolder };
}

export function useCompressFiles() {
  const { addJob } = useDriveOpsStore();
  return useMutation({
    mutationFn: ({ fileIds, folderIds, name, folderId }: { fileIds: string[]; folderIds: string[]; name?: string; folderId?: string | null }) =>
      api.post('/files/zip-to-drive', { fileIds, folderIds, name, folderId }),
    onSuccess: (data) => {
      const { jobId, label } = data.data as { jobId: string; label: string };
      addJob({ id: jobId, type: 'zip-to-drive', label });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useExtractFile() {
  const { addJob } = useDriveOpsStore();
  return useMutation({
    mutationFn: (id: string) => api.post(`/files/${id}/extract`),
    onSuccess: (data) => {
      const { jobId, label } = data.data as { jobId: string; label: string };
      addJob({ id: jobId, type: 'extract', label });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useRenameFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/files/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File renamed.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useMoveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      api.put(`/files/${id}/move`, { folderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
      toast.success('File moved.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useTrashFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/files/${id}/trash`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File moved to trash.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useRestoreFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/files/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File restored.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useDeleteFilePermanently() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('File permanently deleted.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useStarFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/files/${id}/star`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useBulkTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { fileIds: string[]; folderIds: string[]; trashRootFiles?: boolean; trashAllInFolder?: string | null }) =>
      api.post('/files/bulk-trash', params),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
      toast.success(res.data.message);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useEmptyTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/files/empty-trash'),
    onSuccess: (res) => {
      if (res.data.status === 'processing' || res.data.jobId) {
        toast.success('Emptying trash in the background. You will be notified when complete.');
      } else {
        toast.success(res.data.message);
      }
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useEmptyTrashStatus() {
  return useQuery({
    queryKey: ['empty-trash-status'],
    queryFn: async () => {
      const res = await api.get('/files/empty-trash/status');
      return res.data as { status: 'idle' | 'processing' | 'completed' | 'failed'; progress: number; jobId: string };
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'processing') return 2000;
      return false;
    },
    staleTime: 0,
  });
}

export function useAiSort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ maxDepth, prompt }: { maxDepth: number; prompt: string }) => {
      const res = await api.post('/files/ai-sort', { maxDepth, prompt });
      return res.data as { jobId: string; status: string };
    },
    onSuccess: () => {
      toast.success('AI sort started — you\'ll be notified when done.');
      queryClient.invalidateQueries({ queryKey: ['ai-sort-status'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useAiSortStatus() {
  return useQuery({
    queryKey: ['ai-sort-status'],
    queryFn: async () => {
      const res = await api.get('/files/ai-sort/status');
      return res.data as { status: 'idle' | 'processing' | 'completed' | 'failed'; jobId?: string };
    },
    refetchInterval: (query) => {
      if (query.state.data?.status === 'processing') return 3000;
      return false;
    },
    staleTime: 0,
  });
}

export async function getFileDownloadUrl(id: string): Promise<{ downloadUrl: string; filename: string }> {
  const res = await api.get(`/files/${id}/download`);
  return res.data;
}

export async function getFilePreviewUrl(id: string): Promise<{ previewUrl: string; mimeType: string }> {
  // This is just signed-URL generation, not a data transfer -- it should
  // always be near-instant. Override the app-wide 120s axios timeout so a
  // stuck backend/proxy connection fails fast and falls back to
  // "Preview not available" instead of leaving the modal looking stuck.
  const res = await api.get(`/files/${id}/preview`, { timeout: 15000 });
  return res.data;
}

export function useFileVersions(fileId: string) {
  return useQuery({
    queryKey: ['files', fileId, 'versions'],
    queryFn: async () => {
      const res = await api.get(`/files/${fileId}/versions`);
      return res.data.versions;
    },
    enabled: !!fileId,
  });
}
