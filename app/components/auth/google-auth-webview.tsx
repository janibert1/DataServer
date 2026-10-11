import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewNavigation, WebViewErrorEvent } from 'react-native-webview/lib/WebViewTypes';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth-store';
import { getMe } from '@/lib/api/auth';
import Toast from 'react-native-toast-message';

interface GoogleAuthWebViewProps {
  visible: boolean;
  onClose: () => void;
}

// A WebView-based OAuth flow's session cookie never reliably reaches React
// Native's own fetch() on this stack -- confirmed live via the nginx access
// log: every native-side (`Expo/...` user-agent) request to /api/auth/me
// came back 401 while the WebView's *own* requests (same page, same cookie
// jar from its perspective) succeeded with 200, over and over, no amount of
// retrying fixed it. sharedCookiesEnabled/thirdPartyCookiesEnabled just
// don't bridge a WebView-set cookie into RN's networking stack here.
//
// Fixed properly instead of worked around: the backend's /google callback
// hands back a real Bearer API token via a `dataserver://auth-callback`
// deep link when the flow started with ?mobile=1 (see routes/auth.ts),
// reusing the exact same token mechanism the desktop backup client already
// uses.
//
// Catching that redirect turned out to need three independent listeners,
// not just one -- confirmed live that onShouldStartLoadWithRequest alone
// never fired at all for this specific case (nginx's access log showed the
// backend correctly issued the dataserver:// redirect, and then nothing --
// no further request, no error, the WebView just sat there "loading"
// forever with our own spinner stuck on top since onLoadEnd never came
// either). WKWebView's handling of a genuinely unsupported URL scheme
// arriving via a server-side 302 (as opposed to a same-page link click)
// appears not to reliably reach the JS bridge through that one prop on
// this iOS build. onNavigationStateChange and onError are added as
// independent, redundant detection paths for the exact same URL --
// whichever one actually fires first wins, `handled` guards against
// processing it twice.
export function GoogleAuthWebView({ visible, onClose }: GoogleAuthWebViewProps) {
  const { serverUrl } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const handled = useRef(false);

  // RN's <Modal> keeps its children mounted the whole time -- toggling
  // `visible` only shows/hides the native modal surface, it does NOT
  // remount the WebView. Bumping a key on every open forces a real
  // remount --> a genuinely fresh request each time, not whatever state
  // (page, error, cache) the last attempt left behind.
  const [openKey, setOpenKey] = useState(0);
  useEffect(() => {
    if (visible) {
      setOpenKey((k) => k + 1);
      handled.current = false;
    }
  }, [visible]);

  if (!serverUrl) return null;

  async function handleAuthCallback(url: string) {
    if (handled.current) return;
    handled.current = true;
    setLoading(false);

    // Plain string parsing rather than `new URL()` -- this app has no
    // react-native-url-polyfill dependency and nothing else here relies on
    // the global URL/URLSearchParams being present, not worth the risk of
    // finding out on a real device that this particular Hermes build
    // doesn't have it.
    const queryString = url.split('?')[1] ?? '';
    const params = new Map(
      queryString.split('&').filter(Boolean).map((pair) => {
        const [key, value = ''] = pair.split('=');
        return [decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, ' '))];
      }),
    );
    const token = params.get('token') ?? null;
    const error = params.get('error') ?? null;

    if (error) {
      Toast.show({
        type: 'error',
        text1: 'Google sign-in failed',
        text2: error === 'needs_registration' ? 'This Google account has no DataServer account yet.' : undefined,
      });
      onClose();
      return;
    }

    if (token) {
      await useAuthStore.getState().setApiToken(token);
      try {
        const data = await getMe();
        useAuthStore.getState().setUser(data.user);
      } catch {
        // Token came straight from a just-created ApiToken row -- a getMe()
        // failure right after this would mean something else is wrong
        // (server unreachable, etc.), not a bad token. Leave apiToken set;
        // AuthGate's own auth-init query will retry.
      }
      onClose();
    } else {
      // Neither token nor error param -- shouldn't happen given the
      // backend always sends one or the other, but don't leave the user
      // stuck on a dead WebView if it somehow does.
      Toast.show({ type: 'error', text1: 'Google sign-in failed', text2: 'Unexpected response from server.' });
      onClose();
    }
  }

  function isAuthCallbackUrl(url: string | undefined | null) {
    return !!url && url.startsWith('dataserver://auth-callback');
  }

  function handleShouldStartLoad(request: ShouldStartLoadRequest) {
    if (isAuthCallbackUrl(request.url)) {
      handleAuthCallback(request.url);
      return false; // don't let the WebView try to navigate a custom scheme
    }
    return true;
  }

  function handleNavigationChange(navState: WebViewNavigation) {
    if (isAuthCallbackUrl(navState.url)) handleAuthCallback(navState.url);
  }

  function handleError(e: WebViewErrorEvent) {
    // WKWebView reports failing to load an unsupported URL scheme as a
    // load error, with the attempted URL still present on the event --
    // this is the fallback net for exactly the case that motivated all
    // three listeners (see the block comment above).
    const failedUrl = (e.nativeEvent as any)?.url as string | undefined;
    if (isAuthCallbackUrl(failedUrl)) {
      handleAuthCallback(failedUrl!);
    } else {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1e293b' }}>Sign in with Google</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color="#64748b" />
          </TouchableOpacity>
        </View>
        {loading && (
          <View style={{ position: 'absolute', top: 100, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        )}
        <WebView
          key={openKey}
          ref={webViewRef}
          source={{ uri: `${serverUrl}/api/auth/google?mobile=1` }}
          // WKWebView's HTTP cache is process-wide, not per-instance -- the
          // openKey remount above forces a fresh WebView, but without this
          // it still shares NSURLCache with a failed prior attempt and can
          // silently serve a stale cached page instead of re-requesting.
          cacheEnabled={false}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onNavigationStateChange={handleNavigationChange}
          onError={handleError}
          onLoadEnd={() => setLoading(false)}
          onLoadStart={() => setLoading(true)}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          style={{ flex: 1 }}
        />
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
