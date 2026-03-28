import { View, Text, TouchableOpacity } from 'react-native';
import type { Permission } from '@/lib/types';

const permissions: Array<{ value: Permission; label: string; description: string; color: string }> = [
  { value: 'VIEWER', label: 'Viewer', description: 'Can view files', color: 'bg-slate-100 text-slate-600' },
  { value: 'DOWNLOADER', label: 'Downloader', description: 'Can download files', color: 'bg-blue-100 text-blue-600' },
  { value: 'CONTRIBUTOR', label: 'Contributor', description: 'Can upload files', color: 'bg-green-100 text-green-600' },
  { value: 'EDITOR', label: 'Editor', description: 'Can edit and delete', color: 'bg-amber-100 text-amber-600' },
  { value: 'OWNER', label: 'Owner', description: 'Full control', color: 'bg-purple-100 text-purple-600' },
];

interface PermissionPickerProps {
  value: Permission;
  onChange: (permission: Permission) => void;
}

export function PermissionPicker({ value, onChange }: PermissionPickerProps) {
  return (
    <View className="gap-2">
      {permissions.map((perm) => (
        <TouchableOpacity
          key={perm.value}
          onPress={() => onChange(perm.value)}
          className={`flex-row items-center p-3 rounded-lg border ${
            value === perm.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
          }`}
        >
          <View className={`px-2 py-0.5 rounded-full ${perm.color.split(' ')[0]}`}>
            <Text className={`text-xs font-medium ${perm.color.split(' ')[1]}`}>{perm.label}</Text>
          </View>
          <Text className="text-xs text-slate-500 ml-2 flex-1">{perm.description}</Text>
          {value === perm.value && (
            <View className="w-5 h-5 rounded-full bg-brand-600 items-center justify-center">
              <Text className="text-white text-xs">✓</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}
