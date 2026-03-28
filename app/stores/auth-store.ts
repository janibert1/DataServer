import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { User } from '@/lib/types';

const SERVER_URL_KEY = 'dataserver_server_url';

interface AuthState {
  user: User | null;
  serverUrl: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setServerUrl: (url: string | null) => Promise<void>;
  setLoading: (loading: boolean) => void;
  loadServerUrl: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  serverUrl: null,
  isLoading: true,

  setUser: (user) => set({ user }),

  setServerUrl: async (url) => {
    if (url) {
      await SecureStore.setItemAsync(SERVER_URL_KEY, url);
    } else {
      await SecureStore.deleteItemAsync(SERVER_URL_KEY);
    }
    set({ serverUrl: url });
  },

  setLoading: (isLoading) => set({ isLoading }),

  loadServerUrl: async () => {
    const url = await SecureStore.getItemAsync(SERVER_URL_KEY);
    set({ serverUrl: url });
  },

  logout: () => set({ user: null }),
}));
