import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has NO web implementation at all (calling any of its
// methods there throws "getValueWithKeyAsync is not a function", not a
// graceful no-op) -- its own docs say web usage must be platform-guarded
// with a fallback. localStorage isn't as safe as the OS keychain, but it's
// the standard fallback and this data (server URL / session token) isn't
// meaningfully more sensitive there than any other web app's local session.
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore (private browsing / storage disabled)
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
