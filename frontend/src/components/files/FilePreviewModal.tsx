import { Fragment, useState, useEffect, useRef, WheelEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, Download, ChevronLeft, ChevronRight, ExternalLink, Info, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { DriveFile } from '../../types';
import { getFileDownloadUrl, getFilePreviewUrl, getFileThumbnailUrl, getFileOriginalUrl } from '../../hooks/useFiles';
import { LoadingSpinner } from '../common/LoadingSpinner';
import clsx from 'clsx';
import { formatBytes } from '../../lib/format';

interface Props {
  file: DriveFile | null;
  files?: DriveFile[];
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}


// A plain <video src={previewUrl}> relies on the browser noticing the src
// attribute changed and kicking off its media load algorithm on its own.
// In practice (confirmed live: zero 'loadstart' events, zero resource-timing
// entries for the video, readyState stuck at HAVE_NOTHING indefinitely,
// despite a valid currentSrc) that notice-and-reload behavior is not
// reliable across renders in this app -- the browser never actually
// requests the media. Explicitly calling videoEl.load() forces the load
// algorithm to run regardless of whether the browser detected the src
// mutation on its own; this is the standard fix for this exact class of
// "React <video> never starts loading" symptom.
function VideoPlayer({ previewUrl }: { previewUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    videoRef.current?.load();
  }, [previewUrl]);

  return (
    <video
      ref={videoRef}
      src={previewUrl}
      controls
      className="max-w-full rounded-lg bg-black"
      style={{ maxHeight: 'calc(85vh - 120px)' }}
    >
      Your browser does not support video playback.
    </video>
  );
}

