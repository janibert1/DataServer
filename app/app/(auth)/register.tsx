import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useValidateInvitation, useRegister } from '@/lib/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function RegisterScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [invitationCode, setInvitationCode] = useState('');
  const [invitationInfo, setInvitationInfo] = useState<{ folder?: { name: string }; permission?: string } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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
    if (!displayName.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
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
      // AuthGate handles navigation on success
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    }
  }

  const passwordStrength = getPasswordStrength(password);

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
          <Text className="text-2xl font-bold text-slate-800">Create Account</Text>
          <Text className="text-base text-slate-500 mt-1">
            {step === 1 ? 'Enter your invitation code' : 'Set up your account'}
          </Text>
        </View>

        <View className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          {error ? (
            <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <>
              <Input
                label="Invitation Code"
                placeholder="Enter your code"
                value={invitationCode}
                onChangeText={setInvitationCode}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleValidateCode}
              />
              <Button
                title="Continue"
                onPress={handleValidateCode}
                loading={validateInvitation.isPending}
              />
            </>
          ) : (
            <>
              {invitationInfo?.folder && (
                <View className="bg-brand-50 border border-brand-200 rounded-lg p-3 mb-4">
                  <Text className="text-sm text-brand-700">
                    You'll get access to folder "{invitationInfo.folder.name}"
                    {invitationInfo.permission ? ` as ${invitationInfo.permission}` : ''}
                  </Text>
                </View>
              )}
              <Input
                label="Display Name"
                placeholder="Your name"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                textContentType="name"
              />
              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <Input
                label="Password"
                placeholder="At least 8 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="newPassword"
              />
              {password.length > 0 && (
                <View className="flex-row gap-1 mb-4">
                  {[0, 1, 2, 3].map((i) => (
                    <View
                      key={i}
                      className={`flex-1 h-1.5 rounded-full ${
                        i < passwordStrength.level
                          ? passwordStrength.color
                          : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </View>
              )}
              <Button
                title="Create Account"
                onPress={handleRegister}
                loading={registerMutation.isPending}
              />
            </>
          )}
        </View>

        <TouchableOpacity onPress={() => router.back()} className="mt-6 items-center">
          <Text className="text-sm text-brand-600 font-medium">Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getPasswordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const colors = ['bg-red-500', 'bg-amber-500', 'bg-yellow-500', 'bg-green-500'];
  return { level: score, color: colors[score - 1] || 'bg-slate-200' };
}
