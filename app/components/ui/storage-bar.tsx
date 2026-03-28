import { View, Text } from 'react-native';
import { formatFileSize } from '@/lib/format';

interface StorageBarProps {
  used: number;
  total: number;
  compact?: boolean;
}

export function StorageBar({ used, total, compact }: StorageBarProps) {
  const percentage = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const isHigh = percentage > 80;
  const isCritical = percentage > 95;

  return (
    <View className={compact ? '' : 'gap-1.5'}>
      <View className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <View
          className={`h-full rounded-full ${isCritical ? 'bg-red-500' : isHigh ? 'bg-amber-500' : 'bg-brand-600'}`}
          style={{ width: `${percentage}%` }}
        />
      </View>
      {!compact && (
        <Text className="text-xs text-slate-500">
          {formatFileSize(used)} of {formatFileSize(total)} used
        </Text>
      )}
    </View>
  );
}
