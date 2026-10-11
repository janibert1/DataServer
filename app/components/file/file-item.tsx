import { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { FileIcon } from './file-icon';
import { formatFileSize, formatDate } from '@/lib/format';
import { usePreviewUrl } from '@/lib/hooks/use-preview-url';
import { useDragDrop } from './drag-drop-context';
import type { DriveFile } from '@/lib/types';
import type { ViewMode } from '@/stores/ui-store';
import { runOnJS } from 'react-native-reanimated';

interface FileItemProps {
  file: DriveFile;
  viewMode: ViewMode;
  onPress: () => void;
  onLongPress?: () => void;
  onMorePress?: () => void;
}

export function FileItem({ file, viewMode, onPress, onLongPress, onMorePress }: FileItemProps) {
  const hasPreview = !!(file.thumbnailKey || file.previewKey || file.mimeType.startsWith('image/'));
  const previewUrl = usePreviewUrl(file.id, hasPreview);
  const { isDragging, hoveredTargetId, registerTarget, unregisterTarget, startDrag, moveDrag, endDrag } = useDragDrop();
  const viewRef = useRef<View>(null);
  const isHovered = hoveredTargetId === file.id;

  useEffect(() => {
    return () => unregisterTarget(file.id);
  }, [file.id]);

  function handleLayout() {
    viewRef.current?.measureInWindow((x, y, width, height) => {
      registerTarget({ type: 'file', id: file.id, name: file.name, layout: { x, y, width, height } });
    });
  }

  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .onStart((e) => {
      runOnJS(startDrag)({ type: 'file', id: file.id, name: file.name, mimeType: file.mimeType }, e.absoluteX, e.absoluteY);
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
              {previewUrl ? (
                <Image source={{ uri: previewUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" recyclingKey={file.id} />
              ) : (
                <FileIcon mimeType={file.mimeType} size={36} />
              )}
              {file.isStarred && (
                <View style={{ position: 'absolute', top: 8, right: 8 }}>
                  <Ionicons name="star" size={14} color="#f59e0b" />
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#1e293b' }} numberOfLines={1}>{file.name}</Text>
                <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{formatFileSize(file.size)}</Text>
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
          {previewUrl ? (
            <View style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
              <Image source={{ uri: previewUrl }} style={{ width: 40, height: 40 }} contentFit="cover" recyclingKey={file.id} />
            </View>
          ) : (
            <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
              <FileIcon mimeType={file.mimeType} size={22} />
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#1e293b' }} numberOfLines={1}>{file.name}</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{formatFileSize(file.size)} · {formatDate(file.updatedAt)}</Text>
          </View>
          {file.isStarred && <Ionicons name="star" size={14} color="#f59e0b" style={{ marginRight: 8 }} />}
          <TouchableOpacity onPress={onMorePress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </GestureDetector>
    </View>
  );
}
