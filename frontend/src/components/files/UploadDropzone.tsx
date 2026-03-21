import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CloudUpload } from 'lucide-react';
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
  const { upload } = useUploadFiles();

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (files) => upload(files, folderId),
    noClick: false,
    multiple: true,
  });

  return (
    <div {...getRootProps()} className={className}>
      <input {...getInputProps()} />
      <button className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shadow-sm">
        <Upload className="w-4 h-4" />
        Upload
      </button>
    </div>
  );
}
