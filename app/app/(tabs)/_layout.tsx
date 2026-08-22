import { Stack } from 'expo-router';

// Was a bottom-tab navigator (My Drive / Starred / Shared / Trash). Replaced
// with a plain stack -- navigation chrome (hamburger + sidebar drawer with
// all 8 sections, search, notifications, user menu) now lives in
// components/layout/DriveShell.tsx, rendered by each screen individually,
// matching frontend/src/components/layout/DriveLayout.tsx's structure
// instead of a native tab bar (see auto-memory project_dataserver.md for why
// -- Jan asked for literal web parity here, not the idiomatic-mobile
// alternative).
export default function TabsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
