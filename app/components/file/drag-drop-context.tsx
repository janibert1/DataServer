import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { View, Text, Animated, PanResponder, Dimensions, LayoutRectangle } from 'react-native';
import type { DriveFile, DriveFolder } from '@/lib/types';

export interface DragItem {
  type: 'file' | 'folder';
  id: string;
  name: string;
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

export function DragDropProvider({ children, onDropOnFolder, onDropOnItem }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const [dragLabel, setDragLabel] = useState('');

  const pan = useRef(new Animated.ValueXY()).current;
  const targets = useRef(new Map<string, DropTarget>()).current;

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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (e, gesture) => {
        pan.setValue({ x: gesture.moveX - 40, y: gesture.moveY - 40 });
        const target = findTarget(gesture.moveX, gesture.moveY);
        setHoveredTargetId(target && target.id !== dragItem?.id ? target.id : null);
      },
      onPanResponderRelease: (e, gesture) => {
        const target = findTarget(gesture.moveX, gesture.moveY);
        if (target && dragItem && target.id !== dragItem.id) {
          if (target.type === 'folder') {
            onDropOnFolder?.(dragItem, target.id);
          } else {
            onDropOnItem?.(dragItem, { type: target.type, id: target.id, name: target.name });
          }
        }
        setIsDragging(false);
        setDragItem(null);
        setHoveredTargetId(null);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        setDragItem(null);
        setHoveredTargetId(null);
      },
    })
  ).current;

  const startDrag = useCallback((item: DragItem, pageX: number, pageY: number) => {
    setDragItem(item);
    setDragLabel(item.name);
    setIsDragging(true);
    pan.setValue({ x: pageX - 40, y: pageY - 40 });
  }, []);

  return (
    <DragDropCtx.Provider value={{ isDragging, dragItem, hoveredTargetId, registerTarget, unregisterTarget, startDrag }}>
      <View style={{ flex: 1 }}>
        {children}
        {isDragging && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                zIndex: 999,
                width: 80,
                height: 80,
                borderRadius: 12,
                backgroundColor: 'rgba(37, 99, 235, 0.9)',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 10,
              },
              { transform: pan.getTranslateTransform() },
            ]}
            {...panResponder.panHandlers}
          >
            <Text style={{ color: 'white', fontSize: 10, fontWeight: '600', textAlign: 'center', paddingHorizontal: 4 }} numberOfLines={2}>
              {dragLabel}
            </Text>
          </Animated.View>
        )}
      </View>
    </DragDropCtx.Provider>
  );
}
