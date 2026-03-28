import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, PanResponder, LayoutRectangle, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface DragItem {
  type: 'file' | 'folder';
  id: string;
  name: string;
  mimeType?: string;
}

interface DropTarget {
  type: 'file' | 'folder';
  id: string;
  name: string;
  layout: LayoutRectangle;
}

interface DragDropContextValue {
  isDragging: boolean;
  dragItem: DragItem | null;
  hoveredTargetId: string | null;
  registerTarget: (target: DropTarget) => void;
  unregisterTarget: (id: string) => void;
  startDrag: (item: DragItem, pageX: number, pageY: number) => void;
}

const DragDropCtx = createContext<DragDropContextValue>({
  isDragging: false,
  dragItem: null,
  hoveredTargetId: null,
  registerTarget: () => {},
  unregisterTarget: () => {},
  startDrag: () => {},
});

export function useDragDrop() {
  return useContext(DragDropCtx);
}

interface Props {
  children: React.ReactNode;
  onDropOnFolder?: (dragged: DragItem, targetFolderId: string) => void;
  onDropOnItem?: (dragged: DragItem, target: DragItem) => void;
}

const PREVIEW_W = 160;
const PREVIEW_H = 56;

export function DragDropProvider({ children, onDropOnFolder, onDropOnItem }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });

  const targets = useRef(new Map<string, DropTarget>()).current;

  const dragItemRef = useRef<DragItem | null>(null);
  const onDropOnFolderRef = useRef(onDropOnFolder);
  const onDropOnItemRef = useRef(onDropOnItem);
  onDropOnFolderRef.current = onDropOnFolder;
  onDropOnItemRef.current = onDropOnItem;

  const registerTarget = useCallback((target: DropTarget) => {
    targets.set(target.id, target);
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    targets.delete(id);
  }, []);

  const findTarget = useCallback((pageX: number, pageY: number): DropTarget | null => {
    for (const [, target] of targets) {
      const { x, y, width, height } = target.layout;
      if (pageX >= x && pageX <= x + width && pageY >= y && pageY <= y + height) {
        return target;
      }
    }
    return null;
  }, []);

  const endDrag = useCallback(() => {
    setIsDragging(false);
    setDragItem(null);
    dragItemRef.current = null;
    setHoveredTargetId(null);
  }, []);

  // Full-screen overlay PanResponder — captures touch movement while dragging
  const overlayResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (e) => {
        const { pageX, pageY } = e.nativeEvent;
        setPreviewPos({ x: pageX - PREVIEW_W / 2, y: pageY - PREVIEW_H - 20 });
        const target = findTarget(pageX, pageY);
        const current = dragItemRef.current;
        setHoveredTargetId(target && current && target.id !== current.id ? target.id : null);
      },
      onPanResponderRelease: (e) => {
        const { pageX, pageY } = e.nativeEvent;
        const target = findTarget(pageX, pageY);
        const current = dragItemRef.current;
        if (target && current && target.id !== current.id) {
          if (target.type === 'folder') {
            onDropOnFolderRef.current?.(current, target.id);
          } else {
            onDropOnItemRef.current?.(current, { type: target.type, id: target.id, name: target.name });
          }
        }
        endDrag();
      },
      onPanResponderTerminate: () => endDrag(),
    }),
  [findTarget, endDrag]);

  const startDrag = useCallback((item: DragItem, pageX: number, pageY: number) => {
    dragItemRef.current = item;
    setDragItem(item);
    setIsDragging(true);
    setPreviewPos({ x: pageX - PREVIEW_W / 2, y: pageY - PREVIEW_H - 20 });
  }, []);

  return (
    <DragDropCtx.Provider value={{ isDragging, dragItem, hoveredTargetId, registerTarget, unregisterTarget, startDrag }}>
      <View style={{ flex: 1 }}>
        {children}
        {isDragging && dragItem && (
          <View style={StyleSheet.absoluteFill} pointerEvents="auto" {...overlayResponder.panHandlers}>
            {/* Transparent full-screen overlay captures all touches */}
            <View
              style={{
                position: 'absolute',
                left: previewPos.x,
                top: previewPos.y,
                width: PREVIEW_W,
                height: PREVIEW_H,
                borderRadius: 10,
                backgroundColor: '#fff',
                borderWidth: 2,
                borderColor: '#2563eb',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 10,
                gap: 8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 12,
                opacity: 0.92,
              }}
              pointerEvents="none"
            >
              <Ionicons
                name={dragItem.type === 'folder' ? 'folder' : 'document-outline'}
                size={22}
                color={dragItem.type === 'folder' ? '#3b82f6' : '#64748b'}
              />
              <Text
                style={{ color: '#1e293b', fontSize: 13, fontWeight: '500', flex: 1 }}
                numberOfLines={1}
              >
                {dragItem.name}
              </Text>
            </View>
          </View>
        )}
      </View>
    </DragDropCtx.Provider>
  );
}
