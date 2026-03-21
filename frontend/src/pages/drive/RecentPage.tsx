import { useState } from 'react';
import { useRecentFiles } from '../../hooks/useFiles';
import { FileList } from '../../components/files/FileList';
import { FilePreviewModal } from '../../components/files/FilePreviewModal';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { DriveFile } from '../../types';
import { Clock } from 'lucide-react';
import { getFileDownloadUrl, useTrashFile, useStarFile } from '../../hooks/useFiles';

export function RecentPage() {
  const { data: files, isLoading } = useRecentFiles();
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const trashFile = useTrashFile();
  const starFile = useStarFile();

  const allFiles = files ?? [];
  const previewIndex = previewFile ? allFiles.findIndex((f) => f.id === previewFile.id) : -1;

  const handleFileAction = async (action: string, file: DriveFile) => {
    switch (action) {
      case 'preview': setPreviewFile(file); break;
      case 'download': {
        const { downloadUrl, filename } = await getFileDownloadUrl(file.id);
        const a = document.createElement('a'); a.href = downloadUrl; a.download = filename; a.click();
        break;
      }
      case 'star': starFile.mutate(file.id); break;
      case 'trash': trashFile.mutate(file.id); break;
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Recent</h1>

      {isLoading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
      ) : allFiles.length === 0 ? (
        <EmptyState
          icon={<Clock className="w-8 h-8" />}
          title="No recent files"
          description="Files you've recently accessed or modified will appear here."
        />
      ) : (
        <FileList
          files={allFiles}
          folders={[]}
          onFileClick={(f) => setPreviewFile(f)}
          onFolderClick={() => {}}
          onFileAction={handleFileAction}
          onFolderAction={() => {}}
          sortBy="updatedAt"
          sortDir="desc"
          onSort={() => {}}
        />
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onNext={() => previewIndex < allFiles.length - 1 && setPreviewFile(allFiles[previewIndex + 1])}
          onPrev={() => previewIndex > 0 && setPreviewFile(allFiles[previewIndex - 1])}
          hasNext={previewIndex < allFiles.length - 1}
          hasPrev={previewIndex > 0}
        />
      )}
    </div>
  );
}
