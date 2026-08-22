import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderPlus, Sparkles, Clock, X } from 'lucide-react-native';
import { useFiles, useRecentFiles, useStarFile, useTrashFile } from '@/lib/hooks/use-files';
import { useFolders, useStarFolder, useTrashFolder } from '@/lib/hooks/use-folders';
import { useAiSort, useAiSortStatus } from '@/lib/hooks/use-ai-sort';
import { useUIStore } from '@/stores/ui-store';
import { DriveShell } from '@/components/layout/drive-shell';
import { FileList } from '@/components/file/file-list';
import { SortControls } from '@/components/file/sort-controls';
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

// Matches frontend/src/pages/drive/MyDrivePage.tsx's header row (New folder
// / AI Sort / Upload buttons) and Quick access section -- the rest of that
// page's bulk-select/drag-drop UI is web-desktop-specific and has no direct
// mobile equivalent, skipped rather than force-fit.
function AiSortModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  const aiSort = useAiSort();

  function handleStart() {
    aiSort.mutate({ prompt: prompt.trim() || undefined }, { onSuccess: onClose });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable className="bg-white rounded-t-2xl p-6" onPress={(e) => e.stopPropagation()}>
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <Sparkles size={18} color="#7c3aed" />
              <Text className="text-lg font-bold text-slate-900">AI Sort</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <Text className="text-sm text-slate-500 mb-4">
            AI will organize your files into folders. Optionally tell it how you'd like things sorted.
          </Text>
          <TextInput
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-900 mb-4"
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g. group by date and file type"
            placeholderTextColor="#94a3b8"
            multiline
          />
          <TouchableOpacity
            onPress={handleStart}
            disabled={aiSort.isPending}
            className={`w-full py-2.5 bg-violet-600 rounded-lg items-center ${aiSort.isPending ? 'opacity-60' : ''}`}
          >
            <Text className="text-white text-sm font-semibold">{aiSort.isPending ? 'Starting…' : 'Start sorting'}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function MyDriveScreen() {
  const [search, setSearch] = useState('');
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [aiSortVisible, setAiSortVisible] = useState(false);
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
  const { data: aiSortStatus } = useAiSortStatus();

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
      <View className="flex-row items-center justify-between gap-3 px-4 pt-4 pb-3">
        <Text className="text-xl font-bold text-slate-900">My Drive</Text>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => setCreateFolderVisible(true)}
            className="flex-row items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg"
          >
            <FolderPlus size={15} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAiSortVisible(true)}
            disabled={aiSortStatus?.status === 'processing'}
            className={`flex-row items-center gap-1.5 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg ${aiSortStatus?.status === 'processing' ? 'opacity-50' : ''}`}
          >
            <Sparkles size={15} color="#6d28d9" />
          </TouchableOpacity>
          <UploadButton variant="inline" folderId={undefined} />
        </View>
      </View>

      {aiSortStatus?.status === 'processing' && (
        <View className="flex-row items-center gap-3 mx-4 mb-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl">
          <Sparkles size={16} color="#8b5cf6" />
          <Text className="text-sm font-medium text-violet-800 flex-1">AI is sorting your files… You'll be notified when done.</Text>
        </View>
      )}

      {!search && recentFiles.length > 0 && (
        <View className="mb-2">
          <View className="flex-row items-center gap-2 px-4 mb-2">
            <Clock size={14} color="#94a3b8" />
            <Text className="text-sm font-semibold text-slate-700">Quick access</Text>
          </View>
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
      <DriveShell search={search} onSearchChange={setSearch}>
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
        <CreateFolderModal visible={createFolderVisible} onClose={() => setCreateFolderVisible(false)} />
        <AiSortModal visible={aiSortVisible} onClose={() => setAiSortVisible(false)} />
        <RenameModal visible={!!renameItem} onClose={() => setRenameItem(null)} item={renameItem} />
        <AutoCreateFolderModal
          visible={!!autoCreateFolder}
          onClose={() => setAutoCreateFolder(null)}
          onConfirm={handleAutoCreateFolder}
          isPending={createFolderMut.isPending}
        />
      </DriveShell>
    </DragDropProvider>
  );
}
