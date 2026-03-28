import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (folderName: string) => void;
  isPending?: boolean;
}

export function AutoCreateFolderModal({ visible, onClose, onConfirm, isPending }: Props) {
  const [name, setName] = useState('New folder');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setName('New folder');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  function handleSubmit() {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-center items-center bg-black/40"
      >
        <View className="bg-white rounded-2xl mx-6 w-[85%] max-w-sm shadow-xl">
          <View className="flex-row items-center justify-between px-5 pt-5 pb-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="folder-outline" size={18} color="#2563eb" />
              <Text className="text-base font-semibold text-slate-900">Create folder</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Ionicons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <Text className="text-sm text-slate-500 px-5 mb-3">
            A new folder will be created and both items will be moved into it.
          </Text>

          <View className="px-5 pb-5">
            <TextInput
              ref={inputRef}
              value={name}
              onChangeText={setName}
              onSubmitEditing={handleSubmit}
              placeholder="Folder name"
              maxLength={255}
              selectTextOnFocus
              className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-800 mb-4"
              returnKeyType="done"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 py-2.5 rounded-lg border border-slate-300 items-center"
                activeOpacity={0.7}
              >
                <Text className="text-sm font-medium text-slate-700">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!name.trim() || isPending}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 items-center"
                activeOpacity={0.7}
                style={{ opacity: !name.trim() || isPending ? 0.5 : 1 }}
              >
                <Text className="text-sm font-medium text-white">
                  {isPending ? 'Creating…' : 'Create & move'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
