import { useState, useEffect } from 'react';
import { View, Dimensions, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { TopBar } from './topbar';
import { Sidebar } from './sidebar';

const SIDEBAR_WIDTH = Math.min(288, Dimensions.get('window').width * 0.85); // web: w-72 = 288px

// Matches frontend/src/components/layout/DriveLayout.tsx's mobile-width
// behavior exactly (the only behavior web ever shows at a phone viewport --
// its lg:flex permanent sidebar never applies there): TopBar with a
// hamburger that opens a slide-in Sidebar over a dark backdrop, same
// 200ms-out/150ms-in timing as web's Headless UI Transition.
export function DriveShell({
  children,
  search,
  onSearchChange,
}: {
  children: React.ReactNode;
  search?: string;
  onSearchChange?: (v: string) => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const translateX = useSharedValue(-SIDEBAR_WIDTH);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (sidebarOpen) {
      setMounted(true);
      translateX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else if (mounted) {
      translateX.value = withTiming(-SIDEBAR_WIDTH, { duration: 150, easing: Easing.in(Easing.cubic) });
      backdropOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
        // no runOnJS needed -- unmount is driven by sidebarOpen state, not this callback
      });
    }
  }, [sidebarOpen]);

  const sidebarStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <View className="flex-1 bg-slate-50">
      <TopBar onOpenSidebar={() => setSidebarOpen(true)} search={search} onSearchChange={onSearchChange} />
      <View className="flex-1">{children}</View>

      {mounted && (
        <View className="absolute inset-0" pointerEvents={sidebarOpen ? 'auto' : 'none'}>
          <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }, backdropStyle]}>
            <Pressable style={{ flex: 1 }} onPress={() => setSidebarOpen(false)} />
          </Animated.View>
          <Animated.View
            style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: SIDEBAR_WIDTH }, sidebarStyle]}
          >
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </Animated.View>
        </View>
      )}
    </View>
  );
}
