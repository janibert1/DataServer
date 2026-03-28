import { TouchableOpacity, Text, ActivityIndicator, type TouchableOpacityProps } from 'react-native';
import * as Haptics from 'expo-haptics';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends TouchableOpacityProps {
  variant?: Variant;
  size?: Size;
  title: string;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<Variant, { container: string; text: string }> = {
  primary: {
    container: 'bg-brand-600 active:bg-brand-700',
    text: 'text-white font-semibold',
  },
  secondary: {
    container: 'bg-white border border-slate-300 active:bg-slate-50',
    text: 'text-slate-700 font-medium',
  },
  destructive: {
    container: 'bg-red-600 active:bg-red-700',
    text: 'text-white font-semibold',
  },
  ghost: {
    container: 'active:bg-slate-100',
    text: 'text-slate-600 font-medium',
  },
};

const sizeClasses: Record<Size, { container: string; text: string }> = {
  sm: { container: 'px-3 py-1.5 rounded-md', text: 'text-sm' },
  md: { container: 'px-4 py-2.5 rounded-lg', text: 'text-base' },
  lg: { container: 'px-6 py-3.5 rounded-xl', text: 'text-lg' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  title,
  loading,
  icon,
  disabled,
  onPress,
  className,
  ...props
}: ButtonProps) {
  const v = variantClasses[variant];
  const s = sizeClasses[size];

  return (
    <TouchableOpacity
      className={`flex-row items-center justify-center ${s.container} ${v.container} ${disabled || loading ? 'opacity-50' : ''} ${className ?? ''}`}
      disabled={disabled || loading}
      onPress={(e) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'secondary' || variant === 'ghost' ? '#475569' : '#fff'} className="mr-2" />
      ) : icon ? (
        <>{icon}</>
      ) : null}
      <Text className={`${s.text} ${v.text}`}>{title}</Text>
    </TouchableOpacity>
  );
}
