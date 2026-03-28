import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { useState } from 'react';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className={`mb-4 ${className ?? ''}`}>
      {label && (
        <Text className="text-sm font-medium text-slate-700 mb-1.5">{label}</Text>
      )}
      <TextInput
        className={`px-3.5 py-2.5 rounded-lg border text-base text-slate-800 bg-white ${
          error
            ? 'border-red-500'
            : focused
              ? 'border-brand-500'
              : 'border-slate-300'
        }`}
        placeholderTextColor="#94a3b8"
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
      {error && <Text className="text-sm text-red-500 mt-1">{error}</Text>}
      {hint && !error && <Text className="text-sm text-slate-400 mt-1">{hint}</Text>}
    </View>
  );
}
