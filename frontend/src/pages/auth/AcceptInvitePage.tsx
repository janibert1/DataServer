import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, FolderOpen, Shield, AlertCircle, Zap, LogIn } from 'lucide-react';
import { api, getErrorMessage } from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code') ?? '';
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!code) {
      setIsValidating(false);
      setValidationError('No invitation code provided.');
      return;
    }

    api.post('/invitations/validate', { code, type: 'FOLDER_SHARE' })
      .then((res) => setInviteInfo(res.data))
      .catch((err) => setValidationError(getErrorMessage(err)))
      .finally(() => setIsValidating(false));
  }, [code]);

  const handleAccept = async () => {
    if (!user) {
      navigate(`/login?redirect=/accept-invite?code=${code}`);
      return;
    }
    setIsAccepting(true);
    try {
      const res = await api.post('/invitations/accept', { code });
      setAccepted(true);
      setTimeout(() => navigate(`/drive/folder/${res.data.folderId}`), 1500);
    } catch (err) {
      setValidationError(getErrorMessage(err));
    } finally {
      setIsAccepting(false);
    }
  };

  const permissionColors: Record<string, string> = {
    VIEWER: 'bg-slate-100 text-slate-700',
    DOWNLOADER: 'bg-blue-100 text-blue-700',
    CONTRIBUTOR: 'bg-green-100 text-green-700',
    EDITOR: 'bg-amber-100 text-amber-700',
    OWNER: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-4">
            <Zap className="w-7 h-7 text-white" fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold text-white">DataServer</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {isValidating ? (
            <div className="flex flex-col items-center py-8 gap-4">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-slate-500">Validating invitation…</p>
            </div>
          ) : validationError ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Invalid invitation</h2>
              <p className="text-sm text-slate-500 mb-6">{validationError}</p>
              <Link to="/login" className="inline-block px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors">
                Go to login
              </Link>
            </div>
          ) : accepted ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Access granted!</h2>
              <p className="text-sm text-slate-500">Redirecting to shared folder…</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Folder shared with you</h2>
                  <p className="text-sm text-slate-500">You've been invited to access a folder</p>
                </div>
              </div>

              {inviteInfo?.folder && (
                <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Folder</span>
                    <span className="text-sm font-medium text-slate-800">{inviteInfo.folder.name}</span>
                  </div>
                  {inviteInfo.permission && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Access level</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${permissionColors[inviteInfo.permission] ?? 'bg-slate-100 text-slate-700'}`}>
                        {inviteInfo.permission}
                      </span>
                    </div>
                  )}
                  {inviteInfo.note && (
                    <div className="border-t border-slate-200 pt-2 mt-2">
                      <p className="text-xs text-slate-500 italic">"{inviteInfo.note}"</p>
                    </div>
                  )}
                </div>
              )}

              {!user ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700">
                    <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>You need to be signed in to accept this invitation.</span>
                  </div>
                  <Link
                    to={`/login?redirect=/accept-invite?code=${code}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    Sign in to accept
                  </Link>
                  <p className="text-center text-xs text-slate-500">
                    No account?{' '}
                    <Link to="/register" className="text-brand-600 hover:text-brand-700 font-medium">Register with an invitation code</Link>
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleAccept}
                  disabled={isAccepting}
                  className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  {isAccepting ? (
                    <>
                      <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                      Accepting…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Accept & access folder
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
