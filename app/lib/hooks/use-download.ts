import { downloadAsync, cacheDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';
import { getFileDownloadUrl } from '@/lib/api/files';

export async function downloadAndShareFile(fileId: string) {
  let filename = 'file';

  try {
    // Step 1: Get the signed S3 URL
    const data = await getFileDownloadUrl(fileId);
    const { downloadUrl } = data;
    filename = data.filename;

    Toast.show({ type: 'info', text1: 'Downloading...', text2: filename, autoHide: false });

    // Step 2: Download from the signed S3 URL
    if (!cacheDirectory) throw new Error('Cache directory not available');
    const localUri = cacheDirectory + filename;

    const downloadResult = await downloadAsync(downloadUrl, localUri);

    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status ${downloadResult.status}`);
    }

    Toast.hide();
    Toast.show({ type: 'success', text1: 'Download complete', text2: filename });

    // Step 3: Open the native share sheet
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: downloadResult.headers?.['content-type'] || 'application/octet-stream',
        dialogTitle: `Share ${filename}`,
        UTI: undefined,
      });
    }

    return downloadResult.uri;
  } catch (error) {
    Toast.hide();
    Toast.show({
      type: 'error',
      text1: 'Download failed',
      text2: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
