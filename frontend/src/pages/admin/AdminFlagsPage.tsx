import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, FileText, Folder, User, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { api, getErrorMessage } from '../../lib/axios';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────
type FlagStatus = 'PENDING' | 'REVIEWED' | 'DISMISSED' | 'ACTIONED';

interface ContentFlag {
  id: string;
  reporterId: string;
  reporter?: { id: string; displayName: string; email: string };
  entityType: 'FILE' | 'FOLDER';
  entityId: string;
  entityName?: string;
  reason: string;
  status: FlagStatus;
  reviewedAt: string | null;
  reviewedBy?: { id: string; displayName: string } | null;
  createdAt: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useFlags(status: string) {
  return useQuery({
    queryKey: ['admin', 'flags', status],
    queryFn: async () => {
      const res = await api.get('/admin/flags', { params: { status: status || undefined } });
      return res.data.flags as ContentFlag[];
    },
  });
}

function useUpdateFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.patch(`/admin/flags/${id}`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'flags'] });
      toast.success('Flag updated.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Flag Card ─────────────────────────────────────────────────────────────────
function FlagCard({
  flag,
  onDismiss,
  onQuarantine,
  onSuspend,
}: {
  flag: ContentFlag;
  onDismiss: () => void;
  onQuarantine: () => void;
  onSuspend: () => void;
}) {
  const isFile = flag.entityType === 'FILE';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start gap-4">
        {/* Entity icon */}
        <div className={clsx(
          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
          isFile ? 'bg-brand-50' : 'bg-amber-50'
        )}>
          {isFile
            ? <FileText className="w-5 h-5 text-brand-600" />
            : <Folder className="w-5 h-5 text-amber-600" />
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {isFile ? 'File' : 'Folder'}
            </span>
            {flag.entityName && (
              <span className="text-sm font-semibold text-slate-800 truncate">"{flag.entityName}"</span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
            <User className="w-3.5 h-3.5" />
            <span>Reported by <strong className="text-slate-700">{flag.reporter?.displayName ?? 'Unknown'}</strong></span>
            <span>·</span>
            <span>{formatDistanceToNow(new Date(flag.createdAt), { addSuffix: true })}</span>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{flag.reason}</p>
            </div>
          </div>

          {flag.status === 'PENDING' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onDismiss}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                Dismiss
              </button>
              <button
                onClick={onQuarantine}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Quarantine (delete content)
              </button>
              <button
                onClick={onSuspend}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <User className="w-3.5 h-3.5" />
                Suspend reporter
              </button>
            </div>
          )}

          {flag.status !== 'PENDING' && (
            <div className={clsx(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              flag.status === 'DISMISSED' ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-700'
            )}>
              {flag.status === 'DISMISSED' ? (
                <><CheckCircle className="w-3 h-3" /> Dismissed</>
              ) : (
                <><XCircle className="w-3 h-3" /> Actioned</>
              )}
              {flag.reviewedBy && (
                <span className="text-slate-500 ml-1">by {flag.reviewedBy.displayName}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function AdminFlagsPage() {
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [confirmAction, setConfirmAction] = useState<{
    flag: ContentFlag;
    action: 'dismiss' | 'quarantine' | 'suspend_reporter';
  } | null>(null);

  const { data: flags, isLoading } = useFlags(statusFilter);
  const updateFlag = useUpdateFlag();

  const handleConfirm = () => {
    if (!confirmAction) return;
    updateFlag.mutate(
      { id: confirmAction.flag.id, action: confirmAction.action },
      { onSuccess: () => setConfirmAction(null) }
    );
  };

  const tabs = [
    { id: 'PENDING', label: 'Pending' },
    { id: 'REVIEWED', label: 'Reviewed' },
    { id: '', label: 'All' },
  ];

  const confirmMessages: Record<string, { title: string; description: string; label: string }> = {
    dismiss: {
      title: 'Dismiss this flag?',
      description: 'The content will remain available and the flag will be marked as dismissed.',
      label: 'Dismiss',
    },
    quarantine: {
      title: 'Quarantine this content?',
      description: 'The flagged content will be permanently deleted. This action cannot be undone.',
      label: 'Quarantine & delete',
    },
    suspend_reporter: {
      title: 'Suspend the reporter?',
      description: "The user who reported this content will have their account suspended.",
      label: 'Suspend reporter',
    },
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Content Flags</h1>
        <p className="text-sm text-slate-500 mt-1">Review user-reported content</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              statusFilter === tab.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24"><LoadingSpinner size="lg" /></div>
      ) : !flags || flags.length === 0 ? (
        <EmptyState
          icon={<Flag className="w-8 h-8" />}
          title="No flags found"
          description={statusFilter === 'PENDING' ? 'No pending content flags to review.' : 'No flags match the selected filter.'}
        />
      ) : (
        <div className="space-y-4">
          {flags.map((flag) => (
            <FlagCard
              key={flag.id}
              flag={flag}
              onDismiss={() => setConfirmAction({ flag, action: 'dismiss' })}
              onQuarantine={() => setConfirmAction({ flag, action: 'quarantine' })}
              onSuspend={() => setConfirmAction({ flag, action: 'suspend_reporter' })}
            />
          ))}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <ConfirmDialog
          open={true}
          onClose={() => setConfirmAction(null)}
          onConfirm={handleConfirm}
          title={confirmMessages[confirmAction.action]?.title ?? 'Confirm action'}
          description={confirmMessages[confirmAction.action]?.description}
          confirmLabel={confirmMessages[confirmAction.action]?.label ?? 'Confirm'}
          variant="danger"
          isLoading={updateFlag.isPending}
        />
      )}
    </div>
  );
}
