import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, Download, ChevronLeft, ChevronRight, ExternalLink, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { DriveFile } from '../../types';
import { getFileDownloadUrl, getFilePreviewUrl } from '../../hooks/useFiles';
import { LoadingSpinner } from '../common/LoadingSpinner';
import clsx from 'clsx';

interface Props {
  file: DriveFile | null;
  files?: DriveFile[];
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

function formatBytes(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function PreviewContent({ file, previewUrl }: { file: DriveFile; previewUrl: string }) {
  const { mimeType } = file;

  if (mimeType.startsWith('image/')) {
    return (
      <img
        src={previewUrl}
        alt={file.name}
        className="max-w-full max-h-full object-contain rounded-lg"
        style={{ maxHeight: 'calc(85vh - 120px)' }}
      />
    );
  }

  if (mimeType.startsWith('video/')) {
    return (
      <video
        src={previewUrl}
        controls
        className="max-w-full rounded-lg bg-black"
        style={{ maxHeight: 'calc(85vh - 120px)' }}
      >
        Your browser does not support video playback.
      </video>
    );
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

  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml')) {
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

export function FilePreviewModal({ file, onClose, onNext, onPrev, hasNext, hasPrev }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (!file) return;
    setIsLoading(true);
    setPreviewUrl(null);
    getFilePreviewUrl(file.id)
      .then((data) => setPreviewUrl(data.previewUrl))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [file?.id]);

  const handleDownload = async () => {
    if (!file) return;
    const { downloadUrl, filename } = await getFileDownloadUrl(file.id);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.click();
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && hasNext) onNext?.();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev?.();
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [hasNext, hasPrev, onNext, onPrev, onClose]);

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

        <div className="fixed inset-0 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/40">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={onClose} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
              <span className="text-white font-medium truncate text-sm">{file?.name}</span>
            </div>
            <div className="flex items-center gap-2">
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
          <div className="flex-1 flex items-center justify-center gap-4 px-4 overflow-hidden">
            {/* Prev button */}
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Preview */}
            <div className="flex-1 flex items-center justify-center min-w-0 max-w-5xl">
              {isLoading ? (
                <LoadingSpinner size="xl" className="border-white/30 border-t-white" />
              ) : previewUrl && file ? (
                <PreviewContent file={file} previewUrl={previewUrl} />
              ) : null}
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
