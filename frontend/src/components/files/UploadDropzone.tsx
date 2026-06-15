import { useCallback, useRef, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CloudUpload, FolderUp } from 'lucide-react';
import clsx from 'clsx';
import { useUploadFiles } from '../../hooks/useFiles';
import { useAuthStore } from '../../store/authStore';

interface Props {
  folderId?: string | null;
  children?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function UploadDropzone({ folderId, children, className, compact = false }: Props) {
  const { upload } = useUploadFiles();
  const { user } = useAuthStore();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        upload(acceptedFiles, folderId);
      }
    },
    [upload, folderId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: !compact,
    noKeyboard: !compact,
  });

  if (compact) {
    return (
      <div {...getRootProps()} className={clsx('cursor-pointer', className)}>
        <input {...getInputProps()} />
        {children}
      </div>
    );
  }

  return (
    <div {...getRootProps()} className={clsx('relative', className)}>
      <input {...getInputProps()} />
      {children}

      {/* Full-page drag overlay */}
      {isDragActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-600/10 backdrop-blur-sm border-4 border-dashed border-brand-400 m-4 rounded-2xl">
          <div className="flex flex-col items-center gap-4 text-brand-600">
            <CloudUpload className="w-20 h-20 animate-bounce" />
            <p className="text-2xl font-bold">Drop files to upload</p>
            {folderId ? (
              <p className="text-sm text-brand-500">Files will be added to the current folder</p>
            ) : (
              <p className="text-sm text-brand-500">Files will be added to My Drive</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function UploadButton({ folderId, className }: { folderId?: string | null; className?: string }) {
  const { upload, uploadFolder } = useUploadFiles();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('multiple', '');
    }
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const close = () => setIsMenuOpen(false);
    document.addEventListener('click', close, { once: true });
    return () => document.removeEventListener('click', close);
  }, [isMenuOpen]);

  return (
    <div className={clsx('relative inline-flex', className)}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsMenuOpen((v: boolean) => !v); }}
        className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
      >
        <Upload className="w-4 h-4" />
        Upload
        <svg className="w-3 h-3 ml-0.5" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4"/></svg>
      </button>

      {isMenuOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50">
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => { setIsMenuOpen(false); fileInputRef.current?.click(); }}
          >
            <Upload className="w-4 h-4 text-slate-400" />
            Upload files
          </button>
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => { setIsMenuOpen(false); folderInputRef.current?.click(); }}
          >
            <FolderUp className="w-4 h-4 text-slate-400" />
            Upload folder
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) upload(Array.from(e.target.files), folderId); e.target.value = ''; }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={(e) => { if (!e.target.files) return; const _fl = e.target.files, _el = e.target; uploadFolder(_fl, folderId).finally(() => { _el.value = ''; }); }}
      />
    </div>
  );
}
