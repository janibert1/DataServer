import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

/**
 * Registers this device for real APNs push and reports the token to
 * push-relay (https://push.jdries.nl), the shared backend for all of Jan's
 * sideloaded apps. Uses getDevicePushTokenAsync() (the raw native/APNs
 * token) rather than Expo's own push token/service -- this app isn't built
 * with EAS and there's no Expo push service account here, and push-relay
 * talks to Apple directly anyway.
 *
 * Registration alone doesn't guarantee delivery -- see
 * /home/jan/push-relay/README.md for what's still needed server-side
 * (a real APNs Auth Key) before a sent notification actually reaches a
 * device.
 */
const PUSH_RELAY_URL = 'https://push.jdries.nl/api/register';
const PUSH_RELAY_API_KEY = '3caedbc3b3a54c42d9c78f32d670f1c0113d3e71f5dafe03d930afaf6d903ae2';

export function usePushRegistration() {
  useEffect(() => {
    (async () => {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let status = existing;
        if (existing !== 'granted') {
          const { status: requested } = await Notifications.requestPermissionsAsync();
          status = requested;
        }
        if (status !== 'granted') return;

        const { data: token } = await Notifications.getDevicePushTokenAsync();
        const bundleId = Constants.expoConfig?.ios?.bundleIdentifier ?? 'com.dataserver.app';

        await fetch(PUSH_RELAY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PUSH_RELAY_API_KEY}`,
          },
          body: JSON.stringify({ bundle_id: bundleId, token }),
        });
      } catch (err) {
        console.warn('push-relay registration failed:', err);
      }
    })();
  }, []);
}
