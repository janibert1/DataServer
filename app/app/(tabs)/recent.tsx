import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useRecentFiles, useStarFile, useTrashFile } from '@/lib/hooks/use-files';
import { useUIStore } from '@/stores/ui-store';
import { DriveShell } from '@/components/layout/drive-shell';
import { FileList } from '@/components/file/file-list';
import { showFileActions } from '@/components/file/file-actions';
import { downloadAndShareFile } from '@/lib/hooks/use-download';
import type { DriveFile } from '@/lib/types';

// Matches frontend/src/pages/drive/RecentPage.tsx.
export default function RecentScreen() {
  const { viewMode } = useUIStore();
  const router = useRouter();
  const { data, isRefetching, refetch } = useRecentFiles();
  const starFile = useStarFile();
  const trashFile = useTrashFile();
  const files = data?.files ?? [];

  function handleFilePress(file: DriveFile) {
    router.push({ pathname: '/file-preview', params: { fileId: file.id, folderId: file.folderId ?? '' } });
  }

  function handleFileActions(file: DriveFile) {
    showFileActions(file, {
      onPreview: handleFilePress,
      onDownload: (f) => downloadAndShareFile(f.id),
      onStar: (f) => starFile.mutate(f.id),
      onTrash: (f) => trashFile.mutate(f.id),
    });
  }

  const header = (
    <Text className="text-xl font-bold text-slate-900 px-4 pt-4 pb-3">Recent</Text>
  );

  return (
    <DriveShell>
      <FileList
        folders={[]}
        files={files}
        viewMode={viewMode}
        refreshing={isRefetching}
        onRefresh={refetch}
        onFilePress={handleFilePress}
        onFileMorePress={handleFileActions}
        emptyTitle="No recent files"
        emptyDescription="Files you've recently accessed or modified will appear here"
        emptyIcon="time-outline"
        ListHeaderComponent={header}
      />
    </DriveShell>
  );
}
