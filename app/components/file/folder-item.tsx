import { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FolderIcon } from './file-icon';
import { formatDate } from '@/lib/format';
import { useDragDrop } from './drag-drop-context';
import type { DriveFolder } from '@/lib/types';
import type { ViewMode } from '@/stores/ui-store';

interface FolderItemProps {
  folder: DriveFolder;
  viewMode: ViewMode;
  onPress: () => void;
  onLongPress?: () => void;
  onMorePress?: () => void;
}

export function FolderItem({ folder, viewMode, onPress, onLongPress, onMorePress }: FolderItemProps) {
  const counts = folder._count;
  const { isDragging, hoveredTargetId, registerTarget, unregisterTarget, startDrag } = useDragDrop();
  const viewRef = useRef<View>(null);
  const isHovered = hoveredTargetId === folder.id;

  useEffect(() => {
    return () => unregisterTarget(folder.id);
  }, [folder.id]);

  function handleLayout() {
    viewRef.current?.measureInWindow((x, y, width, height) => {
      registerTarget({ type: 'folder', id: folder.id, name: folder.name, layout: { x, y, width, height } });
    });
  }

  function handleLongPress(e: { nativeEvent: { pageX: number; pageY: number } }) {
    startDrag({ type: 'folder', id: folder.id, name: folder.name }, e.nativeEvent.pageX, e.nativeEvent.pageY);
  }

  if (viewMode === 'grid') {
    return (
      <View ref={viewRef} onLayout={handleLayout}>
        <TouchableOpacity
          className="bg-white rounded-xl border overflow-hidden shadow-sm"
          style={{ borderColor: isHovered ? '#2563eb' : '#f1f5f9', borderWidth: isHovered ? 2 : 1 }}
          onPress={onPress}
          onLongPress={handleLongPress}
          activeOpacity={0.7}
        >
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
          <View className="flex-row items-center justify-between p-3">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>{folder.name}</Text>
              {counts && (
                <Text className="text-xs text-slate-400 mt-0.5">
                  {counts.children > 0 ? `${counts.children} folders` : ''}
                  {counts.children > 0 && counts.files > 0 ? ' · ' : ''}
                  {counts.files > 0 ? `${counts.files} files` : ''}
                  {counts.children === 0 && counts.files === 0 ? 'Empty' : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onMorePress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View ref={viewRef} onLayout={handleLayout}>
      <TouchableOpacity
        className="flex-row items-center bg-white px-4 py-3 border-b"
        style={{ borderColor: isHovered ? '#2563eb' : '#f1f5f9', backgroundColor: isHovered ? '#eff6ff' : '#fff' }}
        onPress={onPress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <View className="w-10 h-10 rounded-lg bg-slate-50 items-center justify-center">
          <FolderIcon color={folder.color} size={24} />
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>{folder.name}</Text>
          <Text className="text-xs text-slate-400 mt-0.5">{formatDate(folder.updatedAt)}</Text>
        </View>
        {folder.isShared && <Ionicons name="people-outline" size={16} color="#94a3b8" style={{ marginRight: 8 }} />}
        {folder.isStarred && <Ionicons name="star" size={14} color="#f59e0b" style={{ marginRight: 8 }} />}
        <TouchableOpacity onPress={onMorePress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}
