import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStarredFiles } from '@/lib/hooks/use-files';
import { useUIStore } from '@/stores/ui-store';
import { FileList } from '@/components/file/file-list';
import { SortControls } from '@/components/file/sort-controls';
import type { DriveFile } from '@/lib/types';

export default function StarredScreen() {
  const { viewMode } = useUIStore();
  const router = useRouter();
  const { data, refetch, isRefetching } = useStarredFiles();
  const files = data?.files ?? [];

  function handleFilePress(file: DriveFile) {
    router.push({ pathname: '/file-preview', params: { fileId: file.id, folderId: file.folderId ?? '' } });
  }

  return (
    <View className="flex-1 bg-slate-50">
      <FileList
        folders={[]}
        files={files}
        viewMode={viewMode}
        refreshing={isRefetching}
        onRefresh={refetch}
        onFilePress={handleFilePress}
        emptyTitle="No starred items"
        emptyDescription="Star files and folders for quick access"
        emptyIcon="star-outline"
        ListHeaderComponent={<SortControls />}
      />
    </View>
  );
}
