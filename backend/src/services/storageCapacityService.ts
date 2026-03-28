import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

const TWO_GB = BigInt(2 * 1024 ** 3);

/** Get physical disk space info for the data directory */
export function getPhysicalDiskSpace() {
  const dataDir = process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads');
  const stats = fs.statfsSync(dataDir);
  const blockSize = BigInt(stats.bsize);
  const totalBytes = blockSize * BigInt(stats.blocks);
  const availableBytes = blockSize * BigInt(stats.bavail);
  return { totalBytes, availableBytes };
}

/** Sum of all users' storageUsedBytes */
export async function getTotalOccupiedSpace(): Promise<bigint> {
  const result = await prisma.user.aggregate({
    _sum: { storageUsedBytes: true },
  });
  return result._sum.storageUsedBytes ?? BigInt(0);
}

/** Sum of all users' storageQuotaBytes */
export async function getTotalAllocatedQuota(): Promise<bigint> {
  const result = await prisma.user.aggregate({
    _sum: { storageQuotaBytes: true },
  });
  return result._sum.storageQuotaBytes ?? BigInt(0);
}

/** Load the configured capacity from StoragePolicy (null = unlimited) */
export async function getConfiguredCapacity(): Promise<bigint | null> {
  const policy = await prisma.storagePolicy.findFirst();
  return policy?.totalDriveCapacityBytes ?? null;
}

/** Validate a new capacity setting */
export async function validateCapacitySetting(newCapacityBytes: bigint): Promise<{ valid: boolean; error?: string }> {
  const occupied = await getTotalOccupiedSpace();
  if (newCapacityBytes < occupied) {
    return { valid: false, error: `Cannot set capacity below currently occupied space (${occupied} bytes).` };
  }

  try {
    const disk = getPhysicalDiskSpace();
    const maxAllowed = disk.totalBytes - TWO_GB;
    if (newCapacityBytes > maxAllowed) {
      return { valid: false, error: `Cannot exceed physical disk space minus 2 GB buffer (max: ${maxAllowed} bytes).` };
    }
  } catch {
    // If we can't read disk stats (e.g. S3 storage), skip physical validation
  }

  return { valid: true };
}

/** Check if the server has total capacity for additional bytes */
export async function checkTotalCapacity(additionalBytes: bigint): Promise<boolean> {
  const capacity = await getConfiguredCapacity();
  if (capacity === null) return true; // no limit set
  const occupied = await getTotalOccupiedSpace();
  return occupied + additionalBytes <= capacity;
}

/** Proportionally reduce all user quotas to fit within a new capacity.
 *  Each user's quota is scaled down, but never below their actual used space. */
export async function proportionallyReduceQuotas(newCapacityBytes: bigint, preview = false) {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, storageQuotaBytes: true, storageUsedBytes: true },
  });

  const totalAllocated = users.reduce((sum, u) => sum + u.storageQuotaBytes, BigInt(0));
  if (totalAllocated <= newCapacityBytes) {
    return { adjusted: false, users: [] };
  }

  const ratio = Number(newCapacityBytes) / Number(totalAllocated);
  const adjustments = users.map((u) => {
    const scaled = BigInt(Math.floor(Number(u.storageQuotaBytes) * ratio));
    const newQuota = scaled < u.storageUsedBytes ? u.storageUsedBytes : scaled;
    return { id: u.id, oldQuota: u.storageQuotaBytes, newQuota, used: u.storageUsedBytes };
  });

  if (!preview) {
    await prisma.$transaction(
      adjustments.map((a) =>
        prisma.user.update({ where: { id: a.id }, data: { storageQuotaBytes: a.newQuota } })
      )
    );
  }

  return {
    adjusted: true,
    users: adjustments.map((a) => ({
      id: a.id,
      oldQuota: a.oldQuota.toString(),
      newQuota: a.newQuota.toString(),
      used: a.used.toString(),
    })),
  };
}
