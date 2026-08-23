import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useStarredFiles, useStarFile, useTrashFile } from '@/lib/hooks/use-files';
import { useUIStore } from '@/stores/ui-store';
import { DriveShell } from '@/components/layout/drive-shell';
import { FileList } from '@/components/file/file-list';
import { SortControls } from '@/components/file/sort-controls';
import { showFileActions } from '@/components/file/file-actions';
import { downloadAndShareFile } from '@/lib/hooks/use-download';
import type { DriveFile } from '@/lib/types';

// Matches frontend/src/pages/drive/StarredPage.tsx.
export default function StarredScreen() {
  const { viewMode } = useUIStore();
  const router = useRouter();
  const { data, refetch, isRefetching } = useStarredFiles();
  const starFile = useStarFile();
  const trashFile = useTrashFile();
  const files = data?.files ?? [];

  function handleFilePress(file: DriveFile) {
    // fileIds: the current list's own file order, so the preview screen's
    // prev/next buttons page through what's actually on screen (starred
    // files, not that file's parent folder's contents).
    router.push({ pathname: '/file-preview', params: { fileId: file.id, folderId: file.folderId ?? '', fileIds: files.map((f) => f.id).join(',') } });
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
    <View>
      <Text className="text-xl font-bold text-slate-900 px-4 pt-4 pb-3">Starred</Text>
      <SortControls />
    </View>
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
        emptyTitle="No starred items"
        emptyDescription="Star files and folders for quick access"
        emptyIcon="star-outline"
        ListHeaderComponent={header}
      />
    </DriveShell>
  );
}
