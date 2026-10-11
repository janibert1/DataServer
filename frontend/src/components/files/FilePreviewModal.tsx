import { Fragment, useState, useEffect, useRef, WheelEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Images,
  Maximize,
} from 'lucide-react';
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
  onSelectFile?: (file: DriveFile) => void;
}

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
      className="max-w-full max-h-full rounded-lg bg-black object-contain"
    >
      Your browser does not support video playback.
    </video>
  );
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function dist(a: PointerEvent, b: PointerEvent) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

interface ProgressiveImageProps {
  fileId: string;
  fullUrl: string;
  quality: 'thumbnail' | 'preview' | 'original' | null;
  alt: string;
  fullscreen: boolean;
  chromeVisible: boolean;
  onToggleChrome: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

function ProgressiveImage({
  fileId,
  fullUrl,
  quality,
  alt,
  fullscreen,
  chromeVisible,
  onToggleChrome,
  onNext,
  onPrev,
}: ProgressiveImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [isOriginal, setIsOriginal] = useState(false);
  const [rotation, setRotation] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  const naturalDimsRef = useRef<{ w: number; h: number } | null>(null);
  const containerDimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const pointers = useRef(new Map<number, PointerEvent>());
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const dragDistance = useRef(0);

  const [controlsVisible, setControlsVisible] = useState(false);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpControls = () => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 2000);
  };
  useEffect(() => () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); }, []);

  // Update container dimensions with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerDimsRef.current = {
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        };
        if (scaleRef.current > 1) {
          clampPos(scaleRef.current);
          applyTransform(false);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const clampPos = (s: number) => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const isRotated = rotation % 180 !== 0;
    const renderW = isRotated ? img.offsetHeight : img.offsetWidth;
    const renderH = isRotated ? img.offsetWidth : img.offsetHeight;
    const scaledW = renderW * s;
    const scaledH = renderH * s;
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
    el.style.transition = animate ? 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
    el.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px) scale(${scaleRef.current}) rotate(${rotation}deg)`;
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

  const rotateImage = () => {
    setRotation((r) => (r + 90) % 360);
    bumpControls();
  };

  const zoomTo100Percent = () => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !naturalDimsRef.current) return;
    const renderedW = img.offsetWidth;
    if (renderedW > 0) {
      const scale100 = naturalDimsRef.current.w / renderedW;
      setZoom(Math.max(1, scale100));
    }
  };

  // Reset zoom/pan/rotation when navigating to a different photo
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setIsOriginal(false);
    setRotation(0);
    naturalDimsRef.current = null;
    scaleRef.current = 1;
    posRef.current = { x: 0, y: 0 };
    setScale(1);

    getFileThumbnailUrl(fileId)
      .then((data) => { if (!cancelled) setSrc((cur) => cur ?? data.thumbnailUrl); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [fileId]);

  // Preload and swap previewUrl -> originalUrl
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
          orig.onload = () => {
            if (!cancelled) {
              setSrc(data.originalUrl);
              setIsOriginal(true);
            }
          };
          orig.src = data.originalUrl;
        })
        .catch(() => {});
    };
    img.onerror = () => { if (!cancelled) setSrc((cur) => cur ?? fullUrl); };
    img.src = fullUrl;
    return () => { cancelled = true; };
  }, [fullUrl, fileId, quality]);

  useEffect(() => { applyTransform(false); }, [src, rotation]);

  // Smooth wheel zoom centered on cursor
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    const delta = -e.deltaY * 0.003;
    const curScale = scaleRef.current;
    const nextScale = clamp(curScale * (1 + delta), MIN_SCALE, MAX_SCALE);
    if (nextScale === curScale) return;
    const ratio = nextScale / curScale;
    posRef.current = {
      x: mouseX - (mouseX - posRef.current.x) * ratio,
      y: mouseY - (mouseY - posRef.current.y) * ratio,
    };
    setZoom(nextScale, false);
  };

  const handleDoubleClick = (e: MouseEvent) => {
    if (scaleRef.current > 1) {
      setZoom(1);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
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
    dragDistance.current = 0;

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStartDist.current = dist(a, b);
      pinchStartScale.current = scaleRef.current;
      dragStart.current = null;
    } else if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, px: posRef.current.x, py: posRef.current.y };
      if (imgRef.current && scaleRef.current > 1) imgRef.current.style.cursor = 'grabbing';
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
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      dragDistance.current = Math.hypot(dx, dy);

      if (scaleRef.current > 1) {
        posRef.current = {
          x: dragStart.current.px + dx,
          y: dragStart.current.py + dy,
        };
        clampPos(scaleRef.current);
        applyTransform(false);
      }
    }
  };

  const endPointer = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStartDist.current = null;

    if (pointers.current.size === 0) {
      // Check for swipe navigation or tap
      if (dragStart.current) {
        const dx = e.clientX - dragStart.current.x;
        // Horizontal swipe to navigate when not zoomed
        if (scaleRef.current <= 1 && Math.abs(dx) > 60 && Math.abs(e.clientY - dragStart.current.y) < 80) {
          if (dx < 0 && onNext) onNext();
          else if (dx > 0 && onPrev) onPrev();
        } else if (dragDistance.current < 5) {
          // Clean tap without drag -> toggle UI chrome (like iOS Photos & Google Photos)
          onToggleChrome();
        }
      }

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
        decoding="async"
        onLoad={(e) => {
          const el = e.currentTarget;
          naturalDimsRef.current = { w: el.naturalWidth, h: el.naturalHeight };
        }}
        className="max-w-full max-h-full object-contain rounded-lg will-change-transform"
      />

      {/* Low quality indicator while still on thumbnail tier */}
      {!isOriginal && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 text-xs text-white/90 shadow-md">
          <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
          <span>Enhancing quality…</span>
        </div>
      )}

      {/* Floating Zoom & Tool Controls Bar */}
      <div
        onMouseEnter={bumpControls}
        className={clsx(
          'absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/65 backdrop-blur-md rounded-full px-2.5 py-1.5 shadow-2xl border border-white/10 transition-all duration-300 z-30',
          controlsVisible || chromeVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(scaleRef.current - 0.75); }}
          disabled={scale <= MIN_SCALE}
          title="Zoom out"
          className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15 disabled:opacity-30 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (scale > 1) setZoom(1);
            else zoomTo100Percent();
          }}
          title="Click to toggle Fit / 100%"
          className="px-2 py-1 rounded-full text-white/90 hover:text-white hover:bg-white/10 text-xs tabular-nums font-medium transition-colors"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setZoom(scaleRef.current + 0.75); }}
          disabled={scale >= MAX_SCALE}
          title="Zoom in"
          className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15 disabled:opacity-30 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-white/20 mx-1" />

        <button
          onClick={(e) => { e.stopPropagation(); setZoom(1); }}
          title="Fit to screen"
          className={clsx(
            'px-2 py-1 rounded-full text-xs font-medium transition-colors',
            scale === 1 ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
          )}
        >
          Fit
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); zoomTo100Percent(); }}
          title="100% (1:1 actual pixels)"
          className="px-2 py-1 rounded-full text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          100%
        </button>

        <div className="w-px h-4 bg-white/20 mx-1" />

        <button
          onClick={(e) => { e.stopPropagation(); rotateImage(); }}
          title="Rotate 90°"
          className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function PreviewContent({
  file,
  previewUrl,
  quality,
  fullscreen,
  chromeVisible,
  onToggleChrome,
  onNext,
  onPrev,
}: {
  file: DriveFile;
  previewUrl: string;
  quality: 'thumbnail' | 'preview' | 'original' | null;
  fullscreen: boolean;
  chromeVisible: boolean;
  onToggleChrome: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}) {
  const { mimeType } = file;

  if (mimeType.startsWith('image/')) {
    return (
      <ProgressiveImage
        fileId={file.id}
        fullUrl={previewUrl}
        quality={quality}
        alt={file.name}
        fullscreen={fullscreen}
        chromeVisible={chromeVisible}
        onToggleChrome={onToggleChrome}
        onNext={onNext}
        onPrev={onPrev}
      />
    );
  }

  if (mimeType.startsWith('video/')) {
    return <VideoPlayer previewUrl={previewUrl} />;
  }

  if (mimeType.startsWith('audio/')) {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="w-32 h-32 rounded-2xl bg-brand-100 flex items-center justify-center">
          <svg className="w-16 h-16 text-brand-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
        <audio src={previewUrl} controls className="w-full max-w-md">
          Your browser does not support audio playback.
        </audio>
        <p className="text-sm text-slate-300">{file.name}</p>
      </div>
    );
  }

  if (mimeType === 'application/pdf') {
    return (
      <iframe
        src={previewUrl}
        className="w-full h-full rounded-lg border-0 bg-slate-900"
        title={file.name}
      />
    );
  }

  const isJsonLines = /\.(jsonl|ndjson)$/i.test(file.name);
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml') || isJsonLines) {
    return (
      <div className="w-full h-full max-w-5xl overflow-auto rounded-lg bg-white">
        <iframe
          src={previewUrl}
          className="w-full h-full min-h-[400px] border-0 bg-white"
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
      <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center">
        <ExternalLink className="w-10 h-10 text-slate-400" />
      </div>
      <div>
        <p className="text-base font-medium text-slate-200">Preview not available</p>
        <p className="text-sm text-slate-400 mt-1">Download the file to view it</p>
      </div>
    </div>
  );
}

// Bottom Filmstrip Thumbnail item
function FilmstripItem({
  file,
  isActive,
  onClick,
}: {
  file: DriveFile;
  isActive: boolean;
  onClick: () => void;
}) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    getFileThumbnailUrl(file.id)
      .then((d) => { if (!cancelled) setThumbSrc(d.thumbnailUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [file.id]);

  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [isActive]);

  return (
    <button
      ref={itemRef}
      onClick={onClick}
      className={clsx(
        'relative w-14 h-14 rounded-lg overflow-hidden shrink-0 transition-all duration-200 bg-slate-800 focus:outline-none',
        isActive
          ? 'ring-2 ring-brand-500 scale-105 shadow-lg opacity-100'
          : 'opacity-60 hover:opacity-100 hover:scale-100'
      )}
    >
      {thumbSrc ? (
        <img
          src={thumbSrc}
          alt={file.name}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px] p-1 truncate">
          {file.name}
        </div>
      )}
    </button>
  );
}

const ONE_MB = 1024 * 1024;

export function FilePreviewModal({
  file,
  files,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  onSelectFile,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewQuality, setPreviewQuality] = useState<'thumbnail' | 'preview' | 'original' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [rawMode, setRawMode] = useState(false);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Compute navigation and media list if files array is supplied
  const mediaFiles = files?.filter((f) => f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/')) ?? [];
  const currentIndex = file && files ? files.findIndex((f) => f.id === file.id) : -1;
  const effectiveHasNext = hasNext ?? (currentIndex >= 0 && currentIndex < (files?.length ?? 0) - 1);
  const effectiveHasPrev = hasPrev ?? (currentIndex > 0);

  const effectiveOnNext = () => {
    if (onNext) onNext();
    else if (files && currentIndex >= 0 && currentIndex < files.length - 1) {
      onSelectFile?.(files[currentIndex + 1]);
    }
  };

  const effectiveOnPrev = () => {
    if (onPrev) onPrev();
    else if (files && currentIndex > 0) {
      onSelectFile?.(files[currentIndex - 1]);
    }
  };

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollsLeft = 20;

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
        .catch(() => setIsFullscreen(true));
    } else {
      setIsFullscreen(true);
    }
  };

  useEffect(() => {
    const handler = () => { if (document.fullscreenElement === null) setIsFullscreen(false); };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

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

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && effectiveHasNext) {
        effectiveOnNext();
      } else if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && effectiveHasPrev) {
        effectiveOnPrev();
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'i' || e.key === 'I') {
        setShowInfo((s) => !s);
      } else if (e.key === ' ' || e.key === 'h' || e.key === 'H') {
        setChromeVisible((v) => !v);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [effectiveHasNext, effectiveHasPrev, effectiveOnNext, effectiveOnPrev, onClose, isFullscreen]);

  const fileSize = file ? (typeof file.size === 'string' ? parseInt(file.size) : file.size) : 0;
  const canRaw = !!file && fileSize < ONE_MB && !!previewUrl;
  const isImage = file?.mimeType.startsWith('image/');

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
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md" />
        </Transition.Child>

        <div ref={modalRef} className="fixed inset-0 flex flex-col bg-black overflow-hidden select-none">
          {/* Header Bar — Fades out when chrome is toggled off */}
          <div
            className={clsx(
              'absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-all duration-300',
              chromeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/15 flex-shrink-0 transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <span className="text-white font-medium truncate text-sm block">{file?.name}</span>
                {files && files.length > 1 && (
                  <span className="text-white/50 text-xs">
                    {currentIndex + 1} of {files.length}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {canRaw && (
                <button
                  onClick={handleToggleRaw}
                  disabled={rawLoading}
                  className={clsx(
                    'px-3 py-1.5 text-xs rounded-lg transition-colors font-mono',
                    rawMode ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}
                >
                  {rawLoading ? '…' : rawMode ? 'Normal' : 'Raw'}
                </button>
              )}

              {/* Filmstrip toggle button */}
              {mediaFiles.length > 1 && (
                <button
                  onClick={() => setShowFilmstrip((s) => !s)}
                  title={showFilmstrip ? 'Hide filmstrip' : 'Show filmstrip'}
                  className={clsx(
                    'p-2 rounded-xl transition-colors',
                    showFilmstrip ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}
                >
                  <Images className="w-5 h-5" />
                </button>
              )}

              {/* Fullscreen button */}
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>

              {/* Info button */}
              <button
                onClick={() => setShowInfo((s) => !s)}
                title="File information (I)"
                className={clsx(
                  'p-2 rounded-xl transition-colors',
                  showInfo ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                )}
              >
                <Info className="w-5 h-5" />
              </button>

              {/* Download button */}
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded-xl transition-colors shadow-sm ml-1"
                title="Download file"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>
          </div>

          {/* Minimal Corner Control to reveal chrome when hidden */}
          {!chromeVisible && (
            <button
              onClick={() => setChromeVisible(true)}
              className="absolute top-4 right-4 z-40 p-2 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md text-white/70 hover:text-white transition-all shadow-lg"
              title="Show controls (Space)"
            >
              <Maximize className="w-4 h-4" />
            </button>
          )}

          {/* Floating Prev Button Overlay */}
          {effectiveHasPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); effectiveOnPrev(); }}
              className={clsx(
                'absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/45 hover:bg-black/75 backdrop-blur-md text-white/90 hover:text-white flex items-center justify-center transition-all shadow-xl hover:scale-105 border border-white/10',
                chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none hover:opacity-100'
              )}
              title="Previous photo (← or A)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Floating Next Button Overlay */}
          {effectiveHasNext && (
            <button
              onClick={(e) => { e.stopPropagation(); effectiveOnNext(); }}
              className={clsx(
                'absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/45 hover:bg-black/75 backdrop-blur-md text-white/90 hover:text-white flex items-center justify-center transition-all shadow-xl hover:scale-105 border border-white/10',
                chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none hover:opacity-100'
              )}
              title="Next photo (→ or D)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Main Photo / Preview Canvas */}
          <div className="flex-1 w-full h-full relative flex items-center justify-center overflow-hidden">
            {isLoading ? (
              <LoadingSpinner size="xl" className="border-white/30 border-t-white" />
            ) : rawMode && rawContent !== null ? (
              <div className="w-full max-w-5xl h-full p-6 overflow-auto">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all bg-slate-900/90 p-4 rounded-xl">
                  {rawContent}
                </pre>
              </div>
            ) : previewUrl && file ? (
              <PreviewContent
                file={file}
                previewUrl={previewUrl}
                quality={previewQuality}
                fullscreen={isFullscreen}
                chromeVisible={chromeVisible}
                onToggleChrome={() => setChromeVisible((v) => !v)}
                onNext={effectiveHasNext ? effectiveOnNext : undefined}
                onPrev={effectiveHasPrev ? effectiveOnPrev : undefined}
              />
            ) : (
              <NoPreviewAvailable />
            )}
          </div>

          {/* Bottom Filmstrip Gallery Strip */}
          {showFilmstrip && mediaFiles.length > 1 && (
            <div
              className={clsx(
                'z-40 w-full bg-black/60 backdrop-blur-md border-t border-white/10 px-4 py-2 transition-all duration-300 flex items-center justify-center',
                chromeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
              )}
            >
              <div className="flex items-center gap-2 overflow-x-auto max-w-4xl py-1 no-scrollbar scroll-smooth">
                {mediaFiles.map((f) => (
                  <FilmstripItem
                    key={f.id}
                    file={f}
                    isActive={f.id === file?.id}
                    onClick={() => onSelectFile?.(f)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* File Information Sidebar Panel */}
          {showInfo && file && (
            <div className="absolute right-0 top-14 bottom-0 w-80 bg-black/75 backdrop-blur-xl border-l border-white/10 p-6 overflow-y-auto text-white z-50 shadow-2xl">
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/10">
                <h3 className="font-semibold text-sm text-white">File Information</h3>
                <button
                  onClick={() => setShowInfo(false)}
                  className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Name</dt>
                  <dd className="break-all font-medium text-white/95">{file.name}</dd>
                </div>
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Type</dt>
                  <dd className="text-white/85 font-mono text-xs">{file.mimeType}</dd>
                </div>
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Size</dt>
                  <dd className="text-white/85">{formatBytes(file.size)}</dd>
                </div>
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Modified</dt>
                  <dd className="text-white/85">
                    {formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Downloads</dt>
                  <dd className="text-white/85">{file.downloadCount}</dd>
                </div>
                {file.description && (
                  <div>
                    <dt className="text-white/50 text-xs uppercase tracking-wider mb-1">Description</dt>
                    <dd className="text-white/85 leading-relaxed">{file.description}</dd>
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
