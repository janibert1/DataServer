import { View, Text, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Alert, Platform, Linking } from 'react-native';
import { Download, Trash2, RefreshCw, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react-native';
import { DriveShell } from '@/components/layout/drive-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { formatFileSize, formatDate } from '@/lib/format';
import { useDownloads, useDeleteDownload } from '@/lib/hooks/use-downloads';
import { getDownloadUrl } from '@/lib/api/downloads';
import type { ZipDownload } from '@/lib/api/downloads';

// Matches frontend/src/pages/drive/DownloadsPage.tsx.
function StatusBadge({ status }: { status: ZipDownload['status'] }) {
  const map: Record<ZipDownload['status'], { icon: React.ElementType; bg: string; text: string; label: string; color: string }> = {
    READY: { icon: CheckCircle, bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Ready', color: '#047857' },
    PROCESSING: { icon: Loader2, bg: 'bg-blue-50', text: 'text-blue-700', label: 'Processing', color: '#1d4ed8' },
    QUEUED: { icon: Clock, bg: 'bg-amber-50', text: 'text-amber-700', label: 'Queued', color: '#b45309' },
    FAILED: { icon: XCircle, bg: 'bg-red-50', text: 'text-red-700', label: 'Failed', color: '#b91c1c' },
  };
  const { icon: Icon, bg, text, label, color } = map[status];
  return (
    <View className={`flex-row items-center gap-1 ${bg} px-2 py-0.5 rounded-full`}>
      <Icon size={11} color={color} />
      <Text className={`text-xs font-medium ${text}`}>{label}</Text>
    </View>
  );
}

function DownloadRow({ item }: { item: ZipDownload }) {
  const deleteDownload = useDeleteDownload();

  async function handleDownload() {
    try {
      const { url } = await getDownloadUrl(item.id);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${item.name}.zip`;
        a.click();
      } else {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert('Failed to get download link');
    }
  }

  function handleDelete() {
    Alert.alert('Remove download', `Remove "${item.name}.zip" from this list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteDownload.mutate(item.id) },
    ]);
  }

  return (
    <View className="flex-row items-center gap-3 mx-4 mb-2 p-4 bg-white rounded-xl border border-slate-200">
      <View className="w-10 h-10 rounded-lg bg-brand-50 items-center justify-center">
        <Download size={18} color="#2563eb" />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-sm font-medium text-slate-900" numberOfLines={1}>{item.name}.zip</Text>
          <StatusBadge status={item.status} />
        </View>
        <View className="flex-row items-center gap-2 mt-0.5">
          {item.fileCount !== null && (
            <Text className="text-xs text-slate-500">{item.fileCount} file{item.fileCount !== 1 ? 's' : ''}</Text>
          )}
          {item.sizeBytes !== null && (
            <Text className="text-xs text-slate-500">{formatFileSize(Number(item.sizeBytes))}</Text>
          )}
          <Text className="text-xs text-slate-500">{formatDate(item.createdAt)}</Text>
        </View>
        {item.errorMessage && <Text className="text-xs text-red-500 mt-0.5">{item.errorMessage}</Text>}
      </View>
      <View className="flex-row items-center gap-1">
        {item.status === 'READY' && (
          <TouchableOpacity onPress={handleDownload} className="flex-row items-center gap-1.5 px-3 py-1.5 bg-brand-600 rounded-lg">
            <Download size={13} color="white" />
            <Text className="text-white text-xs font-semibold">Download</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleDelete} className="p-1.5">
          <Trash2 size={16} color="#94a3b8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function DownloadsScreen() {
  const { downloads, isLoading, isRefetching, refetch } = useDownloads();

  return (
    <DriveShell>
      <FlatList
        data={downloads}
        keyExtractor={(item: ZipDownload) => item.id}
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2563eb" />}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
            <View>
              <Text className="text-xl font-bold text-slate-900">Downloads</Text>
              <Text className="text-sm text-slate-500 mt-0.5">Prepared archives are kept for 2 days</Text>
            </View>
            <TouchableOpacity onPress={() => refetch()} className="p-2 rounded-lg">
              <RefreshCw size={16} color="#64748b" />
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="py-24 items-center"><ActivityIndicator color="#94a3b8" /></View>
          ) : (
            <EmptyState
              icon="download-outline"
              title="No downloads yet"
              description="Select files or folders and tap Download to create an archive"
            />
          )
        }
        renderItem={({ item }: { item: ZipDownload }) => <DownloadRow item={item} />}
      />
    </DriveShell>
  );
}
