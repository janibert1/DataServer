import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
      // Any response (even 401) means the server is reachable
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
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1 bg-slate-50"
        contentContainerClassName="flex-1 justify-center px-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-10">
          <View className="w-20 h-20 bg-brand-600 rounded-2xl items-center justify-center mb-4">
            <Ionicons name="server-outline" size={40} color="white" />
          </View>
          <Text className="text-2xl font-bold text-slate-800">DataServer</Text>
          <Text className="text-base text-slate-500 mt-1">Connect to your server</Text>
        </View>

        <View className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <Input
            label="Server URL"
            placeholder="https://your-server.com"
            value={url}
            onChangeText={setUrl}
            error={error}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleConnect}
          />
          <Button title="Connect" onPress={handleConnect} loading={loading} className="mt-2" />
        </View>

        <Text className="text-xs text-slate-400 text-center mt-6">
          Enter the URL of your DataServer instance
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
