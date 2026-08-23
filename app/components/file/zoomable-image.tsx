import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { ZoomIn, ZoomOut } from 'lucide-react-native';
import { getFileThumbnailUrl, getFileOriginalUrl } from '@/lib/api/files';

// Mobile port of frontend/src/components/files/FilePreviewModal.tsx's
// ProgressiveImage -- same 3-tier progressive load (thumbnail -> previewKey
// -> real original), same box-size locking, same pinch/pan/double-tap zoom
// with clamped panning, same fading zoom-% pill. Where web hand-rolls
// pointer-event tracking, this uses react-native-gesture-handler +
// reanimated (both already deps, already wired app-wide via
// GestureHandlerRootView in app/_layout.tsx) -- the idiomatic RN equivalent
// of the same mechanism, not a different design. Where web preloads each
// tier via a throwaway `new Image()` before swapping `src` in place,
// `expo-image`'s own `source`-change crossfade (`transition`) covers that
// natively; `Image.prefetch()` stands in for "wait until actually
// loaded/decoded" so the original-chase effect still only fires once the
// preview tier is really on screen, matching web's sequencing.
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

interface Props {
  fileId: string;
  fullUrl: string;
  quality: 'thumbnail' | 'preview' | 'original' | null;
  chromeVisible: boolean;
  onImageTap: () => void;
}

