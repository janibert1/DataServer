import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DriveFolder } from '@/lib/types';

interface BreadcrumbProps {
  ancestors: Array<{ id: string; name: string }>;
  current: string;
}

export function Breadcrumb({ ancestors, current }: BreadcrumbProps) {
  const router = useRouter();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="bg-white border-b border-slate-100"
      contentContainerClassName="px-4 py-2 flex-row items-center gap-1"
    >
      <TouchableOpacity onPress={() => router.navigate('/(tabs)')}>
        <Text className="text-sm text-brand-600 font-medium">My Drive</Text>
      </TouchableOpacity>

      {ancestors.map((item) => (
        <View key={item.id} className="flex-row items-center gap-1">
          <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
          <TouchableOpacity onPress={() => router.push(`/folder/${item.id}`)}>
            <Text className="text-sm text-brand-600 font-medium">{item.name}</Text>
          </TouchableOpacity>
        </View>
      ))}

      <View className="flex-row items-center gap-1">
        <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
        <Text className="text-sm text-slate-800 font-medium">{current}</Text>
      </View>
    </ScrollView>
  );
}
