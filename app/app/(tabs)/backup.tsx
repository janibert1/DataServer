import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Archive, ChevronRight, Folder, File as FileIconLucide, MoveRight, Trash2, Download, Home } from 'lucide-react-native';
import { DriveShell } from '@/components/layout/drive-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { formatFileSize } from '@/lib/format';
import {
  useBackupRoot, useBackupFolder, usePromoteBackupFile, usePromoteBackupFolder,
  useDeleteBackupFile, useDeleteBackupFolder,
} from '@/lib/hooks/use-backup';
import { getFileDownloadUrl } from '@/lib/api/files';
import type { BackupFile, BackupFolder } from '@/lib/api/backup';

// Matches frontend/src/pages/drive/BackupPage.tsx.
interface Crumb { id: string | null; name: string }

export default function BackupScreen() {
  const router = useRouter();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([{ id: null, name: 'Backups' }]);

  const rootQuery = useBackupRoot();
  const folderQuery = useBackupFolder(currentFolderId);
  const promoteFile = usePromoteBackupFile();
  const promoteFolder = usePromoteBackupFolder();
  const deleteFile = useDeleteBackupFile();
  const deleteFolder = useDeleteBackupFolder();

  const isLoading = currentFolderId === null ? rootQuery.isLoading : folderQuery.isLoading;
  const folders = currentFolderId === null ? (rootQuery.data?.folders ?? []) : (folderQuery.data?.folders ?? []);
  const files = currentFolderId === null ? (rootQuery.data?.files ?? []) : (folderQuery.data?.files ?? []);
  const isEmpty = !isLoading && folders.length === 0 && files.length === 0;

  function openFolder(folder: BackupFolder) {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  }

  function navigateTo(crumb: Crumb) {
    setCurrentFolderId(crumb.id);
    const idx = breadcrumbs.findIndex((b) => b.id === crumb.id);
    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
  }

  async function downloadFile(file: BackupFile) {
    try {
      const { downloadUrl, filename } = await getFileDownloadUrl(file.id);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        a.click();
      } else {
        await Linking.openURL(downloadUrl);
      }
    } catch {
      Alert.alert('Download failed');
    }
  }

  function confirmDeleteFolder(folder: BackupFolder) {
    Alert.alert('Delete backup folder', `Delete "${folder.name}" and all its contents?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteFolder.mutate(folder.id) },
    ]);
  }

  function confirmDeleteFile(file: BackupFile) {
    Alert.alert('Delete backup file', `Delete "${file.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteFile.mutate(file.id) },
    ]);
  }

  return (
    <DriveShell>
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View className="flex-row items-center gap-3 px-4 pt-4 pb-3">
          <View className="w-9 h-9 rounded-xl bg-amber-100 items-center justify-center">
            <Archive size={18} color="#d97706" />
          </View>
          <View className="flex-1">
            <Text className="text-xl font-bold text-slate-900">Backups</Text>
            <Text className="text-xs text-slate-500 mt-0.5">Read-only snapshots synced from your devices</Text>
          </View>
        </View>

        {breadcrumbs.length > 1 && (
          <View className="flex-row items-center flex-wrap gap-1 px-4 pb-3">
            {breadcrumbs.map((crumb, i) => (
              <View key={crumb.id ?? 'root'} className="flex-row items-center gap-1">
                {i > 0 && <ChevronRight size={13} color="#cbd5e1" />}
                <TouchableOpacity onPress={() => navigateTo(crumb)} className="flex-row items-center gap-1 px-1.5 py-0.5">
                  {i === 0 && <Home size={11} color={i === breadcrumbs.length - 1 ? '#0f172a' : '#94a3b8'} />}
                  <Text className={`text-sm ${i === breadcrumbs.length - 1 ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                    {crumb.name}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {isLoading ? (
          <View className="py-20 items-center"><ActivityIndicator color="#94a3b8" /></View>
        ) : isEmpty ? (
          <EmptyState
            icon="archive-outline"
            title="No backups yet"
            description="Install the DataServer Backup app on your computer to start syncing files here"
          />
        ) : (
          <View className="px-2 pb-6 gap-0.5">
            {folders.map((folder) => (
              <View key={folder.id} className="flex-row items-center gap-3 px-3 py-2.5 rounded-lg">
                <Folder size={18} color="#fbbf24" />
                <TouchableOpacity className="flex-1" onPress={() => openFolder(folder)}>
                  <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>{folder.name}</Text>
                </TouchableOpacity>
                <Text className="text-xs text-slate-400 mr-1">{folder.fileCount} files</Text>
                <TouchableOpacity onPress={() => promoteFolder.mutate(folder.id)} className="p-1.5">
                  <MoveRight size={16} color="#d97706" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDeleteFolder(folder)} className="p-1.5">
                  <Trash2 size={16} color="#f87171" />
                </TouchableOpacity>
              </View>
            ))}
            {files.map((file) => (
              <View key={file.id} className="flex-row items-center gap-3 px-3 py-2.5 rounded-lg">
                <FileIconLucide size={18} color="#94a3b8" />
                <View className="flex-1">
                  <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>{file.name}</Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-slate-400">{formatFileSize(Number(file.size))}</Text>
                    {file.backupSource && (
                      <View className="bg-amber-50 px-1.5 py-0.5 rounded">
                        <Text className="text-xs text-amber-600">{file.backupSource}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity onPress={() => downloadFile(file)} className="p-1.5">
                  <Download size={16} color="#94a3b8" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => promoteFile.mutate(file.id)} className="p-1.5">
                  <MoveRight size={16} color="#d97706" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDeleteFile(file)} className="p-1.5">
                  <Trash2 size={16} color="#f87171" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </DriveShell>
  );
}