export function ZoomableImage({ fileId, fullUrl, quality, chromeVisible, onImageTap }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [isOriginal, setIsOriginal] = useState(false);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null);
  const [scaleLabel, setScaleLabel] = useState(100);
  const naturalDimsRef = useRef<{ w: number; h: number } | null>(null);
  const containerSizeRef = useRef<{ w: number; h: number } | null>(null);

  // Zoom/pan transform -- shared values so pinch/pan gestures can read+write
  // them on the UI thread every frame with no JS-thread round trip (same
  // reasoning as web's plain-refs-not-state choice for the same transform).
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  // Mirrors of boxSize/container dims, kept in shared values purely so the
  // pan-clamp math (also UI-thread) can read them without a bridge hop.
  const boxW = useSharedValue(0);
  const boxH = useSharedValue(0);
  const cW = useSharedValue(0);
  const cH = useSharedValue(0);

  const [controlsVisible, setControlsVisible] = useState(false);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function bumpControls() {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 1000);
  }
  useEffect(() => () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); }, []);

  function lockBoxSize(naturalW: number, naturalH: number) {
    naturalDimsRef.current = { w: naturalW, h: naturalH };
    const container = containerSizeRef.current;
    if (!container) return;
    const ratio = naturalW / naturalH;
    let w = container.w;
    let h = container.w / ratio;
    if (h > container.h) {
      h = container.h;
      w = container.h * ratio;
    }
    setBoxSize({ w, h });
    boxW.value = w;
    boxH.value = h;
  }

  function onContainerLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    containerSizeRef.current = { w: width, h: height };
    cW.value = width;
    cH.value = height;
    if (naturalDimsRef.current) lockBoxSize(naturalDimsRef.current.w, naturalDimsRef.current.h);
  }

  function setZoom(next: number, animate = true) {
    'worklet';
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
    savedScale.value = clamped;
    if (animate) scale.value = withTiming(clamped, { duration: 200 });
    else scale.value = clamped;
    if (clamped === MIN_SCALE) {
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      if (animate) {
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
      } else {
        translateX.value = 0;
        translateY.value = 0;
      }
    }
    runOnJS(bumpControls)();
  }

  function clampTranslate(s: number, tx: number, ty: number) {
    'worklet';
    const scaledW = boxW.value * s;
    const scaledH = boxH.value * s;
    const maxX = Math.max(0, (scaledW - cW.value) / 2);
    const maxY = Math.max(0, (scaledH - cH.value) / 2);
    return { x: clamp(tx, -maxX, maxX), y: clamp(ty, -maxY, maxY) };
  }

  // Identity reset -- only on an actual photo change. Resets zoom/pan and
  // goes back to the fast thumbnail placeholder, exactly like web.
  useEffect(() => {
    setSrc(null);
    setIsOriginal(false);
    setBoxSize(null);
    naturalDimsRef.current = null;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setScaleLabel(100);

    let cancelled = false;
    getFileThumbnailUrl(fileId)
      .then((data) => { if (!cancelled) setSrc((cur) => cur ?? data.thumbnailUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fileId]);

  // Chases preview -> real original, same sequencing as web's effect (see
  // that file's comment for the full "why" -- previewKey is a genuine lossy
  // re-encode, not a stand-in for "done").
  useEffect(() => {
    let cancelled = false;
    Image.prefetch(fullUrl)
      .then(() => {
        if (cancelled) return;
        setSrc(fullUrl);
        if (quality === 'original') {
          setIsOriginal(true);
          return;
        }
        getFileOriginalUrl(fileId)
          .then((data) => Image.prefetch(data.originalUrl).then(() => {
            if (!cancelled) { setSrc(data.originalUrl); setIsOriginal(true); }
          }))
          .catch(() => {});
      })
      .catch(() => { if (!cancelled) setSrc((cur) => cur ?? fullUrl); });
    return () => { cancelled = true; };
  }, [fullUrl, fileId, quality]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1) {
        setZoom(1);
        return;
      }
      const centerX = e.x - cW.value / 2;
      const centerY = e.y - cH.value / 2;
      const nextX = -centerX * (DOUBLE_TAP_SCALE - 1);
      const nextY = -centerY * (DOUBLE_TAP_SCALE - 1);
      const clamped = clampTranslate(DOUBLE_TAP_SCALE, nextX, nextY);
      translateX.value = withTiming(clamped.x, { duration: 200 });
      translateY.value = withTiming(clamped.y, { duration: 200 });
      savedTranslateX.value = clamped.x;
      savedTranslateY.value = clamped.y;
      setZoom(DOUBLE_TAP_SCALE);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => runOnJS(onImageTap)())
    .requireExternalGestureToFail(doubleTap);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
      scale.value = next;
      const clampedPos = clampTranslate(next, translateX.value, translateY.value);
      translateX.value = clampedPos.x;
      translateY.value = clampedPos.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      if (scale.value <= MIN_SCALE) setZoom(MIN_SCALE);
      else runOnJS(bumpControls)();
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value <= 1) return;
      const clamped = clampTranslate(savedScale.value, savedTranslateX.value + e.translationX, savedTranslateY.value + e.translationY);
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan), singleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  useAnimatedReaction(
    () => Math.round(scale.value * 100),
    (cur, prev) => { if (cur !== prev) runOnJS(setScaleLabel)(cur); },
  );

  function zoomOut() {
    setZoom(savedScale.value - 0.75);
  }
  function zoomIn() {
    setZoom(savedScale.value + 0.75);
  }

  return (
    <View style={{ flex: 1 }} onLayout={onContainerLayout}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {!src ? (
          <ActivityIndicator size="large" color="white" />
        ) : (
          <GestureDetector gesture={composed}>
            <Animated.View style={[boxSize ? { width: boxSize.w, height: boxSize.h } : { width: '100%', height: '100%' }, animatedStyle]}>
              <Image
                source={{ uri: src }}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
                transition={200}
                // expo-image defaults to downscaling the decoded bitmap to
                // match the view's rendered size (boxSize, locked BEFORE any
                // zoom) -- fine for a static image, but this component's
                // zoom is a GPU transform on that same fixed-size bitmap, so
                // pinching in just upscales an already-downsampled image and
                // looks soft regardless of which quality tier was fetched.
                // Confirmed via expo-image's own docs (Image.types.d.ts):
                // "Turning off this functionality... would result in...
                // end-users would always have access to the highest
                // possible asset quality" -- exactly what a zoom viewer needs.
                allowDownscaling={false}
                onLoad={(e) => {
                  if (!boxSize && e.source?.width && e.source?.height) {
                    lockBoxSize(e.source.width, e.source.height);
                  }
                }}
              />
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      {/* "Low quality" badge -- shown for as long as anything less than the
          true original is on screen, same condition as web. */}
      {src && !isOriginal && chromeVisible && (
        <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Low quality</Text>
        </View>
      )}

      {/* Zoom pill -- fades in on zoom activity, out after 1s idle. */}
      {src && (
        <View
          pointerEvents={controlsVisible ? 'auto' : 'none'}
          style={{
            position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center',
            opacity: controlsVisible ? 1 : 0,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 6 }}>
            <TouchableOpacity onPress={zoomOut} disabled={scaleLabel <= 100} style={{ padding: 6, opacity: scaleLabel <= 100 ? 0.3 : 1 }}>
              <ZoomOut size={16} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, width: 40, textAlign: 'center' }}>{scaleLabel}%</Text>
            <TouchableOpacity onPress={zoomIn} disabled={scaleLabel >= MAX_SCALE * 100} style={{ padding: 6, opacity: scaleLabel >= MAX_SCALE * 100 ? 0.3 : 1 }}>
              <ZoomIn size={16} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
