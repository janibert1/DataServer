import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification } from '@/lib/hooks/use-notifications';
import { formatDate } from '@/lib/format';
import { EmptyState } from '@/components/ui/empty-state';

const typeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  FOLDER_SHARED: 'folder-outline',
  FILE_UPLOADED: 'cloud-upload-outline',
  SHARE_ACCEPTED: 'checkmark-circle-outline',
  PERMISSION_CHANGED: 'shield-outline',
};

export function NotificationList() {
  const { data, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotif = useDeleteNotification();

  const notifications = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <View className="flex-1">
      {unread > 0 && (
        <TouchableOpacity
          onPress={() => markAllRead.mutate()}
          className="px-4 py-2 border-b border-slate-100"
        >
          <Text className="text-sm text-brand-600 font-medium">Mark all as read</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2563eb" />
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="No notifications"
            description="You're all caught up"
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className={`flex-row px-4 py-3 border-b border-slate-50 ${!item.isRead ? 'bg-brand-50/50' : 'bg-white'}`}
            onPress={() => {
              if (!item.isRead) markRead.mutate(item.id);
            }}
            onLongPress={() => deleteNotif.mutate(item.id)}
          >
            <View className="w-8 h-8 bg-slate-100 rounded-full items-center justify-center mt-0.5">
              <Ionicons
                name={typeIcons[item.type] ?? 'notifications-outline'}
                size={16}
                color="#475569"
              />
            </View>
            <View className="flex-1 ml-3">
              <Text className={`text-sm ${!item.isRead ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
                {item.title}
              </Text>
              <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={2}>
                {item.message}
              </Text>
              <Text className="text-xs text-slate-400 mt-1">{formatDate(item.createdAt)}</Text>
            </View>
            {!item.isRead && <View className="w-2 h-2 bg-brand-600 rounded-full mt-2" />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
