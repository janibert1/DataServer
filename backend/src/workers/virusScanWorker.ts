import net from 'net';
import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { getObjectStream } from '../lib/s3';
import { logger } from '../lib/logger';
import { config } from '../config';
import { Readable } from 'stream';

export interface VirusScanJobData {
  fileId: string;
}

// ─── ClamAV INSTREAM protocol ─────────────────────────────────────────────────
//
// Protocol spec:
//   1. Connect via TCP to clamd host:port.
//   2. Send the command: "zINSTREAM\0"   (null-terminated)
//   3. For each chunk of data send: [4-byte big-endian chunk length][chunk bytes]
//   4. Signal end-of-stream with a 4-byte zero: [0x00 0x00 0x00 0x00]
//   5. Read the response line. Examples:
//      "stream: OK"
//      "stream: Eicar-Test-Signature FOUND"
//      "stream: ... ERROR"

function scanStreamWithClamAV(stream: Readable): Promise<'CLEAN' | 'INFECTED'> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let responseData = '';
    let settled = false;

    function finish(result: 'CLEAN' | 'INFECTED') {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    }

    function abort(err: Error) {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(err);
      }
    }

    socket.connect(config.clamav.port, config.clamav.host, () => {
      // Send INSTREAM command (null-terminated)
      socket.write('zINSTREAM\0');

      stream.on('data', (chunk: Buffer) => {
        // 4-byte big-endian length prefix
        const lengthBuf = Buffer.alloc(4);
        lengthBuf.writeUInt32BE(chunk.length, 0);
        socket.write(lengthBuf);
        socket.write(chunk);
      });

      stream.on('end', () => {
        // Send terminating zero-length chunk
        const terminator = Buffer.alloc(4);
        socket.write(terminator);
      });

      stream.on('error', abort);
    });

    socket.on('data', (data: Buffer) => {
      responseData += data.toString();
    });

    socket.on('end', () => {
      logger.debug('ClamAV response', { response: responseData.trim() });

      if (responseData.includes('FOUND')) {
        finish('INFECTED');
      } else if (responseData.includes('OK')) {
        finish('CLEAN');
      } else {
        abort(new Error(`Unexpected ClamAV response: ${responseData.trim()}`));
      }
    });

    socket.on('error', abort);

    socket.setTimeout(60_000, () => {
      abort(new Error('ClamAV socket timeout'));
    });
  });
}

// ─── Worker ───────────────────────────────────────────────────────────────────

async function processVirusScanJob(job: Job<VirusScanJobData>): Promise<void> {
  const { fileId } = job.data;

  logger.info('Virus scan job started', { jobId: job.id, fileId });

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true, storageKey: true, status: true },
  });

  if (!file) {
    logger.warn('Virus scan job: file not found, skipping', { fileId });
    return;
  }

  let scanResult: 'CLEAN' | 'INFECTED';

  try {
    const fileStream = await getObjectStream(file.storageKey);
    scanResult = await scanStreamWithClamAV(fileStream);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Virus scan job: network/ClamAV error — skipping, file left unchanged', {
      fileId,
      error: message,
    });
    // Do NOT mark the file as infected on network failure — just bail out.
    return;
  }

  if (scanResult === 'INFECTED') {
    logger.warn('Virus scan job: INFECTED file detected — quarantining', {
      fileId,
      storageKey: file.storageKey,
    });

    await prisma.file.update({
      where: { id: fileId },
      data: {
        isVirusScanned: true,
        virusScanResult: 'INFECTED',
        isFlagged: true,
        // Mark as DELETED to prevent access; no QUARANTINED value in the enum.
        status: 'DELETED',
      },
    });
  } else {
    logger.info('Virus scan job: file is CLEAN', { fileId });

    await prisma.file.update({
      where: { id: fileId },
      data: {
        isVirusScanned: true,
        virusScanResult: 'CLEAN',
      },
    });
  }
}

export const virusScanWorker = new Worker<VirusScanJobData>(
  'virus-scan-queue',
  processVirusScanJob,
  {
    connection: redis,
    concurrency: 2,
  }
);

virusScanWorker.on('completed', (job) => {
  logger.info('Virus scan job completed', { jobId: job.id, fileId: job.data.fileId });
});

virusScanWorker.on('failed', (job, err) => {
  logger.error('Virus scan job failed permanently', {
    jobId: job?.id,
    fileId: job?.data.fileId,
    error: err.message,
  });
});
