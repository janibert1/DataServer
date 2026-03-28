import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNotifications } from '@/lib/hooks/use-notifications';
import { useAuthStore } from '@/stores/auth-store';
import { Avatar } from '@/components/ui/avatar';

function HeaderRight() {
  const router = useRouter();
  const { data } = useNotifications();
  const { user } = useAuthStore();
  const unread = data?.unreadCount ?? 0;

  return (
    <View className="flex-row items-center gap-3 mr-4">
      <TouchableOpacity
        onPress={() => router.push('/settings')}
        className="relative"
      >
        {unread > 0 && (
          <View className="absolute -top-1 -right-1 bg-red-500 rounded-full w-4 h-4 items-center justify-center z-10">
            <Text className="text-[10px] text-white font-bold">{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
        <Ionicons name="notifications-outline" size={22} color="#475569" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/settings')}>
        <Avatar url={user?.avatarUrl} name={user?.displayName ?? ''} size={30} />
      </TouchableOpacity>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopColor: '#e2e8f0' },
        headerStyle: { backgroundColor: '#ffffff' },
        headerTitleStyle: { fontWeight: '600', color: '#1e293b' },
        headerShadowVisible: false,
        headerRight: () => <HeaderRight />,
        tabBarButton: ({ style, children, onPress, accessibilityRole, accessibilityState, testID }) => (
          <TouchableOpacity
            style={style}
            onPress={(e) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPress?.(e);
            }}
            accessibilityRole={accessibilityRole}
            accessibilityState={accessibilityState ?? undefined}
            testID={testID ?? undefined}
            activeOpacity={0.7}
          >
            {children}
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Drive',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="starred"
        options={{
          title: 'Starred',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="star-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shared"
        options={{
          title: 'Shared',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trash"
        options={{
          title: 'Trash',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trash-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
