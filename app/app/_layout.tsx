import { useEffect, useState } from 'react';
import { ActivityIndicator, LogBox, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import 'react-native-reanimated';
import '../global.css';

// Suppress known NativeWind v4 warning where its FlatList interop triggers a
// spurious "unique key" React warning. The keys are present — NativeWind's
// internal ScrollView wrapper surfaces the false positive.
LogBox.ignoreLogs(['Each child in a list should have a unique "key" prop']);

import { useAuthStore } from '@/stores/auth-store';
import { useAuthInit } from '@/lib/hooks/use-auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
  },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { serverUrl, user, isLoading, loadServerUrl, setLoading } = useAuthStore();
  const [urlLoaded, setUrlLoaded] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useAuthInit();

  useEffect(() => {
    loadServerUrl().then(() => setUrlLoaded(true));
  }, []);

  // When there's no serverUrl, the auth query is disabled and will never run,
  // so we need to manually stop loading to allow navigation to proceed.
  useEffect(() => {
    if (urlLoaded && !serverUrl && isLoading) {
      setLoading(false);
    }
  }, [urlLoaded, serverUrl, isLoading]);

  useEffect(() => {
    if (!urlLoaded || isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!serverUrl) {
      if (!inAuthGroup) router.replace('/(auth)/server-url');
    } else if (!user) {
      if (!inAuthGroup) router.replace('/(auth)/login');
    } else {
      if (inAuthGroup) router.replace('/(tabs)');
    }
  }, [urlLoaded, isLoading, serverUrl, user, segments]);

  if (!urlLoaded || (serverUrl && isLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="folder/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="file-preview" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack>
      </AuthGate>
      <StatusBar style="dark" />
      <Toast />
    </QueryClientProvider>
  );
}
