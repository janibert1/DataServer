import { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, CheckCircle, AlertCircle } from 'lucide-react-native';
import { useForgotPassword } from '@/lib/hooks/use-auth';

// Matches frontend/src/pages/auth/ForgotPasswordPage.tsx.
const gradientColors: [string, string, string] = ['#172554', '#1e3a8a', '#1e40af'];
const cardShadow = { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 };

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const forgot = useForgotPassword();

  async function handleSubmit() {
    setError('');
    try {
      await forgot.mutateAsync(email);
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  return (
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView className="flex-1" contentContainerClassName="flex-1 justify-center px-4" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-md self-center">
            <View className="items-center mb-8">
              <View className="w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-4">
                <Zap size={28} color="white" fill="white" />
              </View>
              <Text className="text-2xl font-bold text-white">Reset Password</Text>
            </View>

            <View className="bg-white rounded-2xl p-8" style={cardShadow}>
              {sent ? (
                <View className="items-center">
                  <View className="w-14 h-14 bg-green-100 rounded-full items-center justify-center mb-4">
                    <CheckCircle size={28} color="#16a34a" />
                  </View>
                  <Text className="text-lg font-bold text-slate-900 mb-2">Check your email</Text>
                  <Text className="text-sm text-slate-500 text-center mb-6">
                    If an account exists for <Text className="font-bold">{email}</Text>, we've sent a reset link. Check your inbox.
                  </Text>
                  <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="px-5 py-2.5 bg-brand-600 rounded-lg">
                    <Text className="text-white text-sm font-semibold">Back to login</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text className="text-xl font-bold text-slate-900 mb-1">Forgot your password?</Text>
                  <Text className="text-sm text-slate-500 mb-5">Enter your email and we'll send you a reset link.</Text>

                  {error ? (
                    <View className="flex-row items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg mb-4">
                      <AlertCircle size={16} color="#b91c1c" />
                      <Text className="text-sm text-red-700 flex-1">{error}</Text>
                    </View>
                  ) : null}

                  <View className="mb-4">
                    <Text className="text-sm font-medium text-slate-700 mb-1.5">Email address</Text>
                    <TextInput
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-900"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      placeholder="you@example.com"
                      placeholderTextColor="#94a3b8"
                      returnKeyType="go"
                      onSubmitEditing={handleSubmit}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={forgot.isPending}
                    className={`w-full py-2.5 bg-brand-600 rounded-lg items-center ${forgot.isPending ? 'opacity-60' : ''}`}
                  >
                    <Text className="text-white text-sm font-semibold">{forgot.isPending ? 'Sending…' : 'Send reset link'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => router.back()} className="mt-4 items-center">
                    <Text className="text-xs text-brand-600 font-medium">← Back to login</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
