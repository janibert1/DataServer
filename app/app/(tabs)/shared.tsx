import { useCallback } from 'react';
import { View, Text, TouchableOpacity, RefreshControl, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getSharedWithMe } from '@/lib/api/shared';
import { PermissionBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { FolderIcon } from '@/components/file/file-icon';
import { formatDate } from '@/lib/format';
import type { Permission } from '@/lib/types';

interface SharedFolderItem {
  shareId: string;
  permission: Permission;
  canReshare: boolean;
  sharedAt: string;
  folder: {
    id: string;
    name: string;
    path?: string;
    color?: string | null;
    isShared?: boolean;
    updatedAt?: string;
    fileCount?: number;
    owner?: { id: string; displayName: string; avatarUrl: string | null };
  };
}

function ShareRow({ item, onPress }: { item: SharedFolderItem; onPress: () => void }) {
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
          {item.folder?.owner && (
            <Text style={{ fontSize: 12, color: '#94a3b8' }}>
              from {item.folder.owner.displayName}
            </Text>
          )}
          <Text style={{ fontSize: 12, color: '#cbd5e1' }}>·</Text>
          <Text style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(item.sharedAt)}</Text>
        </View>
      </View>
      <PermissionBadge permission={item.permission} />
    </TouchableOpacity>
  );
}

export default function SharedScreen() {
  const router = useRouter();
  const { data, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.shared.withMe,
    queryFn: getSharedWithMe,
  });

  const shares = (data?.shares ?? []) as SharedFolderItem[];

  const renderItem = useCallback(({ item }: { item: SharedFolderItem }) => (
    <ShareRow item={item} onPress={() => router.push(`/folder/${item.folder?.id}`)} />
  ), [router]);

  return (
    <FlatList
      data={shares}
      keyExtractor={(item: SharedFolderItem) => item.shareId}
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2563eb" />
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
  );
}
