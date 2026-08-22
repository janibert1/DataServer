import { Alert, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { Plus, Upload } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useUploadFiles } from '@/lib/hooks/use-upload';

interface UploadButtonProps {
  folderId?: string;
  onCreateFolder?: () => void;
  // 'fab': the floating round button (Sidebar's own upload-only entry point
  // in the web design lives inline there, but some screens still want a
  // floating add button -- kept as an option). 'inline': a normal labeled
  // button, used in the Sidebar and in each page's header row, matching
  // web's blue "Upload" button there.
  variant?: 'fab' | 'inline';
}

export function UploadButton({ folderId, onCreateFolder, variant = 'fab' }: UploadButtonProps) {
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

  if (variant === 'inline') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        className="flex-row items-center justify-center gap-2 px-3 py-2.5 bg-brand-600 rounded-lg"
        activeOpacity={0.8}
      >
        <Upload size={16} color="white" />
        <Text className="text-sm font-semibold text-white">Upload</Text>
      </TouchableOpacity>
    );
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
      <Plus size={28} color="white" />
    </TouchableOpacity>
  );
}
