import { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth-store';
import { useLogin, useAuthInit } from '@/lib/hooks/use-auth';
import { GoogleAuthWebView } from '@/components/auth/google-auth-webview';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1 bg-slate-50"
        contentContainerClassName="flex-1 justify-center px-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-8">
          <View className="w-16 h-16 bg-brand-600 rounded-2xl items-center justify-center mb-3">
            <Ionicons name="cloud-outline" size={32} color="white" />
          </View>
          <Text className="text-2xl font-bold text-slate-800">Welcome back</Text>
          <Text className="text-base text-slate-500 mt-1">Sign in to your account</Text>
        </View>

        <View className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          {error ? (
            <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          {!needs2FA ? (
            <>
              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 mb-1.5">Password</Text>
                <View className="flex-row items-center border border-slate-300 rounded-lg bg-white px-3.5">
                  <TextInput
                    className="flex-1 py-2.5 text-base text-slate-800"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    placeholder="Enter your password"
                    placeholderTextColor="#94a3b8"
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    className="pl-2"
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#94a3b8"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : (
            <Input
              label="Two-Factor Code"
              placeholder="Enter 6-digit code"
              value={totpCode}
              onChangeText={setTotpCode}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
          )}

          <Button
            title={needs2FA ? 'Verify' : 'Sign In'}
            onPress={handleLogin}
            loading={loginMutation.isPending}
            className="mt-1"
          />

          {!needs2FA && (
            <>
              <View className="flex-row items-center my-5">
                <View className="flex-1 h-px bg-slate-200" />
                <Text className="mx-3 text-sm text-slate-400">or</Text>
                <View className="flex-1 h-px bg-slate-200" />
              </View>

              <Button
                variant="secondary"
                title="Continue with Google"
                onPress={handleGoogleLogin}
                icon={<Ionicons name="logo-google" size={18} color="#475569" className="mr-2" />}
              />
            </>
          )}
        </View>

        <View className="flex-row justify-center gap-4 mt-6">
          {!needs2FA && (
            <>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text className="text-sm text-brand-600 font-medium">Create account</Text>
              </TouchableOpacity>
              <Text className="text-slate-300">|</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                <Text className="text-sm text-brand-600 font-medium">Forgot password?</Text>
              </TouchableOpacity>
            </>
          )}
          {needs2FA && (
            <TouchableOpacity onPress={() => setNeeds2FA(false)}>
              <Text className="text-sm text-brand-600 font-medium">Back to login</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={() => {
            useAuthStore.getState().setServerUrl(null);
            router.replace('/(auth)/server-url');
          }}
          className="mt-4 items-center"
        >
          <Text className="text-xs text-slate-400">Change server</Text>
        </TouchableOpacity>
      </ScrollView>
      <GoogleAuthWebView
        visible={googleAuthVisible}
        onClose={() => setGoogleAuthVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}
