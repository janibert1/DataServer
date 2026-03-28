import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FolderIcon } from './file-icon';
import { formatDate } from '@/lib/format';
import type { DriveFolder } from '@/lib/types';
import type { ViewMode } from '@/stores/ui-store';

interface FolderItemProps {
  folder: DriveFolder;
  viewMode: ViewMode;
  onPress: () => void;
  onLongPress?: () => void;
}

export function FolderItem({ folder, viewMode, onPress, onLongPress }: FolderItemProps) {
  const counts = folder._count;

  if (viewMode === 'grid') {
    return (
      <TouchableOpacity
        className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm"
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
      >
        {/* Match file-item grid: aspect-video area + p-3 text */}
        <View style={{ aspectRatio: 16 / 9, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
          <FolderIcon color={folder.color} size={48} />
          {folder.isStarred && (
            <View style={{ position: 'absolute', top: 8, right: 8 }}>
              <Ionicons name="star" size={14} color="#f59e0b" />
            </View>
          )}
          {folder.isShared && (
            <View style={{ position: 'absolute', top: 8, left: 8 }}>
              <Ionicons name="people-outline" size={14} color="#94a3b8" />
            </View>
          )}
        </View>
        <View className="p-3">
          <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>
            {folder.name}
          </Text>
          {counts && (
            <Text className="text-xs text-slate-400 mt-0.5">
              {counts.children > 0 ? `${counts.children} folders` : ''}
              {counts.children > 0 && counts.files > 0 ? ' · ' : ''}
              {counts.files > 0 ? `${counts.files} files` : ''}
              {counts.children === 0 && counts.files === 0 ? 'Empty' : ''}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      className="flex-row items-center bg-white px-4 py-3 border-b border-slate-100"
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View className="w-10 h-10 rounded-lg bg-slate-50 items-center justify-center">
        <FolderIcon color={folder.color} size={24} />
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>
          {folder.name}
        </Text>
        <Text className="text-xs text-slate-400 mt-0.5">
          {formatDate(folder.updatedAt)}
        </Text>
      </View>
      {folder.isShared && <Ionicons name="people-outline" size={16} color="#94a3b8" style={{ marginRight: 8 }} />}
      {folder.isStarred && <Ionicons name="star" size={14} color="#f59e0b" style={{ marginRight: 8 }} />}
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </TouchableOpacity>
  );
}
