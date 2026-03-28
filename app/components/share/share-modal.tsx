import { useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useFolderShareInfo, useShareFolder, useRevokeShare, useGenerateShareInvitation } from '@/lib/hooks/use-folders';
import { setFolderShareable } from '@/lib/api/folders';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PermissionPicker } from './permission-picker';
import { PermissionBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import type { Permission } from '@/lib/types';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  folderId: string;
  folderName: string;
}

export function ShareModal({ visible, onClose, folderId, folderName }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<Permission>('VIEWER');
  const [canReshare, setCanReshare] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  const { data: shareData, refetch } = useFolderShareInfo(folderId);
  const shareFolder = useShareFolder();
  const revokeShare = useRevokeShare();
  const generateInvite = useGenerateShareInvitation();

  const shares = shareData?.shares ?? [];

  async function handleShare() {
    if (!email.trim()) {
      setError('Please enter an email');
      return;
    }
    setError('');
    try {
      await shareFolder.mutateAsync({
        folderId,
        recipientEmail: email.trim(),
        permission,
        canReshare,
      });
      setEmail('');
      Toast.show({ type: 'success', text1: 'Folder shared' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to share');
    }
  }

  async function handleGenerateLink() {
    try {
      const result = await generateInvite.mutateAsync({
        folderId,
        permission,
      });
      setInviteCode(result.invitation.code);
    } catch (e: unknown) {
      Toast.show({ type: 'error', text1: e instanceof Error ? e.message : 'Failed to generate link' });
    }
  }

  async function handleCopyCode() {
    await Clipboard.setStringAsync(inviteCode);
    Toast.show({ type: 'success', text1: 'Code copied to clipboard' });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="bg-white rounded-t-3xl max-h-[85%] shadow-lg">
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-100">
            <Text className="text-lg font-semibold text-slate-800">Share "{folderName}"</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView className="px-5 py-4" keyboardShouldPersistTaps="handled">
            {/* Share by email */}
            {error ? (
              <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                <Text className="text-sm text-red-600">{error}</Text>
              </View>
            ) : null}

            <Input
              label="Share with email"
              placeholder="user@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text className="text-sm font-medium text-slate-700 mb-2">Permission level</Text>
            <PermissionPicker value={permission} onChange={setPermission} />

            <View className="flex-row items-center justify-between mt-4 mb-4">
              <Text className="text-sm text-slate-600">Allow resharing</Text>
              <Switch value={canReshare} onValueChange={setCanReshare} trackColor={{ true: '#2563eb' }} />
            </View>

            <Button title="Share" onPress={handleShare} loading={shareFolder.isPending} />

            {/* Generate invite link */}
            <View className="mt-6 pt-6 border-t border-slate-100">
              <Text className="text-sm font-medium text-slate-700 mb-3">Invite link</Text>
              <Button
                variant="secondary"
                title="Generate Invite Code"
                onPress={handleGenerateLink}
                loading={generateInvite.isPending}
              />
              {inviteCode && (
                <TouchableOpacity
                  onPress={handleCopyCode}
                  className="flex-row items-center justify-between bg-slate-50 rounded-lg p-3 mt-3 border border-slate-200"
                >
                  <Text className="text-sm font-mono text-slate-700 flex-1" numberOfLines={1}>
                    {inviteCode}
                  </Text>
                  <Ionicons name="copy-outline" size={18} color="#64748b" />
                </TouchableOpacity>
              )}
            </View>

            {/* Current shares */}
            {shares.length > 0 && (
              <View className="mt-6 pt-6 border-t border-slate-100">
                <Text className="text-sm font-medium text-slate-700 mb-3">
                  Shared with ({shares.length})
                </Text>
                {shares.map((share) => (
                  <View
                    key={share.id}
                    className="flex-row items-center py-3 border-b border-slate-50"
                  >
                    <Avatar
                      url={share.recipient?.avatarUrl}
                      name={share.recipient?.displayName ?? ''}
                      size={32}
                    />
                    <View className="flex-1 ml-3">
                      <Text className="text-sm text-slate-800">
                        {share.recipient?.displayName ?? share.recipientId}
                      </Text>
                    </View>
                    <PermissionBadge permission={share.permission} />
                    <TouchableOpacity
                      onPress={() => revokeShare.mutate({ folderId, shareId: share.id })}
                      className="ml-2 p-1"
                    >
                      <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View className="h-8" />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
