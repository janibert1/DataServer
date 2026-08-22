import { View, Text, Alert } from 'react-native';
import { useTrashedFiles, useRestoreFile, usePermanentDeleteFile, useEmptyTrash } from '@/lib/hooks/use-files';
import { useUIStore } from '@/stores/ui-store';
import { DriveShell } from '@/components/layout/drive-shell';
import { FileList } from '@/components/file/file-list';
import { Button } from '@/components/ui/button';
import { showConfirm } from '@/components/ui/confirm-dialog';
import type { DriveFile } from '@/lib/types';

// Matches frontend/src/pages/drive/TrashPage.tsx.
export default function TrashScreen() {
  const { viewMode } = useUIStore();
  const { data, refetch, isRefetching } = useTrashedFiles();
  const restoreFile = useRestoreFile();
  const permanentDelete = usePermanentDeleteFile();
  const emptyTrash = useEmptyTrash();

  const files = data?.files ?? [];

  function handleFileLongPress(file: DriveFile) {
    Alert.alert(file.name, undefined, [
      {
        text: 'Restore',
        onPress: () => restoreFile.mutate(file.id),
      },
      {
        text: 'Delete Permanently',
        style: 'destructive',
        onPress: () =>
          showConfirm({
            title: 'Delete Permanently',
            message: `"${file.name}" will be permanently deleted. This cannot be undone.`,
            confirmText: 'Delete',
            destructive: true,
            onConfirm: () => permanentDelete.mutate(file.id),
          }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const header = (
    <View>
      <Text className="text-xl font-bold text-slate-900 px-4 pt-4 pb-3">Trash</Text>
      {files.length > 0 && (
        <View className="px-4 pb-3 flex-row items-center justify-between">
          <Text className="text-sm text-slate-500">{files.length} item{files.length !== 1 ? 's' : ''} in trash</Text>
          <Button
            variant="destructive"
            size="sm"
            title="Empty Trash"
            onPress={() =>
              showConfirm({
                title: 'Empty Trash',
                message: `Permanently delete all ${files.length} items? This cannot be undone.`,
                confirmText: 'Empty Trash',
                destructive: true,
                onConfirm: () => emptyTrash.mutate(),
              })
            }
          />
        </View>
      )}
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
        onFileMorePress={handleFileLongPress}
        emptyTitle="Trash is empty"
        emptyDescription="Items you delete will appear here"
        emptyIcon="trash-outline"
        ListHeaderComponent={header}
      />
    </DriveShell>
  );
}
