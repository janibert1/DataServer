import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import {
  Search, ChevronLeft, ChevronRight, MoreVertical,
  UserX, UserCheck, Trash2, HardDrive, X, AlertTriangle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { api, getErrorMessage } from '../../lib/axios';
import { User, UserStatus } from '../../types';
import { StorageBar } from '../../components/common/StorageBar';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useAdminUsers(params: { page: number; search: string; status: string }) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: async () => {
      const res = await api.get('/admin/users', { params });
      return res.data as {
        users: User[];
        pagination: { page: number; pages: number; total: number; limit: number };
      };
    },
  });
}

function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/suspend`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('User suspended.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

function useRestoreUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/restore`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('User restored.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('User deleted.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

function useAdjustQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quotaGB }: { id: string; quotaGB: number }) =>
      api.patch(`/admin/users/${id}/quota`, { storageQuotaBytes: Math.round(quotaGB * 1024 ** 3).toString() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('Quota updated.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<UserStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PENDING_VERIFICATION: 'bg-amber-100 text-amber-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  DELETED: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  PENDING_VERIFICATION: 'Pending',
  SUSPENDED: 'Suspended',
  DELETED: 'Deleted',
};

// ── Quota Modal ───────────────────────────────────────────────────────────────
function AdjustQuotaModal({
  open, onClose, user, onSave, isPending,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onSave: (id: string, gb: number) => void;
  isPending: boolean;
}) {
  const [gb, setGb] = useState('');

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
            <Dialog.Panel className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <Dialog.Title className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-brand-600" />
                  Adjust Quota
                </Dialog.Title>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {user && (
                <p className="text-sm text-slate-500 mb-4">
                  Adjusting quota for <strong className="text-slate-700">{user.displayName}</strong>
                  <br />
                  Current quota: <strong>{(parseInt(user.storageQuotaBytes) / 1024 ** 3).toFixed(1)} GB</strong>
                </p>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">New quota (GB)</label>
                  <input
                    type="number"
                    value={gb}
                    onChange={(e) => setGb(e.target.value)}
                    placeholder="e.g. 10"
                    min="0.1"
                    step="0.5"
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={onClose}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!gb || parseFloat(gb) <= 0 || isPending}
                    onClick={() => { if (user && gb) onSave(user.id, parseFloat(gb)); }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

// ── Actions Dropdown ──────────────────────────────────────────────────────────
function UserActionsMenu({
  user,
  onSuspend,
  onRestore,
  onDelete,
  onAdjustQuota,
}: {
  user: User;
  onSuspend: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onAdjustQuota: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-44 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
            {user.status === 'SUSPENDED' ? (
              <button
                onClick={() => { setOpen(false); onRestore(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-green-700 hover:bg-green-50 transition-colors"
              >
                <UserCheck className="w-4 h-4" />
                Restore
              </button>
            ) : user.status !== 'DELETED' && (
              <button
                onClick={() => { setOpen(false); onSuspend(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors"
              >
                <UserX className="w-4 h-4" />
                Suspend
              </button>
            )}
            <button
              onClick={() => { setOpen(false); onAdjustQuota(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <HardDrive className="w-4 h-4" />
              Adjust quota
            </button>
            <div className="border-t border-slate-100" />
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete user
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [quotaUser, setQuotaUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<User | null>(null);

  const { data, isLoading } = useAdminUsers({ page, search, status: statusFilter });
  const suspend = useSuspendUser();
  const restore = useRestoreUser();
  const del = useDeleteUser();
  const adjustQuota = useAdjustQuota();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const formatBytes = (bytes: string) => {
    const n = parseInt(bytes);
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
    return `${(n / 1024 ** 3).toFixed(1)} GB`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data?.pagination.total ?? '…'} registered users
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
            Search
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_VERIFICATION">Pending</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DELETED">Deleted</option>
        </select>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Storage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Last login</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data?.users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {user.displayName?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{user.displayName}</p>
                          <p className="text-xs text-slate-400 truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={clsx(
                        'px-2 py-1 text-xs font-medium rounded-full',
                        user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-1 text-xs font-medium rounded-full', STATUS_STYLES[user.status])}>
                        {STATUS_LABELS[user.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="w-32 space-y-1">
                        <StorageBar
                          usedBytes={parseInt(user.storageUsedBytes ?? '0')}
                          totalBytes={parseInt(user.storageQuotaBytes ?? '1')}
                          compact
                        />
                        <p className="text-xs text-slate-400">
                          {formatBytes(user.storageUsedBytes ?? '0')} / {formatBytes(user.storageQuotaBytes ?? '0')}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm text-slate-500">
                      {user.lastLoginAt
                        ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <UserActionsMenu
                        user={user}
                        onSuspend={() => setConfirmSuspend(user)}
                        onRestore={() => restore.mutate(user.id)}
                        onDelete={() => setDeleteUser(user)}
                        onAdjustQuota={() => setQuotaUser(user)}
                      />
                    </td>
                  </tr>
                ))}

                {data?.users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                      No users found.
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
                Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} users
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))}
                  disabled={page >= data.pagination.pages}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AdjustQuotaModal
        open={!!quotaUser}
        onClose={() => setQuotaUser(null)}
        user={quotaUser}
        onSave={(id, gb) => adjustQuota.mutate({ id, quotaGB: gb }, { onSuccess: () => setQuotaUser(null) })}
        isPending={adjustQuota.isPending}
      />

      <ConfirmDialog
        open={!!confirmSuspend}
        onClose={() => setConfirmSuspend(null)}
        onConfirm={() => {
          if (confirmSuspend) suspend.mutate(confirmSuspend.id, { onSuccess: () => setConfirmSuspend(null) });
        }}
        title={`Suspend "${confirmSuspend?.displayName}"?`}
        description="This user will lose access to their account. You can restore them later."
        confirmLabel="Suspend user"
        variant="danger"
        isLoading={suspend.isPending}
      />

      <ConfirmDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={() => {
          if (deleteUser) del.mutate(deleteUser.id, { onSuccess: () => setDeleteUser(null) });
        }}
        title={`Delete "${deleteUser?.displayName}" permanently?`}
        description="This will permanently delete the user and all their data. This action cannot be undone."
        confirmLabel="Delete user"
        variant="danger"
        isLoading={del.isPending}
      />
    </div>
  );
}
