import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUIStore, type SortField, type ViewMode } from '@/stores/ui-store';

const sortOptions: Array<{ field: SortField; label: string }> = [
  { field: 'name', label: 'Name' },
  { field: 'updatedAt', label: 'Modified' },
  { field: 'createdAt', label: 'Created' },
  { field: 'size', label: 'Size' },
];

export function SortControls() {
  const { viewMode, setViewMode, sortField, setSortField, sortDirection, toggleSortDirection } =
    useUIStore();

  return (
    <View className="flex-row items-center justify-between px-4 py-2 bg-white border-b border-slate-100">
      <View className="flex-row items-center gap-2">
        {sortOptions.map((opt) => (
          <TouchableOpacity
            key={opt.field}
            onPress={() => {
              if (sortField === opt.field) {
                toggleSortDirection();
              } else {
                setSortField(opt.field);
              }
            }}
            className={`px-2.5 py-1 rounded-md ${sortField === opt.field ? 'bg-brand-50' : ''}`}
          >
            <View className="flex-row items-center gap-0.5">
              <Text
                className={`text-xs font-medium ${sortField === opt.field ? 'text-brand-600' : 'text-slate-500'}`}
              >
                {opt.label}
              </Text>
              {sortField === opt.field && (
                <Ionicons
                  name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'}
                  size={12}
                  color="#2563eb"
                />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View className="flex-row gap-1">
        <TouchableOpacity
          onPress={() => setViewMode('grid')}
          className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-brand-50' : ''}`}
        >
          <Ionicons name="grid-outline" size={18} color={viewMode === 'grid' ? '#2563eb' : '#94a3b8'} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode('list')}
          className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-brand-50' : ''}`}
        >
          <Ionicons name="list-outline" size={18} color={viewMode === 'list' ? '#2563eb' : '#94a3b8'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
