import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloadStore } from '@/stores/download-store';

export function DownloadProgress() {
  const { downloads, setVisible, clearCompleted } = useDownloadStore();

  const activeCount = downloads.filter((d) => d.status === 'downloading' || d.status === 'pending').length;

  return (
    <View style={{ backgroundColor: '#1e293b', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="cloud-download-outline" size={16} color="#22c55e" />
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>
            {activeCount > 0 ? `Downloading ${activeCount} file${activeCount > 1 ? 's' : ''}` : 'Downloads complete'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {activeCount === 0 && (
            <TouchableOpacity onPress={clearCompleted}>
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>Clear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setVisible(false)}>
            <Ionicons name="chevron-down" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ maxHeight: 192 }}>
        {downloads.map((download) => (
          <View key={download.id} style={{ paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#334155' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {download.status === 'complete' && <Ionicons name="checkmark-circle" size={16} color="#22c55e" />}
              {download.status === 'error' && <Ionicons name="close-circle" size={16} color="#ef4444" />}
              {(download.status === 'downloading' || download.status === 'pending') && (
                <Ionicons name="cloud-download-outline" size={16} color="#22c55e" />
              )}
              <Text style={{ fontSize: 14, color: '#fff', flex: 1 }} numberOfLines={1}>
                {download.fileName}
              </Text>
            </View>
            {download.status === 'downloading' && (
              <View style={{ height: 4, backgroundColor: '#334155', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <View
                  style={{ height: 4, backgroundColor: '#22c55e', borderRadius: 2, width: `${Math.round(download.progress * 100)}%` }}
                />
              </View>
            )}
            {download.error && (
              <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{download.error}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
