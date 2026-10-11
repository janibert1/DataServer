import { FlatList, View, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { FileItem } from './file-item';
import { FolderItem } from './folder-item';
import { EmptyState } from '@/components/ui/empty-state';
import type { DriveFile, DriveFolder } from '@/lib/types';
import type { ViewMode } from '@/stores/ui-store';

interface FileListProps {
  folders: DriveFolder[];
  files: DriveFile[];
  viewMode: ViewMode;
  refreshing?: boolean;
  onRefresh?: () => void;
  onFilePress?: (file: DriveFile) => void;
  onFileLongPress?: (file: DriveFile) => void;
  onFileMorePress?: (file: DriveFile) => void;
  onFolderLongPress?: (folder: DriveFolder) => void;
  onFolderMorePress?: (folder: DriveFolder) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: string;
  ListHeaderComponent?: React.ReactElement;
}

type ListItem =
  | { type: 'folder'; data: DriveFolder }
  | { type: 'file'; data: DriveFile };

export function FileList({
  folders,
  files,
  viewMode,
  refreshing,
  onRefresh,
  onFilePress,
  onFileLongPress,
  onFileMorePress,
  onFolderLongPress,
  onFolderMorePress,
  emptyTitle = 'No files yet',
  emptyDescription,
  emptyIcon,
  ListHeaderComponent,
}: FileListProps) {
  const router = useRouter();

  const items: ListItem[] = [
    ...folders.map((f) => ({ type: 'folder' as const, data: f })),
    ...files.map((f) => ({ type: 'file' as const, data: f })),
  ];

  if (items.length === 0 && !ListHeaderComponent) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={emptyIcon as never}
      />
    );
  }

  const isGrid = viewMode === 'grid';
  const numColumns = isGrid ? 2 : 1;

  return (
    <FlatList
      key={viewMode}
      data={items}
      numColumns={numColumns}
      keyExtractor={(item) => `${item.type}-${item.data.id}`}
      contentContainerStyle={isGrid ? { padding: 12, gap: 12 } : undefined}
      columnWrapperStyle={isGrid ? { gap: 12 } : undefined}
      ListHeaderComponent={ListHeaderComponent}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor="#2563eb" />
        ) : undefined
      }
      ListEmptyComponent={
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          icon={emptyIcon as never}
        />
      }
      // Extra padding at bottom so FAB doesn't cover last items
      ListFooterComponent={<View style={{ height: 80 }} />}
      renderItem={({ item }) => {
        if (item.type === 'folder') {
          return (
            <View style={isGrid ? { flex: 1 } : undefined}>
              <FolderItem
                folder={item.data}
                viewMode={viewMode}
                onPress={() => router.push(`/folder/${item.data.id}`)}
                onLongPress={() => onFolderLongPress?.(item.data)}
                onMorePress={() => onFolderMorePress?.(item.data)}
              />
            </View>
          );
        }
        return (
          <View style={isGrid ? { flex: 1 } : undefined}>
            <FileItem
              file={item.data}
              viewMode={viewMode}
              onPress={() => onFilePress?.(item.data)}
              onLongPress={() => onFileLongPress?.(item.data)}
              onMorePress={() => onFileMorePress?.(item.data)}
            />
          </View>
        );
      }}
    />
  );
}
