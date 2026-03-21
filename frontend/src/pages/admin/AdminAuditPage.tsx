import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { api } from '../../lib/axios';
import { AuditLog, AuditAction } from '../../types';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useAuditLogs(params: {
  page: number;
  action?: string;
  from?: string;
  to?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: async () => {
      const res = await api.get('/admin/audit', { params });
      return res.data as {
        logs: AuditLog[];
        pagination: { page: number; pages: number; total: number };
      };
    },
  });
}

// ── Action badge colors ───────────────────────────────────────────────────────
function getActionColor(action: string): string {
  if (action.includes('LOGIN')) return 'bg-brand-100 text-brand-700';
  if (action.includes('DELETED') || action.includes('PERMANENTLY')) return 'bg-red-100 text-red-700';
  if (action.includes('CREATED') || action.includes('REGISTERED') || action.includes('UPLOADED')) return 'bg-green-100 text-green-700';
  if (action.includes('SUSPENDED') || action.includes('FLAGGED') || action.includes('VIRUS')) return 'bg-amber-100 text-amber-700';
  if (action.includes('SHARED') || action.includes('PERMISSION')) return 'bg-purple-100 text-purple-700';
  return 'bg-slate-100 text-slate-600';
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Log details ───────────────────────────────────────────────────────────────
function LogDetailsToggle({ details }: { details: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!details || Object.keys(details).length === 0) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Details
      </button>
      {open && (
        <pre className="mt-1.5 p-2 bg-slate-50 rounded text-xs font-mono text-slate-600 overflow-x-auto max-w-xs">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Action types for filter ───────────────────────────────────────────────────
const ACTION_GROUPS = [
  { label: 'Authentication', actions: ['USER_LOGIN', 'USER_LOGOUT', 'USER_LOGIN_FAILED', 'USER_REGISTERED', 'EMAIL_VERIFIED'] },
  { label: 'Files', actions: ['FILE_UPLOADED', 'FILE_DOWNLOADED', 'FILE_DELETED', 'FILE_RESTORED', 'FILE_PERMANENTLY_DELETED', 'FILE_MOVED', 'FILE_RENAMED'] },
  { label: 'Folders', actions: ['FOLDER_CREATED', 'FOLDER_DELETED', 'FOLDER_RENAMED', 'FOLDER_MOVED', 'FOLDER_SHARED', 'FOLDER_UNSHARED'] },
  { label: 'Security', actions: ['PASSWORD_CHANGED', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'SUSPICIOUS_LOGIN'] },
  { label: 'Admin', actions: ['USER_SUSPENDED', 'USER_RESTORED', 'USER_DELETED', 'QUOTA_CHANGED', 'ADMIN_ACTION'] },
];

// ── CSV Export ────────────────────────────────────────────────────────────────
async function exportCSV(params: { action?: string; from?: string; to?: string; search?: string }) {
  try {
    const res = await api.get('/admin/audit', { params: { ...params, limit: 10000 } });
    const logs: AuditLog[] = res.data.logs;
    const headers = ['Timestamp', 'User', 'Email', 'Action', 'Entity Type', 'Entity ID', 'IP Address'];
    const rows = logs.map((log) => [
      format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      log.user?.displayName ?? '',
      log.user?.email ?? '',
      log.action,
      log.entityType ?? '',
      log.entityId ?? '',
      log.ipAddress ?? '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported.');
  } catch {
    toast.error('Export failed.');
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const params = { page, action: actionFilter || undefined, from: from || undefined, to: to || undefined, search: search || undefined };
  const { data, isLoading } = useAuditLogs(params);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Logs</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data?.pagination.total ?? '…'} total events
          </p>
        </div>
        <button
          onClick={() => exportCSV({ action: actionFilter || undefined, from: from || undefined, to: to || undefined, search: search || undefined })}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by user name or email…"
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
            Search
          </button>
        </form>
        <div className="flex gap-2 flex-wrap">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
          >
            <option value="">All actions</option>
            {ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.actions.map((a) => (
                  <option key={a} value={a}>{formatAction(a)}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="From date"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="To date"
          />
        </div>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data?.logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs font-medium text-slate-800">
                        {format(new Date(log.createdAt), 'MMM d, yyyy')}
                      </p>
                      <p className="text-xs text-slate-400">
                        {format(new Date(log.createdAt), 'HH:mm:ss')}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {log.user ? (
                        <div>
                          <p className="text-sm font-medium text-slate-800">{log.user.displayName}</p>
                          <p className="text-xs text-slate-400">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap', getActionColor(log.action))}>
                        {formatAction(log.action)}
                      </span>
                      <LogDetailsToggle details={log.details} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {log.entityType && (
                        <div>
                          <p className="text-xs font-medium text-slate-600">{log.entityType}</p>
                          {log.entityId && <p className="text-xs text-slate-400 font-mono">{log.entityId.slice(0, 8)}…</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-sm font-mono text-slate-500">{log.ipAddress ?? '—'}</span>
                    </td>
                  </tr>
                ))}

                {data?.logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                      No audit logs found for the selected filters.
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
                Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} events
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
    </div>
  );
}
