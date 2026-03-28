import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useForgotPassword } from '@/lib/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const forgotPassword = useForgotPassword();

  async function handleSubmit() {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    setError('');
    try {
      await forgotPassword.mutateAsync(email.trim());
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
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
          <Text className="text-2xl font-bold text-slate-800">Reset Password</Text>
          <Text className="text-base text-slate-500 mt-1">
            {sent ? 'Check your email' : "We'll send you a reset link"}
          </Text>
        </View>

        <View className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          {error ? (
            <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          {sent ? (
            <View className="bg-green-50 border border-green-200 rounded-lg p-4">
              <Text className="text-sm text-green-700">
                If an account exists with that email, you'll receive a password reset link shortly.
              </Text>
            </View>
          ) : (
            <>
              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
              <Button
                title="Send Reset Link"
                onPress={handleSubmit}
                loading={forgotPassword.isPending}
              />
            </>
          )}
        </View>

        <TouchableOpacity onPress={() => router.back()} className="mt-6 items-center">
          <Text className="text-sm text-brand-600 font-medium">Back to login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
