import { useState, useEffect } from 'react';
import { Modal, View, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRenameFile } from '@/lib/hooks/use-files';
import { useRenameFolder } from '@/lib/hooks/use-folders';

interface RenameModalProps {
  visible: boolean;
  onClose: () => void;
  item: { id: string; name: string; type: 'file' | 'folder' } | null;
}

export function RenameModal({ visible, onClose, item }: RenameModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const renameFile = useRenameFile();
  const renameFolder = useRenameFolder();

  useEffect(() => {
    if (item) setName(item.name);
  }, [item]);

  async function handleRename() {
    if (!name.trim() || !item) {
      setError('Please enter a name');
      return;
    }
    setError('');
    try {
      if (item.type === 'file') {
        await renameFile.mutateAsync({ id: item.id, name: name.trim() });
      } else {
        await renameFolder.mutateAsync({ id: item.id, name: name.trim() });
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Rename failed');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 justify-center items-center bg-black/50"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="bg-white rounded-2xl p-6 mx-6 w-full max-w-sm shadow-lg">
          <Text className="text-lg font-semibold text-slate-800 mb-4">Rename</Text>
          <Input
            value={name}
            onChangeText={setName}
            error={error}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={handleRename}
          />
          <View className="flex-row gap-3 mt-2">
            <Button variant="secondary" title="Cancel" onPress={onClose} className="flex-1" />
            <Button
              title="Rename"
              onPress={handleRename}
              loading={renameFile.isPending || renameFolder.isPending}
              className="flex-1"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
