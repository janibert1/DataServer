import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
import { useVerifyEmail, useResendVerification } from '../../hooks/useAuth';
import { getErrorMessage } from '../../lib/axios';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'pending'>(!token ? 'pending' : 'loading');
  const [error, setError] = useState('');
  const verifyEmail = useVerifyEmail();
  const resend = useResendVerification();

  useEffect(() => {
    if (!token) return;
    verifyEmail.mutateAsync(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setError(getErrorMessage(err));
        setStatus('error');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900">Verifying your email…</h2>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Email verified!</h2>
            <p className="text-slate-500 text-sm mb-6">Your account is now active. You can sign in.</p>
            <Link to="/login" className="inline-block px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors">
              Sign in
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Verification failed</h2>
            <p className="text-slate-500 text-sm mb-6">{error || 'The verification link is invalid or has expired.'}</p>
            <div className="flex flex-col gap-3">
              <Link to="/login" className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors">Sign in to resend</Link>
            </div>
          </>
        )}
        {status === 'pending' && (
          <>
            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-brand-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Check your email</h2>
            <p className="text-slate-500 text-sm mb-6">
              We sent you a verification link. Click it to activate your account.
            </p>
            <Link to="/login" className="inline-block px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors">
              Back to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
