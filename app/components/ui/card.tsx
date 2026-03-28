import { View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  padded?: boolean;
}

export function Card({ padded = true, className, children, ...props }: CardProps) {
  return (
    <View
      className={`bg-white rounded-xl shadow-sm border border-slate-100 ${padded ? 'p-4' : ''} ${className ?? ''}`}
      {...props}
    >
      {children}
    </View>
  );
}
