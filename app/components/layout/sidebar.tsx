import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
  HardDrive, Users, Share2, Clock, Star, Trash2, Settings, Shield, Archive,
  X, FolderOpen, Zap, Download,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import { StorageBar } from '@/components/ui/storage-bar';
import { UploadButton } from '@/components/file/upload-button';

// Matches frontend/src/components/layout/DriveLayout.tsx's Sidebar exactly --
// same 8 nav items in the same order, same icons (lucide-react-native, not
// Ionicons), same amber accent on Backups, same bottom StorageBar +
// Settings/Security row.
const navItems: { to: string; icon: React.ElementType; label: string; accent?: 'amber' }[] = [
  { to: '/', icon: HardDrive, label: 'My Drive' },
  { to: '/shared-with-me', icon: Users, label: 'Shared with me' },
  { to: '/shared-by-me', icon: Share2, label: 'Shared by me' },
  { to: '/recent', icon: Clock, label: 'Recent' },
  { to: '/starred', icon: Star, label: 'Starred' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
  { to: '/backup', icon: Archive, label: 'Backups', accent: 'amber' },
  { to: '/trash', icon: Trash2, label: 'Trash' },
];

export function Sidebar({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();

  return (
    <View className="flex-1 bg-white">
      {/* Logo */}
      <View className={`flex-row items-center gap-2.5 px-5 pb-5 ${Platform.OS === "web" ? "pt-5" : "pt-14"}`}>
        <View className="w-8 h-8 rounded-xl bg-brand-600 items-center justify-center">
          <Zap size={18} color="white" fill="white" />
        </View>
        <Text className="text-base font-bold text-slate-900 flex-1">DataServer</Text>
        <TouchableOpacity onPress={onClose} className="p-1 rounded-lg">
          <X size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Upload button */}
      <View className="px-4 mb-4">
        <UploadButton variant="inline" onCreateFolder={() => {}} />
      </View>

      {/* Navigation */}
      <ScrollView className="flex-1 px-3" contentContainerClassName="gap-0.5">
        {navItems.map(({ to, icon: Icon, label, accent }) => {
          const isActive = pathname === to;
          const activeColors = accent === 'amber'
            ? { bg: 'bg-amber-50', text: 'text-amber-700', icon: '#d97706' }
            : { bg: 'bg-brand-50', text: 'text-brand-700', icon: '#2563eb' };
          return (
            <TouchableOpacity
              key={to}
              onPress={() => { router.push(to as any); onClose(); }}
              className={`flex-row items-center gap-3 px-3 py-2.5 rounded-lg ${isActive ? activeColors.bg : ''}`}
            >
              <Icon size={18} color={isActive ? activeColors.icon : '#94a3b8'} />
              <Text className={`text-sm font-medium ${isActive ? activeColors.text : 'text-slate-600'}`}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Bottom section */}
      <View className="px-4 py-4 border-t border-slate-100 gap-4">
        {user && (
          <StorageBar used={parseInt(user.storageUsedBytes ?? "0")} total={parseInt(user.storageQuotaBytes ?? "1")} />
        )}
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => { router.push('/settings'); onClose(); }}
            className="flex-1 flex-row items-center gap-2 px-2 py-1.5 rounded-lg"
          >
            <Settings size={14} color="#64748b" />
            <Text className="text-xs font-medium text-slate-500">Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { router.push('/settings/security'); onClose(); }}
            className="flex-1 flex-row items-center gap-2 px-2 py-1.5 rounded-lg"
          >
            <Shield size={14} color="#64748b" />
            <Text className="text-xs font-medium text-slate-500">Security</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
