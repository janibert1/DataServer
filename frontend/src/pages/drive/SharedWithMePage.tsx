import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { Users, FolderOpen, ChevronRight } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

const PERMISSION_COLORS: Record<string, string> = {
  VIEWER: 'bg-slate-100 text-slate-600', DOWNLOADER: 'bg-blue-100 text-blue-700',
  CONTRIBUTOR: 'bg-green-100 text-green-700', EDITOR: 'bg-amber-100 text-amber-700',
  OWNER: 'bg-purple-100 text-purple-700',
};

export function SharedWithMePage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['shared', 'with-me'],
    queryFn: async () => {
      const res = await api.get('/shared/with-me');
      return res.data.shares as any[];
    },
  });

  const shares = data ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-slate-900">Shared with me</h1>
        {shares.length > 0 && (
          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{shares.length}</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
      ) : shares.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8" />}
          title="Nothing shared with you"
          description="When someone shares a folder with you, it will appear here."
        />
      ) : (
        <div className="grid gap-3">
          {shares.map((share: any) => (
            <div
              key={share.shareId}
              onClick={() => navigate(`/drive/folder/${share.folder.id}`)}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-card-hover cursor-pointer transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <FolderOpen className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{share.folder.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Shared by{' '}
                  <span className="font-medium">{share.folder.owner?.displayName ?? 'Unknown'}</span>
                  {' · '}
                  {formatDistanceToNow(new Date(share.sharedAt), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', PERMISSION_COLORS[share.permission] ?? 'bg-slate-100 text-slate-600')}>
                  {share.permission}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
