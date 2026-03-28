import { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { FolderIcon } from './file-icon';
import { formatDate } from '@/lib/format';
import { useDragDrop } from './drag-drop-context';
import type { DriveFolder } from '@/lib/types';
import type { ViewMode } from '@/stores/ui-store';
import { runOnJS } from 'react-native-reanimated';

interface FolderItemProps {
  folder: DriveFolder;
  viewMode: ViewMode;
  onPress: () => void;
  onLongPress?: () => void;
  onMorePress?: () => void;
}

export function FolderItem({ folder, viewMode, onPress, onLongPress, onMorePress }: FolderItemProps) {
  const counts = folder._count;
  const { isDragging, hoveredTargetId, registerTarget, unregisterTarget, startDrag, moveDrag, endDrag } = useDragDrop();
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

  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .onStart((e) => {
      runOnJS(startDrag)({ type: 'folder', id: folder.id, name: folder.name }, e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      runOnJS(moveDrag)(e.absoluteX, e.absoluteY);
    })
    .onEnd((e) => {
      runOnJS(endDrag)(e.absoluteX, e.absoluteY);
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(onPress)();
    });

  const composed = Gesture.Race(dragGesture, tapGesture);

  if (viewMode === 'grid') {
    return (
      <View ref={viewRef} onLayout={handleLayout}>
        <GestureDetector gesture={composed}>
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              borderWidth: isHovered ? 2 : 1,
              borderColor: isHovered ? '#2563eb' : '#f1f5f9',
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 2,
              elevation: 1,
            }}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#1e293b' }} numberOfLines={1}>{folder.name}</Text>
                {counts && (
                  <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
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
          </View>
        </GestureDetector>
      </View>
    );
  }

  return (
    <View ref={viewRef} onLayout={handleLayout}>
      <GestureDetector gesture={composed}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isHovered ? '#eff6ff' : '#fff',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: isHovered ? '#2563eb' : '#f1f5f9',
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
            <FolderIcon color={folder.color} size={24} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#1e293b' }} numberOfLines={1}>{folder.name}</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{formatDate(folder.updatedAt)}</Text>
          </View>
          {folder.isShared && <Ionicons name="people-outline" size={16} color="#94a3b8" style={{ marginRight: 8 }} />}
          {folder.isStarred && <Ionicons name="star" size={14} color="#f59e0b" style={{ marginRight: 8 }} />}
          <TouchableOpacity onPress={onMorePress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </GestureDetector>
    </View>
  );
}
