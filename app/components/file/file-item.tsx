import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { FileIcon } from './file-icon';
import { formatFileSize, formatDate } from '@/lib/format';
import { usePreviewUrl } from '@/lib/hooks/use-preview-url';
import type { DriveFile } from '@/lib/types';
import type { ViewMode } from '@/stores/ui-store';

interface FileItemProps {
  file: DriveFile;
  viewMode: ViewMode;
  onPress: () => void;
  onLongPress?: () => void;
}

export function FileItem({ file, viewMode, onPress, onLongPress }: FileItemProps) {
  const hasPreview = !!(file.thumbnailKey || file.previewKey || file.mimeType.startsWith('image/'));
  const previewUrl = usePreviewUrl(file.id, hasPreview);

  if (viewMode === 'grid') {
    return (
      <TouchableOpacity
        className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm"
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
      >
        <View style={{ aspectRatio: 16 / 9, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
          {previewUrl ? (
            <Image
              source={{ uri: previewUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              recyclingKey={file.id}
            />
          ) : (
            <FileIcon mimeType={file.mimeType} size={36} />
          )}
          {file.isStarred && (
            <View style={{ position: 'absolute', top: 8, right: 8 }}>
              <Ionicons name="star" size={14} color="#f59e0b" />
            </View>
          )}
        </View>
        <View className="p-3">
          <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>
            {file.name}
          </Text>
          <Text className="text-xs text-slate-400 mt-0.5">
            {formatFileSize(file.size)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // List view — show small thumbnail on left instead of just an icon
  return (
    <TouchableOpacity
      className="flex-row items-center bg-white px-4 py-3 border-b border-slate-100"
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {previewUrl ? (
        <View style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
          <Image
            source={{ uri: previewUrl }}
            style={{ width: 40, height: 40 }}
            contentFit="cover"
            recyclingKey={file.id}
          />
        </View>
      ) : (
        <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
          <FileIcon mimeType={file.mimeType} size={22} />
        </View>
      )}
      <View className="flex-1 ml-3">
        <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>
          {file.name}
        </Text>
        <Text className="text-xs text-slate-400 mt-0.5">
          {formatFileSize(file.size)} · {formatDate(file.updatedAt)}
        </Text>
      </View>
      {file.isStarred && (
        <Ionicons name="star" size={14} color="#f59e0b" style={{ marginRight: 8 }} />
      )}
      <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
    </TouchableOpacity>
  );
}
