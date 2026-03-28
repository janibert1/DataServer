import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { View, Text, LayoutRectangle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

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
  moveDrag: (pageX: number, pageY: number) => void;
  endDrag: (pageX: number, pageY: number) => void;
  cancelDrag: () => void;
}

const DragDropCtx = createContext<DragDropContextValue>({
  isDragging: false,
  dragItem: null,
  hoveredTargetId: null,
  registerTarget: () => {},
  unregisterTarget: () => {},
  startDrag: () => {},
  moveDrag: () => {},
  endDrag: () => {},
  cancelDrag: () => {},
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

  const startDrag = useCallback((item: DragItem, pageX: number, pageY: number) => {
    dragItemRef.current = item;
    setDragItem(item);
    setIsDragging(true);
    setPreviewPos({ x: pageX - PREVIEW_W / 2, y: pageY - PREVIEW_H - 20 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const moveDrag = useCallback((pageX: number, pageY: number) => {
    setPreviewPos({ x: pageX - PREVIEW_W / 2, y: pageY - PREVIEW_H - 20 });
    const target = findTarget(pageX, pageY);
    const current = dragItemRef.current;
    setHoveredTargetId(target && current && target.id !== current.id ? target.id : null);
  }, [findTarget]);

  const endDrag = useCallback((pageX: number, pageY: number) => {
    const target = findTarget(pageX, pageY);
    const current = dragItemRef.current;
    if (target && current && target.id !== current.id) {
      if (target.type === 'folder') {
        onDropOnFolder?.(current, target.id);
      } else {
        onDropOnItem?.(current, { type: target.type, id: target.id, name: target.name });
      }
    }
    setIsDragging(false);
    setDragItem(null);
    dragItemRef.current = null;
    setHoveredTargetId(null);
  }, [findTarget, onDropOnFolder, onDropOnItem]);

  const cancelDrag = useCallback(() => {
    setIsDragging(false);
    setDragItem(null);
    dragItemRef.current = null;
    setHoveredTargetId(null);
  }, []);

  return (
    <DragDropCtx.Provider value={{
      isDragging, dragItem, hoveredTargetId,
      registerTarget, unregisterTarget,
      startDrag, moveDrag, endDrag, cancelDrag,
    }}>
      <View style={{ flex: 1 }}>
        {children}
        {isDragging && dragItem && (
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
              zIndex: 999,
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
        )}
      </View>
    </DragDropCtx.Provider>
  );
}
