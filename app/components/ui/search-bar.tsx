import { View, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search files...', debounceMs = 300 }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => onChangeText(localValue), debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs]);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <View className="flex-row items-center bg-slate-100 rounded-lg px-3 py-2 gap-2">
      <Ionicons name="search" size={18} color="#94a3b8" />
      <TextInput
        className="flex-1 text-base text-slate-800"
        value={localValue}
        onChangeText={setLocalValue}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        returnKeyType="search"
        autoCorrect={false}
      />
    </View>
  );
}
