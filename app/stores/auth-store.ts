import { create } from 'zustand';
import * as SecureStorage from '@/lib/secure-storage';
import type { User } from '@/lib/types';

const SERVER_URL_KEY = 'dataserver_server_url';
const API_TOKEN_KEY = 'dataserver_api_token';

interface AuthState {
  user: User | null;
  serverUrl: string | null;
  // Set only for a Google-signed-in mobile session -- see
  // components/auth/google-auth-webview.tsx for why this exists at all:
  // the session cookie a WebView-based OAuth flow sets never reliably
  // reaches React Native's own fetch() on this stack (confirmed live --
  // every native request 401'd while the WebView's own requests, same
  // cookie jar from its perspective, succeeded), so Google sign-in hands
  // back a real Bearer token instead and this is where it lives. Plain
  // email/password login never needs this -- that POST happens through
  // RN's own fetch() to begin with, so its Set-Cookie response is received
  // and reused by the exact same fetch stack with no cross-context gap.
  apiToken: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setServerUrl: (url: string | null) => Promise<void>;
  setApiToken: (token: string | null) => Promise<void>;
  setLoading: (loading: boolean) => void;
  loadServerUrl: () => Promise<void>;
  loadApiToken: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  serverUrl: null,
  apiToken: null,
  isLoading: true,

  setUser: (user) => set({ user }),

  setServerUrl: async (url) => {
    if (url) {
      await SecureStorage.setItem(SERVER_URL_KEY, url);
    } else {
      await SecureStorage.deleteItem(SERVER_URL_KEY);
    }
    set({ serverUrl: url });
  },

  setApiToken: async (token) => {
    if (token) {
      await SecureStorage.setItem(API_TOKEN_KEY, token);
    } else {
      await SecureStorage.deleteItem(API_TOKEN_KEY);
    }
    set({ apiToken: token });
  },

  setLoading: (isLoading) => set({ isLoading }),

  loadServerUrl: async () => {
    const url = await SecureStorage.getItem(SERVER_URL_KEY);
    set({ serverUrl: url });
  },

  loadApiToken: async () => {
    const token = await SecureStorage.getItem(API_TOKEN_KEY);
    set({ apiToken: token });
  },

  logout: () => {
    SecureStorage.deleteItem(API_TOKEN_KEY).catch(() => {});
    set({ user: null, apiToken: null });
  },
}));
