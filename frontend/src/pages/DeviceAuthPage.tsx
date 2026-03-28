import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Monitor, Check, X } from 'lucide-react';
import { api, getErrorMessage } from '../lib/axios';
import { useAuthStore } from '../store/authStore';
import { PageLoader } from '../components/common/LoadingSpinner';

export function DeviceAuthPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  const [deviceName, setDeviceName] = useState('Desktop Client');
  const [status, setStatus] = useState<'pending' | 'loading' | 'success' | 'error'>('pending');
  const [error, setError] = useState('');

  if (authLoading) return <PageLoader />;

  if (!user) {
    // Redirect to login with return URL
    const returnUrl = `/device-auth?code=${code}`;
    window.location.href = `/login?redirect=${encodeURIComponent(returnUrl)}`;
    return <PageLoader />;
  }

  if (!code) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
        <div className="max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <X className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900">Invalid Request</h1>
          <p className="text-slate-500 mt-2">Missing device code. Please try again from the desktop app.</p>
        </div>
      </div>
    );
  }

  const handleApprove = async () => {
    setStatus('loading');
    setError('');
    try {
      await api.post('/tokens/device', { code, name: deviceName.trim() || 'Desktop Client' });
      setStatus('success');
    } catch (err) {
      setError(getErrorMessage(err));
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {status === 'success' ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Device Authorized</h1>
            <p className="text-slate-500 mt-2">
              You can close this window and return to the desktop app.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Monitor className="w-8 h-8 text-brand-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Authorize Desktop App</h1>
              <p className="text-slate-500 mt-2">
                A desktop application is requesting access to your DataServer account.
              </p>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-slate-600">
                Signed in as <span className="font-medium text-slate-900">{user.displayName}</span> ({user.email})
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-1">Device Name</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="e.g. MacBook Pro"
              />
              <p className="text-xs text-slate-400 mt-1">Give this device a name so you can identify it later.</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => window.close()}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={status === 'loading'}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {status === 'loading' ? 'Authorizing...' : 'Authorize'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
