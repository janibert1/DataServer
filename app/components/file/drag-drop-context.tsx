import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, Animated, PanResponder, LayoutRectangle } from 'react-native';
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

const PREVIEW_WIDTH = 160;
const PREVIEW_HEIGHT = 56;

export function DragDropProvider({ children, onDropOnFolder, onDropOnItem }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);

  const pan = useRef(new Animated.ValueXY()).current;
  const targets = useRef(new Map<string, DropTarget>()).current;

  // Mutable refs so PanResponder always reads current values
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

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (e, gesture) => {
        pan.setValue({ x: gesture.moveX - PREVIEW_WIDTH / 2, y: gesture.moveY - PREVIEW_HEIGHT / 2 });
        const target = findTarget(gesture.moveX, gesture.moveY);
        const current = dragItemRef.current;
        setHoveredTargetId(target && current && target.id !== current.id ? target.id : null);
      },
      onPanResponderRelease: (e, gesture) => {
        const target = findTarget(gesture.moveX, gesture.moveY);
        const current = dragItemRef.current;
        if (target && current && target.id !== current.id) {
          if (target.type === 'folder') {
            onDropOnFolderRef.current?.(current, target.id);
          } else {
            onDropOnItemRef.current?.(current, { type: target.type, id: target.id, name: target.name });
          }
        }
        setIsDragging(false);
        setDragItem(null);
        dragItemRef.current = null;
        setHoveredTargetId(null);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        setDragItem(null);
        dragItemRef.current = null;
        setHoveredTargetId(null);
      },
    }),
  [findTarget]);

  const startDrag = useCallback((item: DragItem, pageX: number, pageY: number) => {
    dragItemRef.current = item;
    setDragItem(item);
    setIsDragging(true);
    pan.setValue({ x: pageX - PREVIEW_WIDTH / 2, y: pageY - PREVIEW_HEIGHT / 2 });
  }, []);

  return (
    <DragDropCtx.Provider value={{ isDragging, dragItem, hoveredTargetId, registerTarget, unregisterTarget, startDrag }}>
      <View style={{ flex: 1 }}>
        {children}
        {isDragging && dragItem && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                zIndex: 999,
                width: PREVIEW_WIDTH,
                height: PREVIEW_HEIGHT,
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
              },
              { transform: pan.getTranslateTransform() },
            ]}
            {...panResponder.panHandlers}
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
          </Animated.View>
        )}
      </View>
    </DragDropCtx.Provider>
  );
}
