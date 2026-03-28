import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCreateFolder } from '@/lib/hooks/use-folders';

interface CreateFolderModalProps {
  visible: boolean;
  onClose: () => void;
  parentId?: string;
}

export function CreateFolderModal({ visible, onClose, parentId }: CreateFolderModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const createFolder = useCreateFolder();

  async function handleCreate() {
    if (!name.trim()) {
      setError('Please enter a folder name');
      return;
    }
    setError('');
    try {
      await createFolder.mutateAsync({ name: name.trim(), parentId });
      setName('');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create folder');
    }
  }

  function handleClose() {
    setName('');
    setError('');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        className="flex-1 justify-center items-center bg-black/50"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="bg-white rounded-2xl p-6 mx-6 w-full max-w-sm shadow-lg">
          <Text className="text-lg font-semibold text-slate-800 mb-4">New Folder</Text>

          <Input
            placeholder="Folder name"
            value={name}
            onChangeText={setName}
            error={error}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />

          <View className="flex-row gap-3 mt-2">
            <Button variant="secondary" title="Cancel" onPress={handleClose} className="flex-1" />
            <Button title="Create" onPress={handleCreate} loading={createFolder.isPending} className="flex-1" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
