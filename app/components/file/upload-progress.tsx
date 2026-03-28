import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUploadStore } from '@/stores/upload-store';
import { formatFileSize } from '@/lib/format';

export function UploadProgress() {
  const { uploads, isVisible, setVisible, clearCompleted } = useUploadStore();

  if (!isVisible || uploads.length === 0) return null;

  const activeCount = uploads.filter((u) => u.status === 'uploading' || u.status === 'pending').length;

  return (
    <View style={{ position: 'absolute', bottom: 80, right: 16, left: 16, backgroundColor: '#1e293b', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-sm font-medium text-white">
          {activeCount > 0 ? `Uploading ${activeCount} file${activeCount > 1 ? 's' : ''}` : 'Uploads complete'}
        </Text>
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
        {uploads.map((upload) => (
          <View key={upload.id} className="px-4 py-2 border-t border-slate-700">
            <View className="flex-row items-center gap-2">
              {upload.status === 'complete' && <Ionicons name="checkmark-circle" size={16} color="#22c55e" />}
              {upload.status === 'error' && <Ionicons name="close-circle" size={16} color="#ef4444" />}
              {(upload.status === 'uploading' || upload.status === 'pending') && (
                <Ionicons name="cloud-upload-outline" size={16} color="#60a5fa" />
              )}
              <Text className="text-sm text-white flex-1" numberOfLines={1}>
                {upload.fileName}
              </Text>
            </View>
            {upload.status === 'uploading' && (
              <View className="h-1 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
                <View
                  className="h-full bg-brand-500 rounded-full"
                  style={{ width: `${upload.progress * 100}%` }}
                />
              </View>
            )}
            {upload.error && (
              <Text className="text-xs text-red-400 mt-1">{upload.error}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
