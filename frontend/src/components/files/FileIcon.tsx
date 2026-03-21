import { File, FileText, FileImage, FileVideo, FileAudio, FileCode, FileArchive, FileSpreadsheet, Presentation } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  mimeType: string;
  className?: string;
  size?: number;
}

interface FileTypeConfig {
  icon: typeof File;
  bg: string;
  color: string;
  label: string;
}

function getFileType(mimeType: string): FileTypeConfig {
  if (mimeType.startsWith('image/')) return { icon: FileImage, bg: 'bg-pink-50', color: 'text-pink-500', label: 'Image' };
  if (mimeType.startsWith('video/')) return { icon: FileVideo, bg: 'bg-purple-50', color: 'text-purple-500', label: 'Video' };
  if (mimeType.startsWith('audio/')) return { icon: FileAudio, bg: 'bg-indigo-50', color: 'text-indigo-500', label: 'Audio' };
  if (mimeType === 'application/pdf') return { icon: FileText, bg: 'bg-red-50', color: 'text-red-500', label: 'PDF' };
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv')
    return { icon: FileSpreadsheet, bg: 'bg-green-50', color: 'text-green-500', label: 'Spreadsheet' };
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint'))
    return { icon: Presentation, bg: 'bg-orange-50', color: 'text-orange-500', label: 'Presentation' };
  if (mimeType.includes('word') || mimeType.includes('document'))
    return { icon: FileText, bg: 'bg-blue-50', color: 'text-blue-500', label: 'Document' };
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip') || mimeType.includes('compressed'))
    return { icon: FileArchive, bg: 'bg-amber-50', color: 'text-amber-500', label: 'Archive' };
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('javascript'))
    return { icon: FileCode, bg: 'bg-slate-50', color: 'text-slate-500', label: 'Text' };
  return { icon: File, bg: 'bg-slate-50', color: 'text-slate-400', label: 'File' };
}

export function FileIcon({ mimeType, className, size = 20 }: Props) {
  const config = getFileType(mimeType);
  const Icon = config.icon;

  return (
    <div className={clsx('rounded-lg flex items-center justify-center', config.bg, className)}>
      <Icon style={{ width: size, height: size }} className={config.color} />
    </div>
  );
}

export function getFileTypeLabel(mimeType: string): string {
  return getFileType(mimeType).label;
}
