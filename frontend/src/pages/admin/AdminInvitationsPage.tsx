import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import {
  Key, Plus, Copy, Check, ChevronLeft, ChevronRight,
  X, Clock, Users
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { api, getErrorMessage } from '../../lib/axios';
import { Invitation, InvitationType, InvitationStatus } from '../../types';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useInvitations(params: { page: number; type?: InvitationType }) {
  return useQuery({
    queryKey: ['admin', 'invitations', params],
    queryFn: async () => {
      const res = await api.get('/admin/invitations', { params });
      return res.data as {
        invitations: Invitation[];
        pagination: { page: number; pages: number; total: number };
      };
    },
  });
}

function useCreateInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email?: string; maxUses: number; expiresAt?: string; note?: string }) =>
      api.post('/invitations', { type: 'PLATFORM', ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      toast.success('Invitation created.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/invitations/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      toast.success('Invitation revoked.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<InvitationStatus, string> = {
  PENDING: 'bg-green-100 text-green-700',
  ACCEPTED: 'bg-brand-100 text-brand-700',
  EXPIRED: 'bg-slate-100 text-slate-500',
  REVOKED: 'bg-red-100 text-red-700',
};

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied!');
  };
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Copy code">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Create Invitation Modal ───────────────────────────────────────────────────
function CreateInvitationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const create = useCreateInvitation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      email: email.trim() || undefined,
      maxUses: parseInt(maxUses),
      expiresAt: expiresAt || undefined,
      note: note.trim() || undefined,
    });
    setEmail(''); setMaxUses('1'); setExpiresAt(''); setNote('');
    onClose();
  };

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child as={Fragment}
            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
            <Dialog.Panel className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <Dialog.Title className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Key className="w-4 h-4 text-brand-600" />
                  New Invitation
                </Dialog.Title>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email (optional)</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="Restrict to specific email"
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
                  <p className="text-xs text-slate-400 mt-1">Leave blank for a general-use code.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Max uses</label>
                  <input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
                    min="1" max="100"
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                    required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Expiry date (optional)</label>
                  <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Note (optional)</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Internal note about this invitation"
                    rows={2}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={onClose}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={create.isPending}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
                    {create.isPending ? 'Creating…' : 'Create invitation'}
                  </button>
                </div>
              </form>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function AdminInvitationsPage() {
  const [activeTab, setActiveTab] = useState<'PLATFORM' | 'FOLDER_SHARE'>('PLATFORM');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);

  const { data, isLoading } = useInvitations({ page, type: activeTab });
  const revoke = useRevokeInvitation();

  const tabs = [
    { id: 'PLATFORM' as const, label: 'Platform Invitations' },
    { id: 'FOLDER_SHARE' as const, label: 'Folder Invitations' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Invitations</h1>
          <p className="text-sm text-slate-500 mt-1">Manage platform and folder access invitations</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New invitation
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setPage(1); }}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24"><LoadingSpinner size="lg" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Creator</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Uses</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Expires</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data?.invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono font-bold text-slate-800 tracking-wider">{inv.code}</code>
                        <CopyButton text={inv.code} />
                      </div>
                      {inv.email && <p className="text-xs text-slate-400 mt-0.5">{inv.email}</p>}
                      {inv.note && <p className="text-xs text-slate-400 mt-0.5 italic">{inv.note}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-1 text-xs font-medium rounded-full', STATUS_STYLES[inv.status])}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-sm text-slate-700">{inv.creator?.displayName ?? '—'}</p>
                      <p className="text-xs text-slate-400">{inv.creator?.email}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <Users className="w-3.5 h-3.5 text-slate-300" />
                        {inv.useCount} / {inv.maxUses}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {inv.expiresAt ? (
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                          <Clock className="w-3.5 h-3.5 text-slate-300" />
                          {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {inv.status === 'PENDING' && (
                        <button
                          onClick={() => setRevokeTarget(inv)}
                          className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {data?.invitations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                      No invitations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} total
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))} disabled={page >= data.pagination.pages}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CreateInvitationModal open={showCreate} onClose={() => setShowCreate(false)} />

      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) revoke.mutate(revokeTarget.id, { onSuccess: () => setRevokeTarget(null) });
        }}
        title={`Revoke invitation code "${revokeTarget?.code}"?`}
        description="This code will no longer be usable."
        confirmLabel="Revoke"
        variant="danger"
        isLoading={revoke.isPending}
      />
    </div>
  );
}
