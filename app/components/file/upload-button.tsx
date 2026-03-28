import { Alert } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useUploadFiles } from '@/lib/hooks/use-upload';

interface UploadButtonProps {
  folderId?: string;
  onCreateFolder?: () => void;
}

export function UploadButton({ folderId, onCreateFolder }: UploadButtonProps) {
  const uploadMutation = useUploadFiles(folderId);

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert('Add', undefined, [
      { text: 'Pick Document', onPress: pickDocument },
      { text: 'Pick Photo/Video', onPress: pickImage },
      { text: 'Take Photo', onPress: takePhoto },
      ...(onCreateFolder ? [{ text: 'New Folder', onPress: () => onCreateFolder() }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        uploadMutation.mutate(
          result.assets.map((a) => ({
            uri: a.uri,
            name: a.name,
            type: a.mimeType ?? 'application/octet-stream',
          })),
        );
      }
    } catch {
      // User cancelled
    }
  }

  async function pickImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant access to your photo library.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (!result.canceled && result.assets.length > 0) {
        uploadMutation.mutate(
          result.assets.map((a) => ({
            uri: a.uri,
            name: a.fileName ?? `photo-${Date.now()}.jpg`,
            type: a.mimeType ?? 'image/jpeg',
          })),
        );
      }
    } catch {
      // User cancelled
    }
  }

  async function takePhoto() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera access.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 1 });
      if (!result.canceled && result.assets.length > 0) {
        const a = result.assets[0];
        uploadMutation.mutate([
          {
            uri: a.uri,
            name: a.fileName ?? `photo-${Date.now()}.jpg`,
            type: a.mimeType ?? 'image/jpeg',
          },
        ]);
      }
    } catch {
      // User cancelled
    }
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        backgroundColor: '#2563eb',
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}
      activeOpacity={0.8}
    >
      <Ionicons name="add" size={28} color="white" />
    </TouchableOpacity>
  );
}
