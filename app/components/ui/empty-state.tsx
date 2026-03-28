import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = 'folder-open-outline', title, description, action }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <Ionicons name={icon} size={56} color="#cbd5e1" />
      <Text className="text-lg font-semibold text-slate-700 mt-4 text-center">{title}</Text>
      {description && (
        <Text className="text-sm text-slate-400 mt-2 text-center">{description}</Text>
      )}
      {action && <View className="mt-6">{action}</View>}
    </View>
  );
}
