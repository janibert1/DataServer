import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, Key, Smartphone, Monitor, Globe, AlertTriangle,
  CheckCircle, Clock, Trash2, Eye, EyeOff, QrCode, Copy, Terminal
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import clsx from 'clsx';
import { api, getErrorMessage } from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import { useChangePassword, useSetup2FA, useVerify2FA, useDisable2FA } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useSessions() {
  return useQuery({
    queryKey: ['account', 'sessions'],
    queryFn: async () => {
      const res = await api.get('/account/sessions');
      return res.data.sessions as {
        id: string;
        ipAddress: string;
        userAgent: string;
        createdAt: string;
        lastActivityAt: string;
        isCurrent: boolean;
      }[];
    },
  });
}

function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/account/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'sessions'] });
      toast.success('Session revoked.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

function useSecurityEvents() {
  return useQuery({
    queryKey: ['account', 'security-events'],
    queryFn: async () => {
      const res = await api.get('/account/security-events');
      return res.data.events as {
        id: string;
        action: string;
        ipAddress: string | null;
        createdAt: string;
        details: Record<string, unknown> | null;
      }[];
    },
  });
}

function useApiTokens() {
  return useQuery({
    queryKey: ['account', 'api-tokens'],
    queryFn: async () => {
      const res = await api.get('/tokens');
      return res.data.tokens as {
        id: string;
        name: string;
        tokenPrefix: string;
        lastUsedAt: string | null;
        lastUsedIp: string | null;
        expiresAt: string | null;
        createdAt: string;
      }[];
    },
  });
}

function useCreateApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post('/tokens', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'api-tokens'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

function useRevokeApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tokens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'api-tokens'] });
      toast.success('Token revoked.');
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

// ── Security event icon ───────────────────────────────────────────────────────
function SecurityEventIcon({ action }: { action: string }) {
  if (action.includes('LOGIN')) return <Globe className="w-4 h-4 text-brand-500" />;
  if (action.includes('PASSWORD')) return <Key className="w-4 h-4 text-amber-500" />;
  if (action.includes('TWO_FACTOR')) return <Smartphone className="w-4 h-4 text-green-500" />;
  return <Shield className="w-4 h-4 text-slate-400" />;
}

