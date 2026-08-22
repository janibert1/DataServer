import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, Save, Bell, AlertTriangle, ChevronRight, Shield, Server, LogOut } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile, useUpdateProfile, useStorage, useDeleteAccount } from '@/lib/hooks/use-account';
import { useLogout } from '@/lib/hooks/use-auth';
import { DriveShell } from '@/components/layout/drive-shell';
import { StorageBar } from '@/components/ui/storage-bar';
import { showConfirm } from '@/components/ui/confirm-dialog';
import { formatFileSize } from '@/lib/format';
import Toast from 'react-native-toast-message';

// Matches frontend/src/pages/drive/SettingsPage.tsx -- same Section-card
// layout (Profile / Storage / Notifications / Account), nested in DriveShell
// the same way web nests it inside DriveLayout. Change Server / Sign Out
// have no web equivalent (single-domain web app) -- kept as a mobile-only
// nav list at the bottom, styled to match.
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <View className="px-5 py-4 border-b border-slate-100">
        <Text className="text-base font-semibold text-slate-900">{title}</Text>
        {description ? <Text className="text-sm text-slate-500 mt-0.5">{description}</Text> : null}
      </View>
      <View className="p-5">{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: storage, isLoading: storageLoading } = useStorage();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();
  const logoutMutation = useLogout();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (profile?.user) {
      setDisplayName(profile.user.displayName ?? '');
      setAvatarUrl(profile.user.avatarUrl ?? '');
    }
  }, [profile]);

  async function handleSaveProfile() {
    try {
      await updateProfile.mutateAsync({ displayName: displayName.trim(), avatarUrl: avatarUrl.trim() || undefined });
      Toast.show({ type: 'success', text1: 'Profile updated' });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Failed to update profile', text2: e instanceof Error ? e.message : undefined });
    }
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
      title: 'Delete your account?',
      message: 'All your files, folders, and data will be permanently deleted. This action cannot be undone.',
      confirmText: 'Delete my account',
      destructive: true,
      onConfirm: async () => {
        await deleteAccount.mutateAsync();
        useAuthStore.getState().logout();
      },
    });
  }

  const used = storage?.used ?? 0;
  const total = storage?.total ?? 1;

  return (
    <DriveShell>
      <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 gap-4">
        <View>
          <Text className="text-xl font-bold text-slate-900">Settings</Text>
          <Text className="text-sm text-slate-500 mt-1">Manage your profile and account preferences</Text>
        </View>

        {/* Profile */}
        <Section title="Profile" description="Update your display name and avatar">
          {profileLoading ? (
            <View className="py-6 items-center"><ActivityIndicator color="#94a3b8" /></View>
          ) : (
            <View className="gap-4">
              <View className="flex-row items-center gap-4">
                <View className="w-16 h-16 rounded-full bg-brand-600 items-center justify-center overflow-hidden">
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={{ width: 64, height: 64 }} />
                  ) : (
                    <Text className="text-white text-xl font-bold">
                      {(displayName || user?.displayName || '?')[0]?.toUpperCase()}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-slate-700 mb-1.5">Avatar URL</Text>
                  <View className="flex-row items-center border border-slate-300 rounded-lg px-3">
                    <Camera size={15} color="#94a3b8" />
                    <TextInput
                      className="flex-1 py-2.5 px-2 text-sm text-slate-800"
                      value={avatarUrl}
                      onChangeText={setAvatarUrl}
                      placeholder="https://example.com/avatar.jpg"
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>

              <View>
                <Text className="text-sm font-medium text-slate-700 mb-1.5">Display name</Text>
                <TextInput
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-800"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  placeholderTextColor="#94a3b8"
                  maxLength={100}
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-slate-700 mb-1.5">Email</Text>
                <View className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg bg-slate-50">
                  <Text className="text-sm text-slate-500">{user?.email}</Text>
                </View>
                <Text className="text-xs text-slate-400 mt-1">Email address cannot be changed.</Text>
              </View>

              <View className="flex-row justify-end">
                <TouchableOpacity
                  onPress={handleSaveProfile}
                  disabled={updateProfile.isPending || !displayName.trim()}
                  className={`flex-row items-center gap-2 px-4 py-2 bg-brand-600 rounded-lg ${updateProfile.isPending || !displayName.trim() ? 'opacity-50' : ''}`}
                >
                  <Save size={14} color="white" />
                  <Text className="text-white text-sm font-medium">
                    {updateProfile.isPending ? 'Saving…' : 'Save changes'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Section>

        {/* Storage */}
        <Section title="Storage" description="Your storage usage and quota">
          {storageLoading ? (
            <View className="py-6 items-center"><ActivityIndicator color="#94a3b8" /></View>
          ) : (
            <View className="gap-4">
              <StorageBar used={used} total={total} />
              <View className="flex-row gap-3">
                <View className="flex-1 items-center p-3 bg-slate-50 rounded-xl">
                  <Text className="text-base font-bold text-slate-900">{formatFileSize(used)}</Text>
                  <Text className="text-xs text-slate-500 mt-1">Used</Text>
                </View>
                <View className="flex-1 items-center p-3 bg-slate-50 rounded-xl">
                  <Text className="text-base font-bold text-slate-900">{formatFileSize(Math.max(total - used, 0))}</Text>
                  <Text className="text-xs text-slate-500 mt-1">Available</Text>
                </View>
                <View className="flex-1 items-center p-3 bg-slate-50 rounded-xl">
                  <Text className="text-base font-bold text-slate-900">{formatFileSize(total)}</Text>
                  <Text className="text-xs text-slate-500 mt-1">Total quota</Text>
                </View>
              </View>
            </View>
          )}
        </Section>

        {/* Notifications */}
        <Section title="Notifications" description="Control how you receive notifications">
          <View className="flex-row items-start gap-3 p-4 bg-brand-50 border border-brand-100 rounded-xl">
            <Bell size={18} color="#3b82f6" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-brand-800">More notification settings coming soon</Text>
              <Text className="text-xs text-brand-600 mt-0.5">
                In-app notifications are active. Email notification controls will be available in a future update.
              </Text>
            </View>
          </View>
        </Section>

        {/* Account */}
        <Section title="Account" description="Manage your account">
          <View className="flex-row items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
            <AlertTriangle size={18} color="#ef4444" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-red-800">Delete account</Text>
              <Text className="text-xs text-red-600 mt-1">
                Permanently deletes your account and all associated files. This cannot be undone.
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleDeleteAccount}
              className="px-3 py-1.5 bg-white border border-red-300 rounded-lg"
            >
              <Text className="text-sm font-medium text-red-600">Delete</Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* Mobile-only: Security / Change Server / Sign out (no web equivalent
            page for this list -- Security is its own route there too, and
            Sign out lives in the account dropdown, both linked here for
            reachability on a touch device). */}
        <View className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <TouchableOpacity
            onPress={() => router.push('/settings/security')}
            className="flex-row items-center px-5 py-3.5 border-b border-slate-100"
          >
            <Shield size={18} color="#475569" />
            <Text className="text-sm text-slate-700 ml-3 flex-1">Security</Text>
            <ChevronRight size={16} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleChangeServer}
            className="flex-row items-center px-5 py-3.5 border-b border-slate-100"
          >
            <Server size={18} color="#475569" />
            <Text className="text-sm text-slate-700 ml-3 flex-1">Change Server</Text>
            <ChevronRight size={16} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => logoutMutation.mutate()}
            className="flex-row items-center px-5 py-3.5"
          >
            <LogOut size={18} color="#dc2626" />
            <Text className="text-sm text-red-600 ml-3 flex-1">Sign out</Text>
          </TouchableOpacity>
        </View>

        <View className="h-8" />
      </ScrollView>
    </DriveShell>
  );
}
