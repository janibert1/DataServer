import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/axios';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        const permission = await Notification.requestPermission();
        if (permission !== 'granted' || cancelled) return;

        const { data } = await api.get<{ key: string }>('/push/vapid-public-key');
        if (cancelled) return;

        const existing = await reg.pushManager.getSubscription();
        const subscription = existing ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.key).buffer as ArrayBuffer,
        });

        if (cancelled) return;

        await api.post('/push/subscribe', {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
            auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
          },
        });
      } catch {
        // Silently ignore — push is optional
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);
}
