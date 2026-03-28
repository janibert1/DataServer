import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

const mimeIconMap: Array<{ pattern: RegExp; icon: keyof typeof Ionicons.glyphMap; colorKey: keyof typeof Colors.fileType }> = [
  { pattern: /^image\//, icon: 'image-outline', colorKey: 'image' },
  { pattern: /^video\//, icon: 'videocam-outline', colorKey: 'video' },
  { pattern: /^audio\//, icon: 'musical-notes-outline', colorKey: 'audio' },
  { pattern: /application\/pdf/, icon: 'document-text-outline', colorKey: 'pdf' },
  { pattern: /spreadsheet|excel|csv/, icon: 'grid-outline', colorKey: 'spreadsheet' },
  { pattern: /presentation|powerpoint/, icon: 'easel-outline', colorKey: 'presentation' },
  { pattern: /msword|wordprocessing|document/, icon: 'document-outline', colorKey: 'document' },
  { pattern: /zip|rar|tar|gzip|archive|compressed/, icon: 'file-tray-stacked-outline', colorKey: 'archive' },
  { pattern: /text\/(javascript|typescript|html|css|xml|json|plain)|application\/(json|xml|javascript)/, icon: 'code-slash-outline', colorKey: 'code' },
];

interface FileIconProps {
  mimeType: string;
  size?: number;
}

export function FileIcon({ mimeType, size = 24 }: FileIconProps) {
  const match = mimeIconMap.find((m) => m.pattern.test(mimeType));
  const icon = match?.icon ?? 'document-outline';
  const color = match ? Colors.fileType[match.colorKey] : Colors.fileType.default;

  return <Ionicons name={icon} size={size} color={color} />;
}

export function FolderIcon({ color, size = 24 }: { color?: string | null; size?: number }) {
  return <Ionicons name="folder" size={size} color={color || '#f59e0b'} />;
}
