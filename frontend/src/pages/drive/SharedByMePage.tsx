import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { Share2, FolderOpen, Users } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ShareModal } from '../../components/sharing/ShareModal';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

const PERMISSION_COLORS: Record<string, string> = {
  VIEWER: 'bg-slate-100 text-slate-600', DOWNLOADER: 'bg-blue-100 text-blue-700',
  CONTRIBUTOR: 'bg-green-100 text-green-700', EDITOR: 'bg-amber-100 text-amber-700',
  OWNER: 'bg-purple-100 text-purple-700',
};

export function SharedByMePage() {
  const [shareFolder, setShareFolder] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['shared', 'by-me'],
    queryFn: async () => {
      const res = await api.get('/shared/by-me');
      return res.data.shares as any[];
    },
  });

  const shares = data ?? [];

  // Group by folder
  const byFolder = shares.reduce((acc: Record<string, any>, share: any) => {
    const fid = share.folder?.id;
    if (!fid) return acc;
    if (!acc[fid]) acc[fid] = { folder: share.folder, shares: [] };
    acc[fid].shares.push(share);
    return acc;
  }, {});

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-slate-900">Shared by me</h1>
        {Object.keys(byFolder).length > 0 && (
          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
            {Object.keys(byFolder).length} folder{Object.keys(byFolder).length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
      ) : Object.keys(byFolder).length === 0 ? (
        <EmptyState
          icon={<Share2 className="w-8 h-8" />}
          title="You haven't shared anything"
          description="When you share a folder with others, it will appear here."
        />
      ) : (
        <div className="space-y-4">
          {Object.values(byFolder).map(({ folder, shares: folderShares }: any) => (
            <div key={folder.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-4 p-4 border-b border-slate-50">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{folder.name}</p>
                  <p className="text-xs text-slate-500">{folderShares.length} person{folderShares.length !== 1 ? 's' : ''} with access</p>
                </div>
                <button
                  onClick={() => setShareFolder(folder.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors"
                >
                  <Users className="w-3.5 h-3.5" />
                  Manage
                </button>
              </div>
              <div className="divide-y divide-slate-50">
                {folderShares.map((share: any) => (
                  <div key={share.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                      {share.recipient?.displayName?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{share.recipient?.displayName ?? 'Pending'}</p>
                      <p className="text-xs text-slate-400 truncate">{share.recipient?.email ?? share.recipientEmail}</p>
                    </div>
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', PERMISSION_COLORS[share.permission] ?? 'bg-slate-100 text-slate-600')}>
                      {share.permission}
                    </span>
                    <span className="text-xs text-slate-400">{formatDistanceToNow(new Date(share.createdAt), { addSuffix: true })}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {shareFolder && (
        <ShareModal open={!!shareFolder} onClose={() => setShareFolder(null)} folderId={shareFolder} />
      )}
    </div>
  );
}
