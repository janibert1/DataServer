import { prisma } from '../lib/prisma';

export async function checkQuota(userId: string, additionalBytes: bigint): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { storageUsedBytes: true, storageQuotaBytes: true },
  });
  if (!user) return false;
  return user.storageUsedBytes + additionalBytes <= user.storageQuotaBytes;
}

export async function incrementUsage(userId: string, bytes: bigint): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { storageUsedBytes: { increment: bytes } },
  });
}

export async function decrementUsage(userId: string, bytes: bigint): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      storageUsedBytes: {
        decrement: bytes,
      },
    },
  });
}

export async function decrementUsageTotal(userId: string, totalBytes: bigint): Promise<void> {
  if (totalBytes <= 0) return;
  await prisma.user.update({
    where: { id: userId },
    data: { storageUsedBytes: { decrement: totalBytes } },
  });
}

export async function getUserQuotaInfo(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      storageUsedBytes: true,
      storageQuotaBytes: true,
    },
  });
  if (!user) throw new Error('User not found.');

  const used = Number(user.storageUsedBytes);
  const total = Number(user.storageQuotaBytes);
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;

  return { used, total, percent };
}
