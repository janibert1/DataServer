import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFolder, useFolderContents, useStarFolder, useTrashFolder } from '@/lib/hooks/use-folders';
import { useStarFile, useTrashFile } from '@/lib/hooks/use-files';
import { useUIStore } from '@/stores/ui-store';
import { FileList } from '@/components/file/file-list';
import { Breadcrumb } from '@/components/file/breadcrumb';
import { SortControls } from '@/components/file/sort-controls';
import { UploadButton } from '@/components/file/upload-button';
import { CreateFolderModal } from '@/components/file/create-folder-modal';
import { RenameModal } from '@/components/file/rename-modal';
import { AutoCreateFolderModal } from '@/components/file/auto-create-folder-modal';
import { DragDropProvider, DragItem } from '@/components/file/drag-drop-context';
import { PermissionBadge } from '@/components/ui/badge';
import { showFileActions, showFolderActions } from '@/components/file/file-actions';
import { ShareModal } from '@/components/share/share-modal';
import { downloadAndShareFile } from '@/lib/hooks/use-download';
import { useMoveFile } from '@/lib/hooks/use-files';
import { useMoveFolder, useCreateFolder } from '@/lib/hooks/use-folders';
import { getFolder } from '@/lib/api/folders';
import type { DriveFile, DriveFolder, Permission } from '@/lib/types';

export default function FolderScreen() {
  const { id, share } = useLocalSearchParams<{ id: string; share?: string }>();
  const router = useRouter();
  const { viewMode } = useUIStore();
  const [ancestors, setAncestors] = useState<Array<{ id: string; name: string }>>([]);
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [renameItem, setRenameItem] = useState<{ id: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [autoCreateFolder, setAutoCreateFolder] = useState<{ dragged: DragItem; target: DragItem } | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);

  const { data: folderData } = useFolder(id);
  const { data: contentsData, refetch, isRefetching } = useFolderContents(id);
  const starFile = useStarFile();
  const trashFile = useTrashFile();
  const starFolder = useStarFolder();
  const trashFolder = useTrashFolder();
  const moveFileMut = useMoveFile();
  const moveFolderMut = useMoveFolder();
  const createFolderMut = useCreateFolder();

  const folder = folderData?.folder;
  const permission = contentsData?.permission ?? ('VIEWER' as Permission);
  const folders = contentsData?.folders ?? [];
  const files = contentsData?.files ?? [];

  // Auto-open share modal when navigated with share=1
  useEffect(() => {
    if (share === '1') setShareModalVisible(true);
  }, [share]);

  // Build breadcrumb by walking up parent chain
  useEffect(() => {
    if (!folder) return;
    let cancelled = false;

    async function buildBreadcrumb() {
      const trail: Array<{ id: string; name: string }> = [];
      let parentId = folder!.parentId;
      while (parentId) {
        try {
          const { folder: parent } = await getFolder(parentId);
          trail.unshift({ id: parent.id, name: parent.name });
          parentId = parent.parentId;
        } catch {
          break;
        }
      }
      if (!cancelled) setAncestors(trail);
    }

    buildBreadcrumb();
    return () => { cancelled = true; };
  }, [folder?.id, folder?.parentId]);

  const canUpload = permission !== 'VIEWER' && permission !== 'DOWNLOADER';

  function handleFilePress(file: DriveFile) {
    router.push({ pathname: '/file-preview', params: { fileId: file.id, folderId: id } });
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
    createFolderMut.mutate({ name: folderName, parentId: id }, {
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

  const header = (
    <View>
      {folder && <Breadcrumb ancestors={ancestors} current={folder.name} />}
      {permission !== 'OWNER' && (
        <View className="px-4 py-2">
          <PermissionBadge permission={permission} />
        </View>
      )}
      <SortControls />
    </View>
  );

  return (
    <DragDropProvider onDropOnFolder={handleDropOnFolder} onDropOnItem={handleDropOnItem}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: folder?.name ?? 'Folder',
          headerBackTitle: 'Back',
        }}
      />
      <View className="flex-1 bg-slate-50">
        {!contentsData ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : (
          <FileList
            folders={folders}
            files={files}
            viewMode={viewMode}
            refreshing={isRefetching}
            onRefresh={refetch}
            onFilePress={handleFilePress}
            onFileMorePress={handleFileActions}
            onFolderMorePress={handleFolderActions}
            emptyTitle="This folder is empty"
            emptyIcon="folder-open-outline"
            ListHeaderComponent={header}
          />
        )}
        {canUpload && (
          <UploadButton folderId={id} onCreateFolder={() => setCreateFolderVisible(true)} />
        )}
        <CreateFolderModal visible={createFolderVisible} onClose={() => setCreateFolderVisible(false)} parentId={id} />
        <RenameModal visible={!!renameItem} onClose={() => setRenameItem(null)} item={renameItem} />
        <AutoCreateFolderModal
          visible={!!autoCreateFolder}
          onClose={() => setAutoCreateFolder(null)}
          onConfirm={handleAutoCreateFolder}
          isPending={createFolderMut.isPending}
        />
        <ShareModal
          visible={shareModalVisible}
          onClose={() => {
            setShareModalVisible(false);
            router.setParams({ share: undefined });
          }}
          folderId={id}
          folderName={folder?.name ?? ''}
        />
      </View>
    </DragDropProvider>
  );
}
