import { useCallback } from 'react';
import { View, Text, TouchableOpacity, RefreshControl, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getSharedWithMe } from '@/lib/api/shared';
import { DriveShell } from '@/components/layout/drive-shell';
import { PermissionBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { FolderIcon } from '@/components/file/file-icon';
import { formatDate } from '@/lib/format';
import type { FolderShare } from '@/lib/types';

// Matches frontend/src/pages/drive/SharedWithMePage.tsx.
function ShareRow({ item, onPress }: { item: FolderShare; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <FolderIcon size={28} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#1e293b' }} numberOfLines={1}>
          {item.folder?.name ?? 'Shared Folder'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {item.owner && (
            <Text style={{ fontSize: 12, color: '#94a3b8' }}>
              from {item.owner.displayName}
            </Text>
          )}
          <Text style={{ fontSize: 12, color: '#cbd5e1' }}>·</Text>
          <Text style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>
      <PermissionBadge permission={item.permission} />
    </TouchableOpacity>
  );
}

export default function SharedWithMeScreen() {
  const router = useRouter();
  const { data, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.shared.withMe,
    queryFn: getSharedWithMe,
  });

  const shares = data?.shares ?? [];

  const renderItem = useCallback(({ item }: { item: FolderShare }) => (
    <ShareRow item={item} onPress={() => router.push(`/folder/${item.folder?.id}`)} />
  ), [router]);

  return (
    <DriveShell>
      <FlatList
        data={shares}
        keyExtractor={(item: FolderShare) => item.id}
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2563eb" />
        }
        ListHeaderComponent={
          <View className="flex-row items-center gap-3 px-4 pt-4 pb-3">
            <Text className="text-xl font-bold text-slate-900">Shared with me</Text>
            {shares.length > 0 && (
              <View className="bg-slate-100 rounded-full px-2.5 py-1">
                <Text className="text-xs font-medium text-slate-600">{shares.length}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Nothing shared with you"
            description="When someone shares a folder with you, it will appear here"
          />
        }
        renderItem={renderItem}
      />
    </DriveShell>
  );
}
