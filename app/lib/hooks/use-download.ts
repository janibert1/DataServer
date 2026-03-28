import { createDownloadResumable, cacheDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getFileDownloadUrl } from '@/lib/api/files';
import { useDownloadStore } from '@/stores/download-store';

export async function downloadAndShareFile(fileId: string) {
  const { addDownload, updateDownload } = useDownloadStore.getState();
  let downloadId = '';
  let filename = 'file';

  try {
    const data = await getFileDownloadUrl(fileId);
    const { downloadUrl } = data;
    filename = data.filename;

    downloadId = addDownload(filename);
    updateDownload(downloadId, { status: 'downloading' });

    if (!cacheDirectory) throw new Error('Cache directory not available');
    const localUri = cacheDirectory + filename;

    const download = createDownloadResumable(
      downloadUrl,
      localUri,
      {},
      (progress) => {
        if (progress.totalBytesExpectedToWrite > 0) {
          updateDownload(downloadId, {
            progress: progress.totalBytesWritten / progress.totalBytesExpectedToWrite,
            fileSize: progress.totalBytesExpectedToWrite,
          });
        }
      },
    );

    const result = await download.downloadAsync();
    if (!result || result.status !== 200) {
      throw new Error(`Download failed with status ${result?.status ?? 'unknown'}`);
    }

    updateDownload(downloadId, { status: 'complete', progress: 1 });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(result.uri, {
        mimeType: result.headers?.['content-type'] || 'application/octet-stream',
        dialogTitle: `Share ${filename}`,
        UTI: undefined,
      });
    }

    return result.uri;
  } catch (error) {
    if (downloadId) {
      updateDownload(downloadId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Download failed',
      });
    }
    throw error;
  }
}
