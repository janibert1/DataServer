import { View, Text } from 'react-native';
import type { Permission } from '@/lib/types';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: 'bg-slate-100', text: 'text-slate-600' },
  success: { bg: 'bg-green-100', text: 'text-green-700' },
  warning: { bg: 'bg-amber-100', text: 'text-amber-700' },
  danger: { bg: 'bg-red-100', text: 'text-red-700' },
  info: { bg: 'bg-blue-100', text: 'text-blue-700' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700' },
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  const v = variantClasses[variant];
  return (
    <View className={`px-2.5 py-0.5 rounded-full ${v.bg}`}>
      <Text className={`text-xs font-medium ${v.text}`}>{label}</Text>
    </View>
  );
}

const permissionVariant: Record<Permission, BadgeVariant> = {
  VIEWER: 'default',
  DOWNLOADER: 'info',
  CONTRIBUTOR: 'success',
  EDITOR: 'warning',
  OWNER: 'purple',
};

export function PermissionBadge({ permission }: { permission: Permission }) {
  return <Badge label={permission} variant={permissionVariant[permission]} />;
}
