import { View, Text } from 'react-native';
import { Image } from 'expo-image';

interface AvatarProps {
  url?: string | null;
  name: string;
  size?: number;
}

export function Avatar({ url, name, size = 40 }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      className="bg-brand-600 items-center justify-center"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text className="text-white font-semibold" style={{ fontSize: size * 0.4 }}>
        {initials}
      </Text>
    </View>
  );
}
