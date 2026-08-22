import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Share2, FolderOpen, Users } from 'lucide-react-native';
import { formatDate } from '@/lib/format';
import { getSharedByMe } from '@/lib/api/shared';
import { DriveShell } from '@/components/layout/drive-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { PermissionBadge } from '@/components/ui/badge';
import { ShareModal } from '@/components/share/share-modal';
import type { Permission } from '@/lib/types';

// Matches frontend/src/pages/drive/SharedByMePage.tsx.
interface RawShare {
  id: string;
  permission: Permission;
  createdAt: string;
  recipientEmail?: string;
  recipient?: { displayName: string; email: string } | null;
  folder?: { id: string; name: string } | null;
}

export default function SharedByMeScreen() {
  const [shareFolder, setShareFolder] = useState<{ id: string; name: string } | null>(null);
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['shared', 'byMe'],
    queryFn: getSharedByMe,
  });

  const shares = (data?.shares ?? []) as unknown as RawShare[];

  const byFolder = useMemo(() => {
    const acc: Record<string, { folder: { id: string; name: string }; shares: RawShare[] }> = {};
    for (const share of shares) {
      const fid = share.folder?.id;
      if (!fid) continue;
      if (!acc[fid]) acc[fid] = { folder: share.folder!, shares: [] };
      acc[fid].shares.push(share);
    }
    return acc;
  }, [shares]);

  const folderGroups = Object.values(byFolder);

  return (
    <DriveShell>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2563eb" />}
      >
        <View className="flex-row items-center gap-3 px-4 pt-4 pb-3">
          <Text className="text-xl font-bold text-slate-900">Shared by me</Text>
          {folderGroups.length > 0 && (
            <View className="bg-slate-100 rounded-full px-2.5 py-1">
              <Text className="text-xs font-medium text-slate-600">
                {folderGroups.length} folder{folderGroups.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {!isLoading && folderGroups.length === 0 && (
          <EmptyState
            icon="share-social-outline"
            title="You haven't shared anything"
            description="When you share a folder with others, it will appear here"
          />
        )}

        <View className="px-4 gap-4 pb-6">
          {folderGroups.map(({ folder, shares: folderShares }) => (
            <View key={folder.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <View className="flex-row items-center gap-3 p-4 border-b border-slate-50">
                <View className="w-10 h-10 rounded-xl bg-amber-50 items-center justify-center">
                  <FolderOpen size={18} color="#d97706" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-800" numberOfLines={1}>{folder.name}</Text>
                  <Text className="text-xs text-slate-500">
                    {folderShares.length} person{folderShares.length !== 1 ? 's' : ''} with access
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShareFolder(folder)}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 bg-brand-50 border border-brand-200 rounded-lg"
                >
                  <Users size={13} color="#2563eb" />
                  <Text className="text-xs font-medium text-brand-600">Manage</Text>
                </TouchableOpacity>
              </View>
              {folderShares.map((share) => (
                <View key={share.id} className="flex-row items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-b-0">
                  <View className="w-8 h-8 rounded-full bg-brand-100 items-center justify-center">
                    <Text className="text-brand-700 text-xs font-bold">
                      {(share.recipient?.displayName?.[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-700" numberOfLines={1}>
                      {share.recipient?.displayName ?? 'Pending'}
                    </Text>
                    <Text className="text-xs text-slate-400" numberOfLines={1}>
                      {share.recipient?.email ?? share.recipientEmail}
                    </Text>
                  </View>
                  <PermissionBadge permission={share.permission} />
                  <Text className="text-xs text-slate-400">{formatDate(share.createdAt)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {shareFolder && (
        <ShareModal
          visible={!!shareFolder}
          onClose={() => setShareFolder(null)}
          folderId={shareFolder.id}
          folderName={shareFolder.name}
        />
      )}
    </DriveShell>
  );
}