// ── Change Password Form ──────────────────────────────────────────────────────
function ChangePasswordSection() {
  const { user } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const changePassword = useChangePassword();

  if (user?.authProvider !== 'LOCAL') {
    return (
      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <Globe className="w-5 h-5 text-slate-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-slate-700">Google account</p>
          <p className="text-xs text-slate-500 mt-0.5">Password management is handled by Google.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { toast.error('Passwords do not match.'); return; }
    if (next.length < 8) { toast.error('New password must be at least 8 characters.'); return; }
    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      { onSuccess: () => { setCurrent(''); setNext(''); setConfirm(''); } }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Current password</label>
        <div className="relative">
          <input
            type={showCurrent ? 'text' : 'password'}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full px-3 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
            required
            autoComplete="current-password"
          />
          <button type="button" onClick={() => setShowCurrent((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
        <div className="relative">
          <input
            type={showNext ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full px-3 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <button type="button" onClick={() => setShowNext((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">Minimum 8 characters.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={clsx(
            'w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors',
            confirm && next !== confirm
              ? 'border-red-300 focus:ring-red-300 focus:border-red-400'
              : 'border-slate-300 focus:ring-brand-300 focus:border-brand-400'
          )}
          required
          autoComplete="new-password"
        />
        {confirm && next !== confirm && (
          <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
        )}
      </div>
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={changePassword.isPending || !current || !next || !confirm || next !== confirm}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {changePassword.isPending ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}

// ── 2FA Section ───────────────────────────────────────────────────────────────
function TwoFactorSection() {
  const { user } = useAuthStore();
  const [showSetup, setShowSetup] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  const setup2FA = useSetup2FA();
  const verify2FA = useVerify2FA();
  const disable2FA = useDisable2FA();

  const handleEnable = () => {
    setShowSetup(true);
    setup2FA.refetch();
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    verify2FA.mutate(totpCode, {
      onSuccess: () => { setShowSetup(false); setTotpCode(''); },
    });
  };

  const handleDisable = () => {
    disable2FA.mutate(disablePassword, {
      onSuccess: () => { setShowDisableConfirm(false); setDisablePassword(''); },
    });
  };

  if (user?.twoFactorEnabled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">Two-factor authentication is enabled</p>
            <p className="text-xs text-green-600 mt-0.5">
              Your account is protected with an authenticator app.
            </p>
          </div>
          <span className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">Active</span>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => setShowDisableConfirm(true)}
            className="px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            Disable 2FA
          </button>
        </div>

        {/* Disable confirm */}
        {showDisableConfirm && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <p className="text-sm font-medium text-red-800">Confirm disable 2FA</p>
            </div>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Enter your password to confirm"
              className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowDisableConfirm(false)}
                className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDisable}
                disabled={!disablePassword || disable2FA.isPending}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {disable2FA.isPending ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!showSetup ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <Smartphone className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-700">Two-factor authentication is disabled</p>
              <p className="text-xs text-slate-500 mt-0.5">Add an extra layer of security to your account.</p>
            </div>
          </div>
          <button
            onClick={handleEnable}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Smartphone className="w-4 h-4" />
            Enable 2FA
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <QrCode className="w-5 h-5 text-brand-600" />
            <p className="text-sm font-semibold text-slate-800">Set up authenticator app</p>
          </div>

          {setup2FA.isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : setup2FA.data ? (
            <>
              <div className="flex flex-col items-center gap-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
                <img src={setup2FA.data.qrCode} alt="QR Code" className="w-48 h-48 rounded-lg" />
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">Or enter this secret manually:</p>
                  <code className="text-sm font-mono font-bold text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg tracking-wider">
                    {setup2FA.data.secret}
                  </code>
                </div>
              </div>

              <form onSubmit={handleVerify} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Enter the 6-digit code from your app
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                    required
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowSetup(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={totpCode.length !== 6 || verify2FA.isPending}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
                    {verify2FA.isPending ? 'Verifying…' : 'Verify & enable'}
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── API Tokens Section ──────────────────────────────────────────────────────────
function ApiTokensSection() {
  const { data: tokens, isLoading } = useApiTokens();
  const createToken = useCreateApiToken();
  const revokeToken = useRevokeApiToken();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createToken.mutate(newName.trim(), {
      onSuccess: (res) => {
        setMintedToken(res.data.token);
        setNewName('');
        setShowCreate(false);
      },
    });
  };

  const handleCopy = () => {
    if (!mintedToken) return;
    navigator.clipboard.writeText(mintedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Freshly minted token — shown once */}
      {mintedToken && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-medium text-amber-800">Copy this token now — it won't be shown again</p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono bg-white border border-amber-200 rounded-lg px-3 py-2 break-all">
              {mintedToken}
            </code>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex justify-end">
            <button onClick={() => setMintedToken(null)} className="text-xs font-medium text-amber-700 hover:text-amber-900">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate ? (
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. jan-fedora backup"
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
            autoFocus
            required
          />
          <button type="submit" disabled={createToken.isPending || !newName.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {createToken.isPending ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={() => { setShowCreate(false); setNewName(''); }}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Terminal className="w-4 h-4" />
          Create new token
        </button>
      )}

      {/* Token list */}
      {isLoading ? (
        <div className="flex justify-center py-6"><LoadingSpinner /></div>
      ) : !tokens || tokens.length === 0 ? (
        <p className="text-sm text-slate-500">No API tokens yet. Create one to connect the desktop or CLI client.</p>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <div key={token.id} className="flex items-start gap-3 p-4 rounded-xl border bg-slate-50 border-slate-200">
              <Terminal className="w-5 h-5 flex-shrink-0 mt-0.5 text-slate-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{token.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{token.tokenPrefix}…</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Created {formatDistanceToNow(new Date(token.createdAt), { addSuffix: true })}
                  {token.lastUsedAt && ` · Last used ${formatDistanceToNow(new Date(token.lastUsedAt), { addSuffix: true })}`}
                </p>
              </div>
              <button
                onClick={() => setRevokeTarget(token.id)}
                className="flex-shrink-0 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) {
            revokeToken.mutate(revokeTarget, { onSuccess: () => setRevokeTarget(null) });
          }
        }}
        title="Revoke this token?"
        description="Any app using this token will immediately lose access."
        confirmLabel="Revoke token"
        variant="danger"
        isLoading={revokeToken.isPending}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function SecurityPage() {
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: securityEvents, isLoading: eventsLoading } = useSecurityEvents();
  const revokeSession = useRevokeSession();
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const formatUA = (ua: string) => {
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return ua.slice(0, 30);
  };

  const formatAction = (action: string) =>
    action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Security</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your account security settings</p>
      </div>

      {/* Change password */}
      <Section title="Change Password" description="Update your account password">
        <ChangePasswordSection />
      </Section>

      {/* 2FA */}
      <Section title="Two-Factor Authentication" description="Add an extra layer of security">
        <TwoFactorSection />
      </Section>

      {/* Active sessions */}
      <Section title="Active Sessions" description="Devices and browsers currently signed in to your account">
        {sessionsLoading ? (
          <div className="flex justify-center py-6"><LoadingSpinner /></div>
        ) : !sessions || sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No active sessions found.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className={clsx(
                'flex items-start gap-3 p-4 rounded-xl border transition-colors',
                session.isCurrent ? 'bg-brand-50 border-brand-200' : 'bg-slate-50 border-slate-200'
              )}>
                <Monitor className={clsx('w-5 h-5 flex-shrink-0 mt-0.5', session.isCurrent ? 'text-brand-600' : 'text-slate-400')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">{formatUA(session.userAgent)}</p>
                    {session.isCurrent && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-brand-100 text-brand-700 rounded-full flex-shrink-0">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {session.ipAddress} · Signed in {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {!session.isCurrent && (
                  <button
                    onClick={() => setRevokeTarget(session.id)}
                    className="flex-shrink-0 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* API Tokens */}
      <Section title="API Tokens" description="Tokens let apps like the DataServer desktop client access your account without your password">
        <ApiTokensSection />
      </Section>

      {/* Security events */}
      <Section title="Recent Security Events" description="A log of recent security-related activity on your account">
        {eventsLoading ? (
          <div className="flex justify-center py-6"><LoadingSpinner /></div>
        ) : !securityEvents || securityEvents.length === 0 ? (
          <p className="text-sm text-slate-500">No recent security events.</p>
        ) : (
          <div className="space-y-2">
            {securityEvents.slice(0, 10).map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <SecurityEventIcon action={event.action} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{formatAction(event.action)}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-slate-400">
                      {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm')}
                    </span>
                    {event.ipAddress && (
                      <span className="text-xs text-slate-400">{event.ipAddress}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Revoke session confirm */}
      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) {
            revokeSession.mutate(revokeTarget, { onSuccess: () => setRevokeTarget(null) });
          }
        }}
        title="Revoke this session?"
        description="This device will be signed out immediately."
        confirmLabel="Revoke session"
        variant="danger"
        isLoading={revokeSession.isPending}
      />
    </div>
  );
}
