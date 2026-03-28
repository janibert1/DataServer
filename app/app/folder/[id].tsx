import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFolder, useFolderContents } from '@/lib/hooks/use-folders';
import { useUIStore } from '@/stores/ui-store';
import { FileList } from '@/components/file/file-list';
import { Breadcrumb } from '@/components/file/breadcrumb';
import { SortControls } from '@/components/file/sort-controls';
import { PermissionBadge } from '@/components/ui/badge';
import { getFolder } from '@/lib/api/folders';
import type { DriveFile, Permission } from '@/lib/types';

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { viewMode } = useUIStore();
  const [ancestors, setAncestors] = useState<Array<{ id: string; name: string }>>([]);

  const { data: folderData } = useFolder(id);
  const { data: contentsData, refetch, isRefetching } = useFolderContents(id);

  const folder = folderData?.folder;
  const permission = contentsData?.permission ?? ('VIEWER' as Permission);
  const folders = contentsData?.folders ?? [];
  const files = contentsData?.files ?? [];

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

  function handleFilePress(file: DriveFile) {
    router.push({ pathname: '/file-preview', params: { fileId: file.id, folderId: id } });
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
    <>
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
            emptyTitle="This folder is empty"
            emptyIcon="folder-open-outline"
            ListHeaderComponent={header}
          />
        )}
      </View>
    </>
  );
}
