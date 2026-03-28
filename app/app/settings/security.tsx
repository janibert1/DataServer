import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuthStore } from '@/stores/auth-store';
import { useChangePassword, useSetup2FA, useVerify2FA, useDisable2FA } from '@/lib/hooks/use-auth';
import { useSessions, useRevokeSession, useSecurityEvents } from '@/lib/hooks/use-account';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { showConfirm } from '@/components/ui/confirm-dialog';
import { formatDate } from '@/lib/format';
import Toast from 'react-native-toast-message';

export default function SecurityScreen() {
  const { user } = useAuthStore();
  const isGoogle = user?.authProvider === 'GOOGLE';

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 gap-4">
      {!isGoogle && <ChangePasswordSection />}
      <TwoFactorSection />
      <SessionsSection />
      <SecurityEventsSection />
      <View className="h-8" />
    </ScrollView>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const changePassword = useChangePassword();

  async function handleSubmit() {
    if (!currentPassword || !newPassword) {
      setError('Please fill in both fields');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    setError('');
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      Toast.show({ type: 'success', text1: 'Password changed' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to change password');
    }
  }

  return (
    <Card>
      <Text className="text-sm font-semibold text-slate-700 mb-3">Change Password</Text>
      {error ? (
        <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <Text className="text-sm text-red-600">{error}</Text>
        </View>
      ) : null}
      <Input
        label="Current Password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
      />
      <Input
        label="New Password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        hint="At least 8 characters"
      />
      <Button title="Change Password" onPress={handleSubmit} loading={changePassword.isPending} />
    </Card>
  );
}

function TwoFactorSection() {
  const { user } = useAuthStore();
  const [qrUrl, setQrUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [error, setError] = useState('');

  const setup2FA = useSetup2FA();
  const verify2FA = useVerify2FA();
  const disable2FA = useDisable2FA();

  const isEnabled = user?.twoFactorEnabled;

  async function handleSetup() {
    try {
      const result = await setup2FA.mutateAsync();
      setQrUrl(result.qrCodeUrl);
      setSecret(result.secret);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    }
  }

  async function handleVerify() {
    if (!totpCode.trim()) {
      setError('Enter the 6-digit code');
      return;
    }
    setError('');
    try {
      const result = await verify2FA.mutateAsync(totpCode.trim());
      setBackupCodes(result.backupCodes);
      setQrUrl('');
      setSecret('');
      setTotpCode('');
      Toast.show({ type: 'success', text1: '2FA enabled' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    }
  }

  async function handleDisable() {
    if (!disablePassword.trim()) {
      setError('Enter your password');
      return;
    }
    setError('');
    try {
      await disable2FA.mutateAsync(disablePassword.trim());
      setDisablePassword('');
      Toast.show({ type: 'success', text1: '2FA disabled' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to disable 2FA');
    }
  }

  return (
    <Card>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-semibold text-slate-700">Two-Factor Authentication</Text>
        <Badge label={isEnabled ? 'Enabled' : 'Disabled'} variant={isEnabled ? 'success' : 'default'} />
      </View>

      {error ? (
        <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <Text className="text-sm text-red-600">{error}</Text>
        </View>
      ) : null}

      {backupCodes.length > 0 && (
        <View className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3">
          <Text className="text-sm font-semibold text-amber-700 mb-2">Save your backup codes!</Text>
          <View className="flex-row flex-wrap gap-2">
            {backupCodes.map((code, i) => (
              <Text key={i} className="text-sm font-mono bg-white px-2 py-1 rounded border border-amber-200">
                {code}
              </Text>
            ))}
          </View>
        </View>
      )}

      {!isEnabled && !qrUrl && (
        <Button variant="secondary" title="Set Up 2FA" onPress={handleSetup} loading={setup2FA.isPending} />
      )}

      {!isEnabled && qrUrl && (
        <>
          <View className="items-center my-4">
            <Image source={{ uri: qrUrl }} style={{ width: 200, height: 200 }} />
          </View>
          <View className="bg-slate-50 rounded-lg p-3 mb-4">
            <Text className="text-xs text-slate-500 mb-1">Manual entry code:</Text>
            <Text className="text-sm font-mono text-slate-700" selectable>
              {secret}
            </Text>
          </View>
          <Input
            label="Verification Code"
            placeholder="Enter 6-digit code"
            value={totpCode}
            onChangeText={setTotpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Button title="Verify & Enable" onPress={handleVerify} loading={verify2FA.isPending} />
        </>
      )}

      {isEnabled && (
        <>
          <Input
            label="Password to disable"
            value={disablePassword}
            onChangeText={setDisablePassword}
            secureTextEntry
            placeholder="Enter your password"
          />
          <Button
            variant="destructive"
            title="Disable 2FA"
            onPress={handleDisable}
            loading={disable2FA.isPending}
          />
        </>
      )}
    </Card>
  );
}

function SessionsSection() {
  const { data } = useSessions();
  const revokeSession = useRevokeSession();
  const sessions = data?.sessions ?? [];

  return (
    <Card padded={false}>
      <Text className="text-sm font-semibold text-slate-700 px-4 pt-4 pb-2">Active Sessions</Text>
      {sessions.map((session) => (
        <View key={session.id} className="flex-row items-center px-4 py-3 border-t border-slate-50">
          <Ionicons name="phone-portrait-outline" size={20} color="#475569" />
          <View className="flex-1 ml-3">
            <View className="flex-row items-center gap-2">
              <Text className="text-sm text-slate-700" numberOfLines={1}>
                {session.userAgent?.slice(0, 40) || 'Unknown device'}
              </Text>
              {session.isCurrent && <Badge label="Current" variant="success" />}
            </View>
            <Text className="text-xs text-slate-400 mt-0.5">
              {session.ipAddress} · {formatDate(session.lastActivity)}
            </Text>
          </View>
          {!session.isCurrent && (
            <TouchableOpacity onPress={() => revokeSession.mutate(session.id)} className="p-1">
              <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </Card>
  );
}

function SecurityEventsSection() {
  const { data } = useSecurityEvents();
  const events = data?.events ?? [];

  if (events.length === 0) return null;

  const actionIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
    USER_LOGIN: 'log-in-outline',
    USER_LOGOUT: 'log-out-outline',
    PASSWORD_CHANGED: 'key-outline',
    TWO_FACTOR_ENABLED: 'shield-checkmark-outline',
    TWO_FACTOR_DISABLED: 'shield-outline',
    SESSION_REVOKED: 'close-circle-outline',
    ACCOUNT_DELETED: 'trash-outline',
  };

  return (
    <Card padded={false}>
      <Text className="text-sm font-semibold text-slate-700 px-4 pt-4 pb-2">Recent Security Events</Text>
      {events.slice(0, 10).map((event) => (
        <View key={event.id} className="flex-row items-center px-4 py-3 border-t border-slate-50">
          <Ionicons
            name={actionIcons[event.action] ?? 'information-circle-outline'}
            size={18}
            color="#64748b"
          />
          <View className="flex-1 ml-3">
            <Text className="text-sm text-slate-700">{event.action.replace(/_/g, ' ')}</Text>
            <Text className="text-xs text-slate-400 mt-0.5">
              {event.ipAddress} · {formatDate(event.createdAt)}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}
