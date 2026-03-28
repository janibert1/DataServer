import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile, useUpdateProfile, useStorage } from '@/lib/hooks/use-account';
import { useLogout } from '@/lib/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { StorageBar } from '@/components/ui/storage-bar';
import { showConfirm } from '@/components/ui/confirm-dialog';
import { deleteAccount } from '@/lib/api/account';
import { formatFileSize } from '@/lib/format';

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: storageData } = useStorage();
  const updateProfile = useUpdateProfile();
  const logoutMutation = useLogout();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [editing, setEditing] = useState(false);

  async function handleSaveProfile() {
    await updateProfile.mutateAsync({ displayName: displayName.trim() });
    setEditing(false);
  }

  function handleLogout() {
    logoutMutation.mutate();
  }

  function handleChangeServer() {
    showConfirm({
      title: 'Change Server',
      message: 'This will log you out and return to the server URL screen.',
      confirmText: 'Change Server',
      onConfirm: async () => {
        await logoutMutation.mutateAsync();
        await useAuthStore.getState().setServerUrl(null);
      },
    });
  }

  function handleDeleteAccount() {
    showConfirm({
      title: 'Delete Account',
      message: 'This will permanently delete your account and all your files. This cannot be undone.',
      confirmText: 'Delete Account',
      destructive: true,
      onConfirm: async () => {
        await deleteAccount();
        useAuthStore.getState().logout();
      },
    });
  }

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 gap-4">
      {/* Profile */}
      <Card>
        <View className="items-center mb-4">
          <Avatar url={user?.avatarUrl} name={user?.displayName ?? ''} size={64} />
          <Text className="text-lg font-semibold text-slate-800 mt-3">{user?.displayName}</Text>
          <Text className="text-sm text-slate-500">{user?.email}</Text>
        </View>

        {editing ? (
          <>
            <Input
              label="Display Name"
              value={displayName}
              onChangeText={setDisplayName}
            />
            <View className="flex-row gap-3">
              <Button variant="secondary" title="Cancel" onPress={() => setEditing(false)} className="flex-1" />
              <Button title="Save" onPress={handleSaveProfile} loading={updateProfile.isPending} className="flex-1" />
            </View>
          </>
        ) : (
          <Button variant="secondary" title="Edit Profile" onPress={() => setEditing(true)} />
        )}
      </Card>

      {/* Storage */}
      {storageData && (
        <Card>
          <Text className="text-sm font-semibold text-slate-700 mb-3">Storage</Text>
          <StorageBar used={storageData.used} total={storageData.quota} />
          <View className="flex-row justify-between mt-3">
            <View>
              <Text className="text-xs text-slate-400">Used</Text>
              <Text className="text-sm font-medium text-slate-700">{formatFileSize(storageData.used)}</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-slate-400">Available</Text>
              <Text className="text-sm font-medium text-slate-700">{formatFileSize(storageData.available)}</Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-slate-400">Total</Text>
              <Text className="text-sm font-medium text-slate-700">{formatFileSize(storageData.quota)}</Text>
            </View>
          </View>
        </Card>
      )}

      {/* Navigation */}
      <Card padded={false}>
        <TouchableOpacity
          onPress={() => router.push('/settings/security')}
          className="flex-row items-center px-4 py-3.5 border-b border-slate-100"
        >
          <Ionicons name="shield-outline" size={20} color="#475569" />
          <Text className="text-base text-slate-700 ml-3 flex-1">Security</Text>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleChangeServer}
          className="flex-row items-center px-4 py-3.5 border-b border-slate-100"
        >
          <Ionicons name="server-outline" size={20} color="#475569" />
          <Text className="text-base text-slate-700 ml-3 flex-1">Change Server</Text>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleLogout}
          className="flex-row items-center px-4 py-3.5"
        >
          <Ionicons name="log-out-outline" size={20} color="#475569" />
          <Text className="text-base text-slate-700 ml-3 flex-1">Sign Out</Text>
        </TouchableOpacity>
      </Card>

      {/* Danger Zone */}
      <Card>
        <Text className="text-sm font-semibold text-red-600 mb-3">Danger Zone</Text>
        <Button variant="destructive" title="Delete Account" onPress={handleDeleteAccount} />
      </Card>

      <View className="h-8" />
    </ScrollView>
  );
}
