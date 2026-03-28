import { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth-store';
import { getMe } from '@/lib/api/auth';

interface GoogleAuthWebViewProps {
  visible: boolean;
  onClose: () => void;
}

export function GoogleAuthWebView({ visible, onClose }: GoogleAuthWebViewProps) {
  const { serverUrl } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);

  if (!serverUrl) return null;

  async function checkSession() {
    try {
      const data = await getMe();
      if (data.user) {
        useAuthStore.getState().setUser(data.user);
        onClose();
      }
    } catch {
      // No session yet
    }
  }

  function handleNavigationChange(navState: { url: string }) {
    const url = navState.url;
    // The backend redirects to frontendUrl/drive after successful OAuth.
    // When we detect this redirect, the session cookie has been set in the
    // shared cookie store (sharedCookiesEnabled), so our fetch calls can use it.
    if (url.includes('/drive') || url.includes('/login?error=')) {
      checkSession();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1e293b' }}>Sign in with Google</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color="#64748b" />
          </TouchableOpacity>
        </View>
        {loading && (
          <View style={{ position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        )}
        <WebView
          ref={webViewRef}
          source={{ uri: `${serverUrl}/api/auth/google` }}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          onNavigationStateChange={handleNavigationChange}
          onLoadEnd={() => setLoading(false)}
          onLoadStart={() => setLoading(true)}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          style={{ flex: 1 }}
        />
      </SafeAreaView>
    </Modal>
  );
}
