import { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Eye, EyeOff, Zap, Lock, AlertCircle } from 'lucide-react-native';

// Same 4-path multi-color "G" as frontend/src/pages/auth/LoginPage.tsx's
// inline <svg> -- ported directly rather than an image asset, so it's the
// exact same vector, not a rasterized approximation.
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
import { useAuthStore } from '@/stores/auth-store';
import { useLogin } from '@/lib/hooks/use-auth';
import { GoogleAuthWebView } from '@/components/auth/google-auth-webview';

// Matches frontend/src/pages/auth/LoginPage.tsx exactly -- same copy, same
// layout, same lucide icon set (via lucide-react-native, not @expo/vector-
// icons' Ionicons, which don't have matching glyphs) so this renders as
// close to pixel-identical to the web version as RN's layout engine allows.
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [googleAuthVisible, setGoogleAuthVisible] = useState(false);

  const router = useRouter();
  const { serverUrl } = useAuthStore();
  const loginMutation = useLogin();

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }
    if (needs2FA && !totpCode.trim()) {
      setError('Please enter your 2FA code');
      return;
    }

    setError('');
    try {
      const result = await loginMutation.mutateAsync({
        email: email.trim(),
        password,
        totpCode: needs2FA ? totpCode.trim() : undefined,
      });

      if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
        setNeeds2FA(true);
      }
      // If login succeeds with user, AuthGate in _layout.tsx handles navigation
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setError(msg);
    }
  }

  function handleGoogleLogin() {
    setGoogleAuthVisible(true);
  }

  return (
    <LinearGradient
      colors={['#172554', '#1e3a8a', '#1e40af']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-1 justify-center px-4"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-md self-center">
            {/* Logo */}
            <View className="items-center mb-8">
              <View className="w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-4">
                <Zap size={28} color="white" fill="white" />
              </View>
              <Text className="text-2xl font-bold text-white">DataServer</Text>
              <Text className="text-sm text-brand-300 mt-1">Secure, invitation-only cloud storage</Text>
            </View>

            {/* Card */}
            <View className="bg-white rounded-2xl p-8" style={{ shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 }}>
              <View className="mb-6">
                <View className="flex-row items-center gap-2 self-start bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
                  <Lock size={14} color="#1d4ed8" />
                  <Text className="text-xs text-brand-700">Invitation-only platform</Text>
                </View>
                <Text className="text-xl font-bold text-slate-900 mt-4">Sign in to your account</Text>
              </View>

              {error ? (
                <View className="flex-row items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg mb-5">
                  <AlertCircle size={16} color="#b91c1c" />
                  <Text className="text-sm text-red-700 flex-1">{error}</Text>
                </View>
              ) : null}

              {!needs2FA ? (
                <>
                  <View className="mb-4">
                    <Text className="text-sm font-medium text-slate-700 mb-1.5">Email</Text>
                    <TextInput
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-900"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      placeholder="you@example.com"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                  <View className="mb-4">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text className="text-sm font-medium text-slate-700">Password</Text>
                      <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                        <Text className="text-xs text-brand-600 font-medium">Forgot password?</Text>
                      </TouchableOpacity>
                    </View>
                    <View className="flex-row items-center border border-slate-300 rounded-lg px-3">
                      <TextInput
                        className="flex-1 py-2.5 text-sm text-slate-900"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        textContentType="password"
                        placeholder="Your password"
                        placeholderTextColor="#94a3b8"
                        returnKeyType="go"
                        onSubmitEditing={handleLogin}
                      />
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff size={16} color="#94a3b8" /> : <Eye size={16} color="#94a3b8" />}
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : (
                <View className="mb-4">
                  <Text className="text-sm font-medium text-slate-700 mb-1.5">Two-factor code</Text>
                  <TextInput
                    className="w-full px-3 py-2.5 text-lg font-mono text-center border border-slate-300 rounded-lg text-slate-900"
                    value={totpCode}
                    onChangeText={(t) => setTotpCode(t.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="000000"
                    placeholderTextColor="#94a3b8"
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                    autoFocus
                  />
                  <Text className="text-xs text-slate-500 mt-1.5 text-center">
                    Enter the 6-digit code from your authenticator app
                  </Text>
                  <TouchableOpacity onPress={() => setNeeds2FA(false)} className="mt-2">
                    <Text className="text-xs text-brand-600 font-medium text-center">← Back to login</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={handleLogin}
                disabled={loginMutation.isPending}
                className={`w-full py-2.5 bg-brand-600 rounded-lg items-center ${loginMutation.isPending ? 'opacity-60' : ''}`}
              >
                <Text className="text-white text-sm font-semibold">
                  {loginMutation.isPending ? 'Signing in…' : needs2FA ? 'Verify' : 'Sign in'}
                </Text>
              </TouchableOpacity>

              {!needs2FA && (
                <>
                  <View className="flex-row items-center gap-3 my-5">
                    <View className="flex-1 h-px bg-slate-200" />
                    <Text className="text-xs text-slate-400 font-medium">or</Text>
                    <View className="flex-1 h-px bg-slate-200" />
                  </View>

                  <TouchableOpacity
                    onPress={handleGoogleLogin}
                    className="flex-row items-center justify-center gap-3 w-full py-2.5 border border-slate-300 rounded-lg"
                  >
                    <GoogleIcon size={18} />
                    <Text className="text-sm font-medium text-slate-700">Continue with Google</Text>
                  </TouchableOpacity>

                  <View className="flex-row justify-center flex-wrap mt-5">
                    <Text className="text-center text-xs text-slate-500">Don't have an account? </Text>
                    <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                      <Text className="text-xs text-brand-600 font-medium">Register with an invitation code</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            <TouchableOpacity
              onPress={() => {
                useAuthStore.getState().setServerUrl(null);
                router.replace('/(auth)/server-url');
              }}
              className="mt-4 items-center"
            >
              <Text className="text-xs text-brand-300/70">Change server</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <GoogleAuthWebView
          visible={googleAuthVisible}
          onClose={() => setGoogleAuthVisible(false)}
        />
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
