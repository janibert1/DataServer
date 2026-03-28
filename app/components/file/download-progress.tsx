import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloadStore } from '@/stores/download-store';

export function DownloadProgress() {
  const { downloads, setVisible, clearCompleted } = useDownloadStore();

  const activeCount = downloads.filter((d) => d.status === 'downloading' || d.status === 'pending').length;

  return (
    <View style={{ backgroundColor: '#1e293b', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Ionicons name="cloud-download-outline" size={16} color="#22c55e" />
          <Text className="text-sm font-medium text-white">
            {activeCount > 0 ? `Downloading ${activeCount} file${activeCount > 1 ? 's' : ''}` : 'Downloads complete'}
          </Text>
        </View>
        <View className="flex-row gap-3">
          {activeCount === 0 && (
            <TouchableOpacity onPress={clearCompleted}>
              <Text className="text-xs text-slate-400">Clear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setVisible(false)}>
            <Ionicons name="chevron-down" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="max-h-48">
        {downloads.map((download) => (
          <View key={download.id} className="px-4 py-2 border-t border-slate-700">
            <View className="flex-row items-center gap-2">
              {download.status === 'complete' && <Ionicons name="checkmark-circle" size={16} color="#22c55e" />}
              {download.status === 'error' && <Ionicons name="close-circle" size={16} color="#ef4444" />}
              {(download.status === 'downloading' || download.status === 'pending') && (
                <Ionicons name="cloud-download-outline" size={16} color="#22c55e" />
              )}
              <Text className="text-sm text-white flex-1" numberOfLines={1}>
                {download.fileName}
              </Text>
            </View>
            {download.status === 'downloading' && (
              <View className="h-1 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
                <View
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${download.progress * 100}%` }}
                />
              </View>
            )}
            {download.error && (
              <Text className="text-xs text-red-400 mt-1">{download.error}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
