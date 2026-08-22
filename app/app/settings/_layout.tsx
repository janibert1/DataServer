import { Stack } from 'expo-router';

// Settings/Security are nested inside DriveLayout on web (same TopBar +
// Sidebar chrome as the rest of the drive) -- matches that by wrapping each
// screen's own content in DriveShell instead of a native Stack header, same
// pattern as the (tabs) group.
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
