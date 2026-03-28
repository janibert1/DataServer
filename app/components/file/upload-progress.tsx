import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUploadStore } from '@/stores/upload-store';

export function UploadProgress() {
  const { uploads, setVisible, clearCompleted } = useUploadStore();

  const activeCount = uploads.filter((u) => u.status === 'uploading' || u.status === 'pending').length;

  return (
    <View style={{ backgroundColor: '#1e293b', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="cloud-upload-outline" size={16} color="#60a5fa" />
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>
            {activeCount > 0 ? `Uploading ${activeCount} file${activeCount > 1 ? 's' : ''}` : 'Uploads complete'}
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
        {uploads.map((upload) => (
          <View key={upload.id} style={{ paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#334155' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {upload.status === 'complete' && <Ionicons name="checkmark-circle" size={16} color="#22c55e" />}
              {upload.status === 'error' && <Ionicons name="close-circle" size={16} color="#ef4444" />}
              {(upload.status === 'uploading' || upload.status === 'pending') && (
                <Ionicons name="cloud-upload-outline" size={16} color="#60a5fa" />
              )}
              <Text style={{ fontSize: 14, color: '#fff', flex: 1 }} numberOfLines={1}>
                {upload.fileName}
              </Text>
            </View>
            {upload.status === 'uploading' && (
              <View style={{ height: 4, backgroundColor: '#334155', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <View
                  style={{ height: 4, backgroundColor: '#3b82f6', borderRadius: 2, width: `${Math.round(upload.progress * 100)}%` }}
                />
              </View>
            )}
            {upload.error && (
              <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{upload.error}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
