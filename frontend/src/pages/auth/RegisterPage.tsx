import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Zap, AlertCircle, CheckCircle, Check } from 'lucide-react';
import { useRegister } from '../../hooks/useAuth';
import { api, getErrorMessage } from '../../lib/axios';
import clsx from 'clsx';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={clsx('flex-1 h-1 rounded-full transition-colors', {
              'bg-red-400': score >= i && score <= 1,
              'bg-amber-400': score >= i && score === 2,
              'bg-yellow-400': score >= i && score === 3,
              'bg-green-500': score >= i && score === 4,
              'bg-slate-200': score < i,
            })}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {checks.map((c) => (
          <div key={c.label} className={clsx('flex items-center gap-1 text-xs', c.pass ? 'text-green-600' : 'text-slate-400')}>
            <Check className={clsx('w-3 h-3', !c.pass && 'opacity-0')} />
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const register = useRegister();

  const isGooglePending = searchParams.get('googlePending') === 'true';

  const [step, setStep] = useState<'code' | 'details'>('code');
  const [invitationCode, setInvitationCode] = useState(searchParams.get('code') ?? '');
  const [codeValid, setCodeValid] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeInfo, setCodeInfo] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleGoogleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleError('');
    setGoogleLoading(true);
    try {
      await api.post('/auth/google/complete-registration', { invitationCode: invitationCode.trim() });
      navigate('/drive');
    } catch (err: any) {
      setGoogleError(err.response?.data?.error ?? 'Something went wrong. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Auto-validate code from URL
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setInvitationCode(code);
      validateCode(code);
    }
  }, []);

  const validateCode = async (code: string) => {
    if (!code.trim()) return;
    setIsValidating(true);
    setCodeError('');
    try {
      const res = await api.post('/invitations/validate', { code: code.trim(), type: 'PLATFORM' });
      setCodeInfo(res.data);
      setCodeValid(true);
      setStep('details');
    } catch (err) {
      setCodeError(getErrorMessage(err));
      setCodeValid(false);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      await register.mutateAsync({ invitationCode, displayName, email, password });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Account created!</h2>
          <p className="text-slate-500 text-sm mb-6">
            We've sent a verification email to <strong>{email}</strong>. Please verify your email to activate your account.
          </p>
          <Link to="/login" className="inline-block px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  if (isGooglePending) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4">
              <Zap className="w-7 h-7 text-white" fill="currentColor" />
            </div>
            <h1 className="text-2xl font-bold text-white">Almost there!</h1>
            <p className="text-brand-300 text-sm mt-1">Enter your invitation code to complete Google sign-up</p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl p-8 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <p className="text-sm text-slate-600">Your Google account was verified. Just need an invitation code to create your DataServer account.</p>
            </div>

            {googleError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {googleError}
              </div>
            )}

            <form onSubmit={handleGoogleComplete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Invitation code</label>
                <input
                  type="text"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  className="w-full px-4 py-3 text-center text-lg font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 uppercase"
                  maxLength={14}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={!invitationCode.trim() || googleLoading}
                className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {googleLoading ? 'Creating account…' : 'Complete sign-up'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500">
              Wrong account?{' '}
              <a href="/api/auth/google" className="text-brand-600 hover:text-brand-700 font-medium">Try again</a>
              {' · '}
              <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">Sign in instead</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4">
            <Zap className="w-7 h-7 text-white" fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold text-white">Join DataServer</h1>
          <p className="text-brand-300 text-sm mt-1">An invitation code is required to register</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {step === 'code' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Enter invitation code</h2>
                <p className="text-sm text-slate-500">
                  You need a valid platform invitation code to create an account.
                </p>
              </div>

              {codeError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {codeError}
                </div>
              )}

              <div>
                <input
                  type="text"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  className="w-full px-4 py-3 text-center text-lg font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 uppercase"
                  maxLength={14}
                />
              </div>

              <button
                onClick={() => validateCode(invitationCode)}
                disabled={!invitationCode.trim() || isValidating}
                className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {isValidating ? 'Validating…' : 'Continue'}
              </button>

              <p className="text-center text-xs text-slate-500">
                Already have an account?{' '}
                <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">Sign in</Link>
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => { setStep('code'); setCodeValid(false); }} className="text-brand-600 hover:text-brand-700 text-xs">← Change code</button>
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Code accepted</span>
              </div>

              <h2 className="text-xl font-bold text-slate-900">Create your account</h2>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Display name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                    placeholder="Your name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                      placeholder="Create a strong password"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && <PasswordStrength password={password} />}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={clsx(
                      'w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300',
                      confirmPassword && password !== confirmPassword
                        ? 'border-red-300 bg-red-50'
                        : 'border-slate-300'
                    )}
                    placeholder="Repeat password"
                    required
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                  )}
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-brand-600"
                    required
                  />
                  <span className="text-xs text-slate-500">
                    I agree to the{' '}
                    <a href="#" className="text-brand-600 hover:underline">Terms of Service</a>
                    {' '}and{' '}
                    <a href="#" className="text-brand-600 hover:underline">Privacy Policy</a>
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={register.isPending || !agreedToTerms || password !== confirmPassword}
                  className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
                >
                  {register.isPending ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-xs text-slate-400 font-medium">or</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>

              <a
                href="/api/auth/google"
                className="flex items-center justify-center gap-3 w-full py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
