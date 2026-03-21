import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, HardDrive, Bell, AlertTriangle, Save, Camera } from 'lucide-react';
import { api, getErrorMessage } from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import { StorageBar } from '../../components/common/StorageBar';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useProfile() {
  return useQuery({
    queryKey: ['account', 'profile'],
    queryFn: async () => {
      const res = await api.get('/account/profile');
      return res.data.user;
    },
  });
}

function useStorageStats() {
  return useQuery({
    queryKey: ['account', 'storage'],
    queryFn: async () => {
      const res = await api.get('/account/storage');
      return res.data as { usedBytes: string; quotaBytes: string; fileCount: number; folderCount: number };
    },
  });
}

function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();
  return useMutation({
    mutationFn: (data: { displayName?: string; avatarUrl?: string }) =>
      api.patch('/account/profile', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['account', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      if (res.data.user) setUser(res.data.user);
      toast.success('Profile updated.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

function useDeleteAccount() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/account'),
    onSuccess: () => {
      logout();
      queryClient.clear();
      window.location.href = '/login';
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user } = useAuthStore();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: storage, isLoading: storageLoading } = useStorageStats();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? '');
      setAvatarUrl(profile.avatarUrl ?? '');
    }
  }, [profile]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({ displayName: displayName.trim(), avatarUrl: avatarUrl.trim() || undefined });
  };

  const usedBytes = parseInt(storage?.usedBytes ?? user?.storageUsedBytes ?? '0');
  const quotaBytes = parseInt(storage?.quotaBytes ?? user?.storageQuotaBytes ?? '1');

  const formatBytes = (n: number) => {
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your profile and account preferences</p>
      </div>

      {/* Profile section */}
      <Section title="Profile" description="Update your display name and avatar">
        {profileLoading ? (
          <div className="flex justify-center py-6"><LoadingSpinner /></div>
        ) : (
          <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Avatar preview */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-brand-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  displayName?.[0]?.toUpperCase() ?? user?.displayName?.[0]?.toUpperCase() ?? '?'
                )}
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Avatar URL</label>
                <div className="relative">
                  <Camera className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={100}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={user?.email ?? ''}
                disabled
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <p className="text-xs text-slate-400 mt-1">Email address cannot be changed.</p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={updateProfile.isPending || !displayName.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                <Save className="w-4 h-4" />
                {updateProfile.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Section>

      {/* Storage section */}
      <Section title="Storage" description="Your storage usage and quota">
        {storageLoading ? (
          <div className="flex justify-center py-6"><LoadingSpinner /></div>
        ) : (
          <div className="space-y-5">
            <StorageBar usedBytes={usedBytes} totalBytes={quotaBytes} />
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-slate-50 rounded-xl">
                <p className="text-lg font-bold text-slate-900">{formatBytes(usedBytes)}</p>
                <p className="text-xs text-slate-500 mt-1">Used</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-xl">
                <p className="text-lg font-bold text-slate-900">{formatBytes(quotaBytes - usedBytes)}</p>
                <p className="text-xs text-slate-500 mt-1">Available</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-xl">
                <p className="text-lg font-bold text-slate-900">{formatBytes(quotaBytes)}</p>
                <p className="text-xs text-slate-500 mt-1">Total quota</p>
              </div>
            </div>
            {storage && (
              <div className="flex items-center gap-6 text-sm text-slate-500 pt-2 border-t border-slate-100">
                <span>{storage.fileCount} file{storage.fileCount !== 1 ? 's' : ''}</span>
                <span>{storage.folderCount} folder{storage.folderCount !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Notifications section */}
      <Section title="Notifications" description="Control how you receive notifications">
        <div className="flex items-center gap-3 p-4 bg-brand-50 border border-brand-100 rounded-xl">
          <Bell className="w-5 h-5 text-brand-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-brand-800">More notification settings coming soon</p>
            <p className="text-xs text-brand-600 mt-0.5">
              In-app notifications are active. Email notification controls will be available in a future update.
            </p>
          </div>
        </div>
      </Section>

      {/* Account section */}
      <Section title="Account" description="Manage your account">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Delete account</p>
              <p className="text-xs text-red-600 mt-1">
                Permanently deletes your account and all associated files. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
            >
              Delete
            </button>
          </div>
        </div>
      </Section>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => deleteAccount.mutate()}
        title="Delete your account?"
        description="All your files, folders, and data will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete my account"
        variant="danger"
        isLoading={deleteAccount.isPending}
      />
    </div>
  );
}
