import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { showConfirm } from '@/components/ui/confirm-dialog';
import type { DriveFile, DriveFolder } from '@/lib/types';

interface FileActionHandlers {
  onPreview?: (file: DriveFile) => void;
  onDownload?: (file: DriveFile) => void;
  onRename?: (file: DriveFile) => void;
  onStar?: (file: DriveFile) => void;
  onTrash?: (file: DriveFile) => void;
  onRestore?: (file: DriveFile) => void;
  onPermanentDelete?: (file: DriveFile) => void;
}

export function showFileActions(file: DriveFile, handlers: FileActionHandlers, isTrash = false) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  if (isTrash) {
    Alert.alert(file.name, undefined, [
      { text: 'Restore', onPress: () => handlers.onRestore?.(file) },
      {
        text: 'Delete Permanently',
        style: 'destructive',
        onPress: () =>
          showConfirm({
            title: 'Delete Permanently',
            message: `"${file.name}" will be permanently deleted.`,
            confirmText: 'Delete',
            destructive: true,
            onConfirm: () => handlers.onPermanentDelete?.(file),
          }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
    return;
  }

  Alert.alert(file.name, undefined, [
    { text: 'Preview', onPress: () => handlers.onPreview?.(file) },
    { text: 'Download', onPress: () => handlers.onDownload?.(file) },
    { text: 'Rename', onPress: () => handlers.onRename?.(file) },
    {
      text: file.isStarred ? 'Unstar' : 'Star',
      onPress: () => handlers.onStar?.(file),
    },
    {
      text: 'Move to Trash',
      style: 'destructive',
      onPress: () =>
        showConfirm({
          title: 'Move to Trash',
          message: `"${file.name}" will be moved to trash. You can restore it within 30 days.`,
          confirmText: 'Move to Trash',
          destructive: true,
          onConfirm: () => handlers.onTrash?.(file),
        }),
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

interface FolderActionHandlers {
  onOpen?: (folder: DriveFolder) => void;
  onRename?: (folder: DriveFolder) => void;
  onStar?: (folder: DriveFolder) => void;
  onShare?: (folder: DriveFolder) => void;
  onTrash?: (folder: DriveFolder) => void;
}

export function showFolderActions(folder: DriveFolder, handlers: FolderActionHandlers) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  Alert.alert(folder.name, undefined, [
    { text: 'Open', onPress: () => handlers.onOpen?.(folder) },
    { text: 'Rename', onPress: () => handlers.onRename?.(folder) },
    {
      text: folder.isStarred ? 'Unstar' : 'Star',
      onPress: () => handlers.onStar?.(folder),
    },
    { text: 'Share', onPress: () => handlers.onShare?.(folder) },
    {
      text: 'Move to Trash',
      style: 'destructive',
      onPress: () =>
        showConfirm({
          title: 'Move to Trash',
          message: `"${folder.name}" will be moved to trash. You can restore it within 30 days.`,
          confirmText: 'Move to Trash',
          destructive: true,
          onConfirm: () => handlers.onTrash?.(folder),
        }),
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
