import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useFiles, useRecentFiles, useStarFile, useTrashFile } from '@/lib/hooks/use-files';
import { useFolders, useStarFolder, useTrashFolder } from '@/lib/hooks/use-folders';
import { useUIStore } from '@/stores/ui-store';
import { FileList } from '@/components/file/file-list';
import { SortControls } from '@/components/file/sort-controls';
import { SearchBar } from '@/components/ui/search-bar';
import { UploadButton } from '@/components/file/upload-button';
import { CreateFolderModal } from '@/components/file/create-folder-modal';
import { RenameModal } from '@/components/file/rename-modal';
import { AutoCreateFolderModal } from '@/components/file/auto-create-folder-modal';
import { DragDropProvider, DragItem } from '@/components/file/drag-drop-context';
import { showFileActions, showFolderActions } from '@/components/file/file-actions';
import { downloadAndShareFile } from '@/lib/hooks/use-download';
import { useMoveFile } from '@/lib/hooks/use-files';
import { useMoveFolder, useCreateFolder } from '@/lib/hooks/use-folders';
import type { DriveFile, DriveFolder } from '@/lib/types';

export default function MyDriveScreen() {
  const [search, setSearch] = useState('');
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [renameItem, setRenameItem] = useState<{ id: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [autoCreateFolder, setAutoCreateFolder] = useState<{ dragged: DragItem; target: DragItem } | null>(null);
  const moveFileMut = useMoveFile();
  const moveFolderMut = useMoveFolder();
  const createFolderMut = useCreateFolder();
  const { viewMode, sortField, sortDirection } = useUIStore();
  const router = useRouter();

  const { data: foldersData, refetch: refetchFolders, isRefetching: foldersRefetching } = useFolders(null);
  const { data: filesData, refetch: refetchFiles, isRefetching: filesRefetching } = useFiles({
    search: search || undefined,
    sortBy: sortField,
    sortDir: sortDirection,
  });
  const { data: recentData } = useRecentFiles();

  const starFile = useStarFile();
  const trashFile = useTrashFile();
  const starFolder = useStarFolder();
  const trashFolder = useTrashFolder();

  const folders = foldersData?.folders ?? [];
  const files = filesData?.files ?? [];
  const recentFiles = recentData?.files ?? [];
  const refreshing = foldersRefetching || filesRefetching;

  const handleRefresh = useCallback(() => {
    refetchFolders();
    refetchFiles();
  }, []);

  function handleFilePress(file: DriveFile) {
    router.push({ pathname: '/file-preview', params: { fileId: file.id, folderId: file.folderId ?? '' } });
  }

  function handleFileActions(file: DriveFile) {
    showFileActions(file, {
      onPreview: handleFilePress,
      onDownload: (f) => downloadAndShareFile(f.id),
      onRename: (f) => setRenameItem({ id: f.id, name: f.name, type: 'file' }),
      onStar: (f) => starFile.mutate(f.id),
      onTrash: (f) => trashFile.mutate(f.id),
    });
  }

  function handleFolderActions(folder: DriveFolder) {
    showFolderActions(folder, {
      onOpen: (f) => router.push(`/folder/${f.id}`),
      onRename: (f) => setRenameItem({ id: f.id, name: f.name, type: 'folder' }),
      onStar: (f) => starFolder.mutate(f.id),
      onShare: (f) => router.push({ pathname: '/folder/[id]', params: { id: f.id, share: '1' } }),
      onTrash: (f) => trashFolder.mutate(f.id),
    });
  }

  const header = (
    <View>
      <View className="px-4 py-3">
        <SearchBar value={search} onChangeText={setSearch} />
      </View>

      {!search && recentFiles.length > 0 && (
        <View className="mb-2">
          <Text className="text-sm font-semibold text-slate-600 px-4 mb-2">Quick Access</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="px-4 gap-3"
          >
            {recentFiles.slice(0, 8).map((file) => (
              <TouchableOpacity
                key={file.id}
                className="w-36 bg-white rounded-lg border border-slate-100 p-3 shadow-sm"
                onPress={() => handleFilePress(file)}
              >
                <Text className="text-xs font-medium text-slate-700" numberOfLines={1}>
                  {file.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <SortControls />
    </View>
  );

  function handleDropOnFolder(dragged: DragItem, targetFolderId: string) {
    if (dragged.type === 'file') moveFileMut.mutate({ id: dragged.id, folderId: targetFolderId });
    else moveFolderMut.mutate({ id: dragged.id, parentId: targetFolderId });
  }

  function handleDropOnItem(dragged: DragItem, target: DragItem) {
    setAutoCreateFolder({ dragged, target });
  }

  function handleAutoCreateFolder(folderName: string) {
    if (!autoCreateFolder) return;
    const { dragged, target } = autoCreateFolder;
    createFolderMut.mutate({ name: folderName }, {
      onSuccess: (res: any) => {
        const newFolderId = res.folder.id;
        if (dragged.type === 'file') moveFileMut.mutate({ id: dragged.id, folderId: newFolderId });
        else moveFolderMut.mutate({ id: dragged.id, parentId: newFolderId });
        if (target.type === 'file') moveFileMut.mutate({ id: target.id, folderId: newFolderId });
        else moveFolderMut.mutate({ id: target.id, parentId: newFolderId });
        setAutoCreateFolder(null);
      },
    });
  }

  return (
    <DragDropProvider onDropOnFolder={handleDropOnFolder} onDropOnItem={handleDropOnItem}>
    <View className="flex-1 bg-slate-50">
      <FileList
        folders={search ? [] : folders}
        files={files}
        viewMode={viewMode}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onFilePress={handleFilePress}
        onFileMorePress={handleFileActions}
        onFolderMorePress={handleFolderActions}
        emptyTitle="Your drive is empty"
        emptyDescription="Upload files to get started"
        emptyIcon="cloud-upload-outline"
        ListHeaderComponent={header}
      />
      <UploadButton onCreateFolder={() => setCreateFolderVisible(true)} />
      <CreateFolderModal visible={createFolderVisible} onClose={() => setCreateFolderVisible(false)} />
      <RenameModal visible={!!renameItem} onClose={() => setRenameItem(null)} item={renameItem} />
      <AutoCreateFolderModal
        visible={!!autoCreateFolder}
        onClose={() => setAutoCreateFolder(null)}
        onConfirm={handleAutoCreateFolder}
        isPending={createFolderMut.isPending}
      />
    </View>
    </DragDropProvider>
  );
}
