import { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, AlertCircle } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';

// No web equivalent (the web app is always served from one fixed domain) --
// styled to match the rest of the auth flow (login/register/forgot-password,
// all ported from the real web designs) for internal consistency instead.
const gradientColors: [string, string, string] = ['#172554', '#1e3a8a', '#1e40af'];
const cardShadow = { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 };

export default function ServerUrlScreen() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setServerUrl } = useAuthStore();
  const router = useRouter();

  async function handleConnect() {
    let cleanUrl = url.trim().replace(/\/+$/, '');
    if (!cleanUrl) {
      setError('Please enter a server URL');
      return;
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${cleanUrl}/api/auth/me`, {
        method: 'GET',
        credentials: 'include',
      });
      if (res.status === 401 || res.ok) {
        await setServerUrl(cleanUrl);
        router.replace('/(auth)/login');
      } else {
        setError(`Server responded with status ${res.status}`);
      }
    } catch (e) {
      setError('Could not connect to server. Check the URL and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView className="flex-1" contentContainerClassName="flex-1 justify-center px-4" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-md self-center">
            <View className="items-center mb-8">
              <View className="w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-4">
                <Zap size={28} color="white" fill="white" />
              </View>
              <Text className="text-2xl font-bold text-white">DataServer</Text>
              <Text className="text-sm text-brand-300 mt-1">Connect to your server</Text>
            </View>

            <View className="bg-white rounded-2xl p-8" style={cardShadow}>
              {error ? (
                <View className="flex-row items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <AlertCircle size={16} color="#b91c1c" />
                  <Text className="text-sm text-red-700 flex-1">{error}</Text>
                </View>
              ) : null}

              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 mb-1.5">Server URL</Text>
                <TextInput
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-900"
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://your-server.com"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={handleConnect}
                />
              </View>

              <TouchableOpacity
                onPress={handleConnect}
                disabled={loading}
                className={`w-full py-2.5 bg-brand-600 rounded-lg items-center ${loading ? 'opacity-60' : ''}`}
              >
                <Text className="text-white text-sm font-semibold">{loading ? 'Connecting…' : 'Connect'}</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-brand-300/70 text-center mt-6">
              Enter the URL of your DataServer instance
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
