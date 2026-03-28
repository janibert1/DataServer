import { downloadAsync, cacheDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getFileDownloadUrl } from '@/lib/api/files';

export async function downloadAndShareFile(fileId: string) {
  // Step 1: Call the API endpoint (with session cookie) to get the signed S3 URL
  const { downloadUrl, filename } = await getFileDownloadUrl(fileId);

  // Step 2: Download from the signed S3 URL (no auth needed, credentials are in the URL)
  if (!cacheDirectory) throw new Error('Cache directory not available');
  const localUri = cacheDirectory + filename;

  const downloadResult = await downloadAsync(downloadUrl, localUri);

  if (downloadResult.status !== 200) {
    throw new Error(`Download failed with status ${downloadResult.status}`);
  }

  // Step 3: Open the iOS share sheet
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(downloadResult.uri, {
      mimeType: downloadResult.headers?.['content-type'] || 'application/octet-stream',
      dialogTitle: `Share ${filename}`,
      UTI: undefined,
    });
  }

  return downloadResult.uri;
}
