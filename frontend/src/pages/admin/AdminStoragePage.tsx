import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import { HardDrive, TrendingUp, Users, X } from 'lucide-react';
import clsx from 'clsx';
import { api, getErrorMessage } from '../../lib/axios';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';

// ── Hooks ─────────────────────────────────────────────────────────────────────
interface StorageStats {
  totalUsedBytes: string;
  totalAllocatedBytes: string;
  userCount: number;
  topUsers: {
    id: string;
    displayName: string;
    email: string;
    storageUsedBytes: string;
    storageQuotaBytes: string;
  }[];
}

function useStorageStats() {
  return useQuery({
    queryKey: ['admin', 'storage-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/storage-stats');
      return res.data as StorageStats;
    },
  });
}

function useAdjustQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quotaGB }: { id: string; quotaGB: number }) =>
      api.patch(`/admin/users/${id}/quota`, { storageQuotaBytes: Math.round(quotaGB * 1024 ** 3).toString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'storage-stats'] });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Quota updated.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function formatBytes(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function toGB(bytes: string | number): number {
  const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  return n / 1024 ** 3;
}

// ── Adjust Quota Modal ────────────────────────────────────────────────────────
function AdjustQuotaModal({
  open,
  onClose,
  user,
  onSave,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  user: StorageStats['topUsers'][0] | null;
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
                  <strong className="text-slate-700">{user.displayName}</strong>
                  <br />
                  Current: <strong>{formatBytes(user.storageQuotaBytes)}</strong>
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

// ── Percent bar ───────────────────────────────────────────────────────────────
function PercentBar({ percent }: { percent: number }) {
  const color = percent >= 95 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function AdminStoragePage() {
  const { data, isLoading } = useStorageStats();
  const adjustQuota = useAdjustQuota();
  const [quotaUser, setQuotaUser] = useState<StorageStats['topUsers'][0] | null>(null);

  const totalUsed = parseInt(data?.totalUsedBytes ?? '0');
  const totalAllocated = parseInt(data?.totalAllocatedBytes ?? '1');
  const overallPercent = totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Storage</h1>
        <p className="text-sm text-slate-500 mt-1">Platform-wide storage usage overview</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-brand-600" />
                </div>
                <p className="text-sm font-medium text-slate-600">Total used</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">{formatBytes(data?.totalUsedBytes ?? '0')}</p>
              <p className="text-sm text-slate-500 mt-1">of {formatBytes(data?.totalAllocatedBytes ?? '0')} allocated</p>
              <div className="mt-3">
                <PercentBar percent={overallPercent} />
                <p className="text-xs text-slate-400 mt-1">{overallPercent}% utilized</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-sm font-medium text-slate-600">Available</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {formatBytes(Math.max(0, totalAllocated - totalUsed))}
              </p>
              <p className="text-sm text-slate-500 mt-1">free across platform</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <p className="text-sm font-medium text-slate-600">Users</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">{data?.userCount ?? 0}</p>
              <p className="text-sm text-slate-500 mt-1">registered accounts</p>
            </div>
          </div>

          {/* Top users by storage */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Top users by storage</h2>
              <p className="text-sm text-slate-500 mt-0.5">Users with the highest storage consumption</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Used</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Quota</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usage</th>
                    <th className="w-28" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data?.topUsers.map((user) => {
                    const used = parseInt(user.storageUsedBytes);
                    const quota = parseInt(user.storageQuotaBytes);
                    const percent = quota > 0 ? Math.round((used / quota) * 100) : 0;
                    return (
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
                          <span className="text-sm font-medium text-slate-800">{formatBytes(user.storageUsedBytes)}</span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-sm text-slate-500">{formatBytes(user.storageQuotaBytes)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1 min-w-24">
                            <PercentBar percent={percent} />
                            <p className="text-xs text-slate-500">{percent}%</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setQuotaUser(user)}
                            className="px-2.5 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors"
                          >
                            Adjust quota
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {(!data?.topUsers || data.topUsers.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                        No usage data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <AdjustQuotaModal
        open={!!quotaUser}
        onClose={() => setQuotaUser(null)}
        user={quotaUser}
        onSave={(id, gb) => adjustQuota.mutate({ id, quotaGB: gb }, { onSuccess: () => setQuotaUser(null) })}
        isPending={adjustQuota.isPending}
      />
    </div>
  );
}
