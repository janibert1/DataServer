import clsx from 'clsx';
import { HardDrive } from 'lucide-react';

interface Props {
  usedBytes: number;
  totalBytes: number;
  compact?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function StorageBar({ usedBytes, totalBytes, compact = false }: Props) {
  const percent = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;
  const isWarning = percent >= 80;
  const isCritical = percent >= 95;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <HardDrive className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{formatBytes(usedBytes)} / {formatBytes(totalBytes)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-slate-500">
          <HardDrive className="w-3.5 h-3.5" />
          <span>Storage</span>
        </div>
        <span className={clsx(
          'font-medium',
          isCritical ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-600'
        )}>
          {percent}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500',
            isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-brand-500'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-slate-400">
        {formatBytes(usedBytes)} of {formatBytes(totalBytes)} used
      </p>
    </div>
  );
}
