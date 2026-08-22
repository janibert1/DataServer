import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Menu as MenuIcon, ChevronDown, Settings, Shield, LayoutGrid, LogOut, Bell } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/lib/hooks/use-auth';
import { useNotifications } from '@/lib/hooks/use-notifications';
import { Avatar } from '@/components/ui/avatar';
import { SearchBar } from '@/components/ui/search-bar';
import { NotificationList } from '@/components/notifications/notification-list';

// Matches frontend/src/components/layout/DriveLayout.tsx's <header> --
// hamburger (opens Sidebar) + search + notification bell + user avatar menu
// (Settings / Security / Admin panel / Sign out), same as web's dropdown.
export function TopBar({
  onOpenSidebar,
  search,
  onSearchChange,
}: {
  onOpenSidebar: () => void;
  search?: string;
  onSearchChange?: (v: string) => void;
}) {
  const router = useRouter();
  const { user } = useAuthStore();
  const logout = useLogout();
  const { data: notifData } = useNotifications();
  const unread = notifData?.unreadCount ?? 0;

  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View className={`flex-row items-center gap-3 px-4 pb-3 bg-white border-b border-slate-200 ${Platform.OS === "web" ? "pt-3" : "pt-14"}`}>
      <TouchableOpacity onPress={onOpenSidebar} className="p-1.5 rounded-lg">
        <MenuIcon size={20} color="#64748b" />
      </TouchableOpacity>

      <View className="flex-1">
        {onSearchChange ? (
          <SearchBar value={search ?? ''} onChangeText={onSearchChange} />
        ) : null}
      </View>

      <View className="flex-row items-center gap-1.5">
        <TouchableOpacity onPress={() => setNotifOpen(true)} className="relative p-1.5">
          {unread > 0 && (
            <View className="absolute top-0.5 right-0.5 bg-red-500 rounded-full w-4 h-4 items-center justify-center z-10">
              <Text className="text-[10px] text-white font-bold">{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
          <Bell size={20} color="#64748b" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          className="flex-row items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg"
        >
          <Avatar url={user?.avatarUrl} name={user?.displayName ?? ''} size={28} />
          <ChevronDown size={16} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Notifications modal -- reuses the existing NotificationList component */}
      <Modal visible={notifOpen} animationType="slide" transparent onRequestClose={() => setNotifOpen(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setNotifOpen(false)}>
          <Pressable className="mt-auto bg-white rounded-t-2xl" style={{ maxHeight: '75%' }} onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100">
              <Text className="text-base font-bold text-slate-900">Notifications</Text>
              <TouchableOpacity onPress={() => setNotifOpen(false)}>
                <Text className="text-sm text-brand-600 font-medium">Done</Text>
              </TouchableOpacity>
            </View>
            <NotificationList />
          </Pressable>
        </Pressable>
      </Modal>

      {/* User menu -- Settings / Security / Admin panel / Sign out, matching
          web's dropdown exactly. */}
      <Modal visible={menuOpen} animationType="fade" transparent onRequestClose={() => setMenuOpen(false)}>
        <Pressable className="flex-1 bg-black/20" onPress={() => setMenuOpen(false)}>
          <View className="absolute right-4 top-24 w-56 bg-white rounded-xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
            <View className="px-4 py-3 border-b border-slate-50">
              <Text className="text-sm font-medium text-slate-900" numberOfLines={1}>{user?.displayName}</Text>
              <Text className="text-xs text-slate-500" numberOfLines={1}>{user?.email}</Text>
            </View>
            <View className="py-1">
              <TouchableOpacity
                onPress={() => { setMenuOpen(false); router.push('/settings'); }}
                className="flex-row items-center gap-3 px-4 py-2.5"
              >
                <Settings size={16} color="#334155" />
                <Text className="text-sm text-slate-700">Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setMenuOpen(false); router.push('/settings/security'); }}
                className="flex-row items-center gap-3 px-4 py-2.5"
              >
                <Shield size={16} color="#334155" />
                <Text className="text-sm text-slate-700">Security</Text>
              </TouchableOpacity>
              {user?.role === 'ADMIN' && (
                <TouchableOpacity className="flex-row items-center gap-3 px-4 py-2.5">
                  <LayoutGrid size={16} color="#334155" />
                  <Text className="text-sm text-slate-700">Admin panel</Text>
                </TouchableOpacity>
              )}
            </View>
            <View className="border-t border-slate-50 py-1">
              <TouchableOpacity
                onPress={() => { setMenuOpen(false); logout.mutate(); }}
                className="flex-row items-center gap-3 px-4 py-2.5"
              >
                <LogOut size={16} color="#dc2626" />
                <Text className="text-sm text-red-600">Sign out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
