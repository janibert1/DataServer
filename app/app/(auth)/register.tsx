import { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Eye, EyeOff, Zap, AlertCircle, CheckCircle, Check } from 'lucide-react-native';
import { useValidateInvitation, useRegister } from '@/lib/hooks/use-auth';

// Matches frontend/src/pages/auth/RegisterPage.tsx (the non-Google-pending
// path -- the mobile app has no equivalent deep-linked Google-registration
// state to match against).
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const barColor = (i: number) => {
    if (score < i) return 'bg-slate-200';
    if (score <= 1) return 'bg-red-400';
    if (score === 2) return 'bg-amber-400';
    if (score === 3) return 'bg-yellow-400';
    return 'bg-green-500';
  };

  return (
    <View className="mt-2 gap-1.5">
      <View className="flex-row gap-1">
        {[1, 2, 3, 4].map((i) => (
          <View key={i} className={`flex-1 h-1 rounded-full ${barColor(i)}`} />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {checks.map((c) => (
          <View key={c.label} className="flex-row items-center gap-1" style={{ width: '46%' }}>
            <Check size={12} color={c.pass ? '#16a34a' : 'transparent'} />
            <Text className={`text-xs ${c.pass ? 'text-green-600' : 'text-slate-400'}`}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const gradientColors: [string, string, string] = ['#172554', '#1e3a8a', '#1e40af'];

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView className="flex-1" contentContainerClassName="flex-1 justify-center px-4" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-md self-center">
            <View className="items-center mb-8">
              <View className="w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-4">
                <Zap size={28} color="white" fill="white" />
              </View>
              <Text className="text-2xl font-bold text-white">{title}</Text>
              <Text className="text-sm text-brand-300 mt-1">{subtitle}</Text>
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const cardShadow = { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 };

export default function RegisterScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [invitationCode, setInvitationCode] = useState('');
  const [invitationInfo, setInvitationInfo] = useState<{ folder?: { name: string }; permission?: string } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const router = useRouter();
  const validateInvitation = useValidateInvitation();
  const registerMutation = useRegister();

  async function handleValidateCode() {
    if (!invitationCode.trim()) {
      setError('Please enter an invitation code');
      return;
    }
    setError('');
    try {
      const result = await validateInvitation.mutateAsync(invitationCode.trim());
      setInvitationInfo(result.invitation);
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid invitation code');
    }
  }

  async function handleRegister() {
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    try {
      await registerMutation.mutateAsync({
        invitationCode: invitationCode.trim(),
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });
      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    }
  }

  if (success) {
    return (
      <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <View className="flex-1 justify-center px-4">
          <View className="w-full max-w-md self-center bg-white rounded-2xl p-8 items-center" style={cardShadow}>
            <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-4">
              <CheckCircle size={32} color="#16a34a" />
            </View>
            <Text className="text-xl font-bold text-slate-900 mb-2">Account created!</Text>
            <Text className="text-slate-500 text-sm text-center mb-6">
              We've sent a verification email to <Text className="font-bold">{email}</Text>. Please verify your email to activate your account.
            </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="px-6 py-2.5 bg-brand-600 rounded-lg">
              <Text className="text-white text-sm font-semibold">Go to login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    );
  }

  return (
    <AuthShell title="Join DataServer" subtitle="An invitation code is required to register">
      <View className="bg-white rounded-2xl p-8" style={cardShadow}>
        {step === 1 ? (
          <View className="gap-4">
            <View>
              <Text className="text-xl font-bold text-slate-900 mb-1">Enter invitation code</Text>
              <Text className="text-sm text-slate-500">You need a valid platform invitation code to create an account.</Text>
            </View>

            {error ? (
              <View className="flex-row items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle size={16} color="#b91c1c" />
                <Text className="text-sm text-red-700 flex-1">{error}</Text>
              </View>
            ) : null}

            <TextInput
              className="w-full px-4 py-3 text-lg font-mono text-center border border-slate-300 rounded-lg text-slate-900 tracking-widest"
              value={invitationCode}
              onChangeText={(t) => setInvitationCode(t.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              maxLength={14}
              returnKeyType="go"
              onSubmitEditing={handleValidateCode}
            />

            <TouchableOpacity
              onPress={handleValidateCode}
              disabled={!invitationCode.trim() || validateInvitation.isPending}
              className={`w-full py-2.5 bg-brand-600 rounded-lg items-center ${!invitationCode.trim() || validateInvitation.isPending ? 'opacity-60' : ''}`}
            >
              <Text className="text-white text-sm font-semibold">{validateInvitation.isPending ? 'Validating…' : 'Continue'}</Text>
            </TouchableOpacity>

            <View className="flex-row justify-center flex-wrap">
              <Text className="text-center text-xs text-slate-500">Already have an account? </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text className="text-xs text-brand-600 font-medium">Sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="gap-4">
            <View className="flex-row items-center gap-2">
              <TouchableOpacity onPress={() => setStep(1)}>
                <Text className="text-brand-600 text-xs">← Change code</Text>
              </TouchableOpacity>
              <Text className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Code accepted</Text>
            </View>

            <Text className="text-xl font-bold text-slate-900">Create your account</Text>

            {invitationInfo?.folder && (
              <View className="bg-brand-50 border border-brand-200 rounded-lg p-3">
                <Text className="text-sm text-brand-700">
                  You'll get access to folder "{invitationInfo.folder.name}"
                  {invitationInfo.permission ? ` as ${invitationInfo.permission}` : ''}
                </Text>
              </View>
            )}

            {error ? (
              <View className="flex-row items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle size={16} color="#b91c1c" />
                <Text className="text-sm text-red-700 flex-1">{error}</Text>
              </View>
            ) : null}

            <View>
              <Text className="text-sm font-medium text-slate-700 mb-1.5">Display name</Text>
              <TextInput
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-900"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                textContentType="name"
                placeholder="Your name"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-slate-700 mb-1.5">Email</Text>
              <TextInput
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-900"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-slate-700 mb-1.5">Password</Text>
              <View className="flex-row items-center border border-slate-300 rounded-lg px-3">
                <TextInput
                  className="flex-1 py-2.5 text-sm text-slate-900"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  placeholder="Create a strong password"
                  placeholderTextColor="#94a3b8"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={16} color="#94a3b8" /> : <Eye size={16} color="#94a3b8" />}
                </TouchableOpacity>
              </View>
              {password.length > 0 && <PasswordStrength password={password} />}
            </View>

            <View>
              <Text className="text-sm font-medium text-slate-700 mb-1.5">Confirm password</Text>
              <TextInput
                className={`w-full px-3 py-2.5 text-sm border rounded-lg text-slate-900 ${confirmPassword && password !== confirmPassword ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Repeat password"
                placeholderTextColor="#94a3b8"
              />
              {confirmPassword && password !== confirmPassword ? (
                <Text className="text-xs text-red-500 mt-1">Passwords do not match</Text>
              ) : null}
            </View>

            <TouchableOpacity onPress={() => setAgreedToTerms(!agreedToTerms)} className="flex-row items-start gap-2.5">
              <View className={`mt-0.5 w-4 h-4 rounded border ${agreedToTerms ? 'bg-brand-600 border-brand-600' : 'border-slate-300'} items-center justify-center`}>
                {agreedToTerms && <Check size={12} color="white" />}
              </View>
              <Text className="text-xs text-slate-500 flex-1">
                I agree to the <Text className="text-brand-600">Terms of Service</Text> and <Text className="text-brand-600">Privacy Policy</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleRegister}
              disabled={registerMutation.isPending || !agreedToTerms || password !== confirmPassword}
              className={`w-full py-2.5 bg-brand-600 rounded-lg items-center ${registerMutation.isPending || !agreedToTerms || password !== confirmPassword ? 'opacity-60' : ''}`}
            >
              <Text className="text-white text-sm font-semibold">{registerMutation.isPending ? 'Creating account…' : 'Create account'}</Text>
            </TouchableOpacity>

            <View className="flex-row items-center gap-3">
              <View className="flex-1 h-px bg-slate-200" />
              <Text className="text-xs text-slate-400 font-medium">or</Text>
              <View className="flex-1 h-px bg-slate-200" />
            </View>

            <TouchableOpacity className="flex-row items-center justify-center gap-3 w-full py-2.5 border border-slate-300 rounded-lg">
              <GoogleIcon size={18} />
              <Text className="text-sm font-medium text-slate-700">Continue with Google</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </AuthShell>
  );
}