// Shows the small thumbnail immediately (already resolved by the time the
// modal opens most of the time -- FileGrid fetched it for the tile), then
// swaps to the full-resolution preview once it loads. Deliberately a single
// <img> element whose `src` is mutated in place rather than two elements or
// a remount keyed on load state -- if the visitor has already pinch-zoomed
// the low-res image, the browser's zoom/pan transform lives on that DOM
// node, and only survives the quality swap if the node itself never changes.
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function dist(a: PointerEvent, b: PointerEvent) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function ProgressiveImage({ fileId, fullUrl, quality, alt, fullscreen }: { fileId: string; fullUrl: string; quality: 'thumbnail' | 'preview' | 'original' | null; alt: string; fullscreen: boolean }) {
  // fullUrl is already resolved by the parent's effect (that's why this
  // component exists at all) -- only the thumbnail needs its own fetch here.
  const [src, setSrc] = useState<string | null>(null);

  // True once the actual, unprocessed original file (not the 2000px/q85
  // WebP re-encode previewKey produces) is what's on screen -- see the
  // fullUrl effect below for the 3-stage progressive load this drives.
  const [isOriginal, setIsOriginal] = useState(false);

  // Every tier (thumbnail/preview/original) shares the same aspect ratio but
  // has wildly different intrinsic pixel dimensions -- with no explicit box
  // size, the <img> naturally resizes itself larger on every quality
  // upgrade (400px wide -> 2000px -> the real original), which reads as the
  // photo visibly jumping in physical size mid-transition. Locking a pixel
  // box the first time any tier loads, from whichever container space is
  // available right then, keeps every later swap purely a quality change.
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null);
  const naturalDimsRef = useRef<{ w: number; h: number } | null>(null);

  const lockBoxSize = (naturalW: number, naturalH: number) => {
    naturalDimsRef.current = { w: naturalW, h: naturalH };
    const container = containerRef.current;
    if (!container) return;
    const availW = container.clientWidth;
    const availH = container.clientHeight;
    const ratio = naturalW / naturalH;
    let w = availW;
    let h = availW / ratio;
    if (h > availH) {
      h = availH;
      w = availH * ratio;
    }
    setBoxSize({ w, h });
  };

  // Pan/zoom state. Deliberately plain refs+manual style writes (not React
  // state) for the per-frame transform -- pointermove fires far faster than
  // a comfortable React re-render rate, and this avoids fighting React over
  // who owns the transform during an active drag/pinch.
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });
  const [scale, setScale] = useState(1); // mirrored into state only to drive the zoom-controls UI

  const pointers = useRef(new Map<number, PointerEvent>());
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Fades in on any zoom action, back out after a second of no further
  // zooming (not panning -- per spec this tracks zoom activity specifically).
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpControls = () => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 1000);
  };
  useEffect(() => () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); }, []);

  // Keeps the pan position from ever revealing empty space past the image's
  // own (scaled) edges -- without this, a drag at high zoom can push the
  // whole image out of the viewport with no way back short of the reset button.
  const clampPos = (s: number) => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const scaledW = img.offsetWidth * s;
    const scaledH = img.offsetHeight * s;
    const rect = container.getBoundingClientRect();
    const maxX = Math.max(0, (scaledW - rect.width) / 2);
    const maxY = Math.max(0, (scaledH - rect.height) / 2);
    posRef.current = {
      x: clamp(posRef.current.x, -maxX, maxX),
      y: clamp(posRef.current.y, -maxY, maxY),
    };
  };

  const applyTransform = (animate = false) => {
    const el = imgRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
    el.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px) scale(${scaleRef.current})`;
    el.style.cursor = scaleRef.current > 1 ? 'grab' : 'zoom-in';
  };

  const setZoom = (next: number, animate = true) => {
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
    scaleRef.current = clamped;
    if (clamped === MIN_SCALE) posRef.current = { x: 0, y: 0 };
    else clampPos(clamped);
    setScale(clamped);
    applyTransform(animate);
    bumpControls();
  };

  // Full identity reset -- only when actually navigating to a different
  // photo. Resets zoom/pan and goes back to the fast thumbnail placeholder.
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setIsOriginal(false);
    setBoxSize(null);
    naturalDimsRef.current = null;
    scaleRef.current = 1;
    posRef.current = { x: 0, y: 0 };
    setScale(1);

    getFileThumbnailUrl(fileId)
      .then((data) => { if (!cancelled) setSrc((cur) => cur ?? data.thumbnailUrl); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [fileId]);

  // Fullscreen toggles change how much space the container actually has --
  // re-lock the box at the new size (same aspect ratio, already known) so
  // going fullscreen doesn't leave the photo pinned at its old windowed size.
  useEffect(() => {
    if (naturalDimsRef.current) lockBoxSize(naturalDimsRef.current.w, naturalDimsRef.current.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  // Preloads and swaps in the previewUrl the parent currently has --
  // fires on first load AND again later if the parent's background poll
  // upgrades a thumbnail-tier previewUrl to the previewKey tier once the
  // backfill/preview worker catches up (see FilePreviewModal). Deliberately
  // separate from the identity-reset effect above and touches no zoom/pan
  // state -- a background quality upgrade shouldn't reset anything the user
  // is mid-gesture on.
  //
  // Once THAT lands, chases a third and final stage: the real, unprocessed
  // original file. previewKey (2000px, WebP q85) is a genuine lossy
  // re-encode -- visibly softer under zoom and, before the color-profile fix
  // in previewWorker.ts, could shift colors -- so it's still a stand-in, not
  // the real thing. Unlike thumbnail/preview generation, the original needs
  // no async worker or polling: it's already sitting in storage, so this
  // just downloads+decodes it directly and swaps it in once ready. Skipped
  // entirely when the server already reported quality 'original' (no
  // processed derivative exists at all, so fullUrl already *is* the file).
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setSrc(fullUrl);
      if (quality === 'original') {
        setIsOriginal(true);
        return;
      }
      getFileOriginalUrl(fileId)
        .then((data) => {
          if (cancelled) return;
          const orig = new Image();
          orig.onload = () => { if (!cancelled) { setSrc(data.originalUrl); setIsOriginal(true); } };
          orig.src = data.originalUrl;
        })
        .catch(() => {});
    };
    img.onerror = () => { if (!cancelled) setSrc((cur) => cur ?? fullUrl); };
    img.src = fullUrl;
    return () => { cancelled = true; };
  }, [fullUrl, fileId, quality]);

  useEffect(() => { applyTransform(false); }, [src]);

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    setZoom(scaleRef.current - e.deltaY * 0.0035, false);
  };

  const handleDoubleClick = (e: MouseEvent) => {
    if (scaleRef.current > 1) {
      setZoom(1);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      // Zoom in centered on the click point.
      posRef.current = {
        x: -(e.clientX - rect.left - rect.width / 2) * (DOUBLE_TAP_SCALE - 1),
        y: -(e.clientY - rect.top - rect.height / 2) * (DOUBLE_TAP_SCALE - 1),
      };
    }
    setZoom(DOUBLE_TAP_SCALE);
  };

  const handlePointerDown = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, e.nativeEvent);
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStartDist.current = dist(a, b);
      pinchStartScale.current = scaleRef.current;
      dragStart.current = null;
    } else if (pointers.current.size === 1 && scaleRef.current > 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, px: posRef.current.x, py: posRef.current.y };
      if (imgRef.current) imgRef.current.style.cursor = 'grabbing';
    }
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, e.nativeEvent);

    if (pointers.current.size === 2 && pinchStartDist.current) {
      const [a, b] = Array.from(pointers.current.values());
      const factor = dist(a, b) / pinchStartDist.current;
      setZoom(pinchStartScale.current * factor, false);
    } else if (pointers.current.size === 1 && dragStart.current) {
      posRef.current = {
        x: dragStart.current.px + (e.clientX - dragStart.current.x),
        y: dragStart.current.py + (e.clientY - dragStart.current.y),
      };
      clampPos(scaleRef.current);
      applyTransform(false);
    }
  };

  const endPointer = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStartDist.current = null;
    if (pointers.current.size === 0) {
      dragStart.current = null;
      if (scaleRef.current <= MIN_SCALE) posRef.current = { x: 0, y: 0 };
      applyTransform(true);
    }
  };

  if (!src) {
    return <LoadingSpinner size="xl" className="border-white/30 border-t-white" />;
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden touch-none select-none"
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={(e) => { if (dragStart.current) endPointer(e); }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => {
          // Guard, not a dependency check -- only the very first tier to
          // actually finish loading for this photo gets to set the box.
          if (!boxSize) {
            const el = e.currentTarget;
            lockBoxSize(el.naturalWidth, el.naturalHeight);
          }
        }}
        className="object-contain rounded-lg"
        style={
          boxSize
            ? { width: boxSize.w, height: boxSize.h }
            : { maxWidth: '100%', maxHeight: fullscreen ? '100vh' : 'calc(85vh - 120px)' }
        }
      />

      {/* Shown while the modal is still displaying the 400px grid thumbnail
          because the real preview hasn't finished generating yet (a fresh
          upload or a large backfill can lag a few seconds to minutes behind
          real-time viewing) -- FilePreviewModal polls in the background and
          this disappears on its own the moment the upgrade lands. */}
      {!isOriginal && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs text-white/80">
          <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
          Low quality
        </div>
      )}

      {/* Zoom controls -- the click-driven alternative to pinch/scroll, and
          the visible affordance that zooming is even possible here. Fades
          out after a second of zoom inactivity, held open while hovered. */}
      <div
        onMouseEnter={bumpControls}
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-1.5 py-1 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(scaleRef.current - 0.75); }}
          disabled={scale <= MIN_SCALE}
          className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-white/70 text-xs w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(scaleRef.current + 0.75); }}
          disabled={scale >= MAX_SCALE}
          className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function PreviewContent({ file, previewUrl, quality, fullscreen }: { file: DriveFile; previewUrl: string; quality: 'thumbnail' | 'preview' | 'original' | null; fullscreen: boolean }) {
  const { mimeType } = file;

  if (mimeType.startsWith('image/')) {
    return <ProgressiveImage fileId={file.id} fullUrl={previewUrl} quality={quality} alt={file.name} fullscreen={fullscreen} />;
  }

  if (mimeType.startsWith('video/')) {
    return <VideoPlayer previewUrl={previewUrl} />;
  }

  if (mimeType.startsWith('audio/')) {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="w-32 h-32 rounded-2xl bg-brand-100 flex items-center justify-center">
          <svg className="w-16 h-16 text-brand-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
        </div>
        <audio src={previewUrl} controls className="w-full max-w-md">
          Your browser does not support audio playback.
        </audio>
        <p className="text-sm text-slate-500">{file.name}</p>
      </div>
    );
  }

  if (mimeType === 'application/pdf') {
    return (
      <iframe
        src={previewUrl}
        className="w-full rounded-lg border-0"
        style={{ height: 'calc(85vh - 120px)', minHeight: '400px' }}
        title={file.name}
      />
    );
  }

  // Browsers report .jsonl/.ndjson (newline-delimited JSON, otherwise plain
  // text) as application/octet-stream since they don't recognize the
  // extension -- special-cased here rather than relying on mimeType alone.
  const isJsonLines = /\.(jsonl|ndjson)$/i.test(file.name);

  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml') || isJsonLines) {
    return (
      <div className="w-full max-h-[calc(85vh-120px)] overflow-auto rounded-lg bg-white">
        <iframe
          src={previewUrl}
          className="w-full border-0 min-h-[400px] bg-white"
          style={{ height: 'calc(85vh - 120px)' }}
          title={file.name}
          sandbox="allow-same-origin"
        />
      </div>
    );
  }

  return <NoPreviewAvailable />;
}

function NoPreviewAvailable() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
        <ExternalLink className="w-10 h-10 text-slate-400" />
      </div>
      <div>
        <p className="text-base font-medium text-slate-700">Preview not available</p>
        <p className="text-sm text-slate-500 mt-1">Download the file to view it</p>
      </div>
    </div>
  );
}

const ONE_MB = 1024 * 1024;

export function FilePreviewModal({ file, onClose, onNext, onPrev, hasNext, hasPrev }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewQuality, setPreviewQuality] = useState<'thumbnail' | 'preview' | 'original' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetches the preview URL, and -- if the backend says it's still only the
  // 400px thumbnail stand-in (previewKey not generated yet) -- keeps quietly
  // re-checking every few seconds so a slow backfill/upload that finishes
  // AFTER the modal opened still upgrades on screen instead of staying stuck.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollsLeft = 20; // ~60s of retrying at 3s apart -- generous for a large backfill queue

    setIsLoading(true);
    setPreviewUrl(null);
    setPreviewQuality(null);
    setRawMode(false);
    setRawContent(null);

    const check = () => {
      getFilePreviewUrl(file.id)
        .then((data) => {
          if (cancelled) return;
          setPreviewUrl(data.previewUrl);
          setPreviewQuality(data.quality);
          setIsLoading(false);
          if (data.quality === 'thumbnail' && pollsLeft > 0) {
            pollsLeft--;
            pollTimer = setTimeout(check, 3000);
          }
        })
        .catch(() => { if (!cancelled) setIsLoading(false); });
    };
    check();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [file?.id]);

  // True browser Fullscreen API where it exists (hides tab/URL chrome too,
  // not just CSS) -- but iOS Safari has NO Fullscreen API for ordinary
  // elements at all (`Element.prototype.requestFullscreen` is simply
  // undefined there, video-only), so calling it optional-chained silently
  // no-ops and the button looks broken. Fall back to a CSS-only "maximized"
  // mode (isFullscreen state alone already drives the bigger image/hidden
  // chrome) whenever the real API is missing or its request gets rejected --
  // that's the best any web page can do on iOS, but it beats doing nothing.
  const toggleFullscreen = () => {
    if (isFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        setIsFullscreen(false);
      }
      return;
    }
    const el = modalRef.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => setIsFullscreen(true)); // rejected (e.g. Permissions-Policy) -- still give the CSS fallback
    } else {
      setIsFullscreen(true); // no Fullscreen API at all (iOS Safari)
    }
  };

  useEffect(() => {
    // Only reconcile FROM a real fullscreen transition (native exit via the
    // browser's own UI/Escape) -- don't let this fire-and-clobber the CSS
    // fallback path above, which never touches document.fullscreenElement.
    const handler = () => { if (document.fullscreenElement === null) setIsFullscreen(false); };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Fullscreen is per-photo browsing-session state, not per-file -- exit it
  // when the modal itself closes so a later unrelated open doesn't inherit it.
  useEffect(() => {
    if (!file) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, [file]);

  const handleDownload = async () => {
    if (!file) return;
    const { downloadUrl, filename } = await getFileDownloadUrl(file.id);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.click();
  };

  const handleToggleRaw = async () => {
    if (rawMode) {
      setRawMode(false);
      return;
    }
    if (!previewUrl) return;
    setRawLoading(true);
    try {
      const text = await fetch(previewUrl).then((r) => r.text());
      setRawContent(text);
      setRawMode(true);
    } catch {
      // ignore
    } finally {
      setRawLoading(false);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && hasNext) onNext?.();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev?.();
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [hasNext, hasPrev, onNext, onPrev, onClose]);

  const fileSize = file ? (typeof file.size === 'string' ? parseInt(file.size) : file.size) : 0;
  const canRaw = !!file && fileSize < ONE_MB && !!previewUrl;

  return (
    <Transition appear show={!!file} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
        </Transition.Child>

        <div ref={modalRef} className="fixed inset-0 flex flex-col bg-black">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/40">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={onClose} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
              <span className="text-white font-medium truncate text-sm">{file?.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {canRaw && (
                <button
                  onClick={handleToggleRaw}
                  disabled={rawLoading}
                  className={clsx(
                    'px-3 py-1.5 text-sm rounded-lg transition-colors font-mono',
                    rawMode
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}
                >
                  {rawLoading ? '…' : rawMode ? 'Normal' : 'Raw'}
                </button>
              )}
              {file?.mimeType.startsWith('image/') && (
                <button
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
                >
                  {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
              )}
              <button
                onClick={() => setShowInfo((s) => !s)}
                className={clsx('p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10', showInfo && 'bg-white/10 text-white')}
              >
                <Info className="w-5 h-5" />
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>

          {/* Content area */}
          <div className={clsx('flex-1 flex items-center justify-center overflow-hidden', isFullscreen ? 'gap-0 px-0' : 'gap-4 px-4')}>
            {/* Prev button */}
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Preview */}
            <div className={clsx('flex-1 flex items-center justify-center min-w-0', !isFullscreen && 'max-w-5xl')}>
              {isLoading ? (
                <LoadingSpinner size="xl" className="border-white/30 border-t-white" />
              ) : rawMode && rawContent !== null ? (
                <div
                  className="w-full overflow-auto rounded-lg bg-slate-900 p-4"
                  style={{ maxHeight: 'calc(85vh - 120px)' }}
                >
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">
                    {rawContent}
                  </pre>
                </div>
              ) : previewUrl && file ? (
                <PreviewContent file={file} previewUrl={previewUrl} quality={previewQuality} fullscreen={isFullscreen} />
              ) : (
                // getFilePreviewUrl failed, or the file has no preview URL for
                // some other reason -- show the same fallback PreviewContent
                // uses instead of rendering nothing, which reads as a stuck
                // modal (this is what the infinite-spinner reports were
                // actually hitting: isLoading correctly resolves to false,
                // but a blank void looks the same as "still working" to a
                // user watching the modal).
                <NoPreviewAvailable />
              )}
            </div>

            {/* Next button */}
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30 transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Info panel */}
          {showInfo && file && (
            <div className="absolute right-0 top-14 bottom-0 w-72 bg-black/60 backdrop-blur-md border-l border-white/10 p-4 overflow-y-auto text-white">
              <h3 className="font-semibold mb-4 text-sm">File Information</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Name</dt>
                  <dd className="break-all">{file.name}</dd>
                </div>
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Type</dt>
                  <dd className="text-white/80">{file.mimeType}</dd>
                </div>
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Size</dt>
                  <dd className="text-white/80">{formatBytes(file.size)}</dd>
                </div>
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Modified</dt>
                  <dd className="text-white/80">{formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}</dd>
                </div>
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Downloads</dt>
                  <dd className="text-white/80">{file.downloadCount}</dd>
                </div>
                {file.description && (
                  <div>
                    <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Description</dt>
                    <dd className="text-white/80">{file.description}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </Dialog>
    </Transition>
  );
}
