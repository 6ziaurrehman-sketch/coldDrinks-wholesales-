import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import type { OrderHistoryFilters } from '@/types/orderHistory.types';
import type { OrderStatus } from '@/types/orders.types';

interface OrderHistoryFilterBarProps {
  filters: OrderHistoryFilters;
  onApplyFilters: (filters: Partial<OrderHistoryFilters>) => void;
  onClearFilters: () => void;
}

const STATUS_CHIPS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'cancelled', label: 'Cancelled' },
];

type DateRangePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

export function OrderHistoryFilterBar({
  filters,
  onApplyFilters,
  onClearFilters,
}: OrderHistoryFilterBarProps) {
  const theme = useTheme();
  const [activePreset, setActivePreset] = useState<DateRangePreset>('all');
  const [customFrom, setCustomFrom] = useState(filters.dateRange.from || '');
  const [customTo, setCustomTo] = useState(filters.dateRange.to || '');
  const [dateError, setDateError] = useState<string | null>(null);

  const handleSearchChange = (text: string) => {
    onApplyFilters({ query: text });
  };

  const handleStatusSelect = (statusKey: OrderStatus | 'all') => {
    if (statusKey === 'all') {
      onApplyFilters({ status: [] });
    } else {
      // Toggle status
      const exists = filters.status.includes(statusKey);
      const nextStatus = exists
        ? filters.status.filter((s) => s !== statusKey)
        : [...filters.status, statusKey];
      onApplyFilters({ status: nextStatus });
    }
  };

  const handlePresetSelect = (preset: DateRangePreset) => {
    setActivePreset(preset);
    setDateError(null);

    const now = new Date();
    if (preset === 'all') {
      onApplyFilters({ dateRange: { from: null, to: null } });
    } else if (preset === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      onApplyFilters({ dateRange: { from: startOfDay, to: now.toISOString() } });
    } else if (preset === 'week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      onApplyFilters({ dateRange: { from: oneWeekAgo, to: now.toISOString() } });
    } else if (preset === 'month') {
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      onApplyFilters({ dateRange: { from: oneMonthAgo, to: now.toISOString() } });
    }
  };

  const handleCustomDateApply = () => {
    if (!customFrom || !customTo) return;
    const fromTime = new Date(customFrom).getTime();
    const toTime = new Date(customTo).getTime();

    // Edge case: End date before start date
    if (toTime < fromTime) {
      setDateError(t('orderHistory.invalidDateRange'));
      return;
    }

    setDateError(null);
    onApplyFilters({
      dateRange: {
        from: new Date(customFrom).toISOString(),
        to: new Date(customTo).toISOString(),
      },
    });
  };

  const hasActiveFilters =
    Boolean(filters.query) ||
    filters.status.length > 0 ||
    Boolean(filters.dateRange.from) ||
    Boolean(filters.dateRange.to);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
      {/* Search Input Row */}
      <View style={styles.searchRow}>
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
              color: theme.colors.text,
            },
          ]}
          placeholder={t('orderHistory.searchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          value={filters.query}
          onChangeText={handleSearchChange}
        />
        {hasActiveFilters && (
          <Pressable onPress={onClearFilters} style={styles.clearBtn}>
            <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '600' }}>
              {t('orderHistory.clearFilters')}
            </AppText>
          </Pressable>
        )}
      </View>

      {/* Status Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {STATUS_CHIPS.map((chip) => {
          const isSelected =
            chip.key === 'all'
              ? filters.status.length === 0
              : filters.status.includes(chip.key);

          return (
            <Pressable
              key={chip.key}
              onPress={() => handleStatusSelect(chip.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceMuted,
                  borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <AppText
                variant="caption"
                color={isSelected ? '#ffffff' : theme.colors.text}
                style={{ fontWeight: isSelected ? '700' : '500' }}
              >
                {chip.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Date Range Presets */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.datePresetsScroll}
      >
        <AppText variant="caption" color={theme.colors.textMuted} style={styles.dateLabel}>
          Date:
        </AppText>
        {(['all', 'today', 'week', 'month', 'custom'] as DateRangePreset[]).map((preset) => {
          const isSelected = activePreset === preset;
          return (
            <Pressable
              key={preset}
              onPress={() => handlePresetSelect(preset)}
              style={[
                styles.presetChip,
                isSelected && { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.primary },
              ]}
            >
              <AppText
                variant="caption"
                color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                style={{ fontWeight: isSelected ? '700' : '500' }}
              >
                {t(`orderHistory.date${preset.charAt(0).toUpperCase() + preset.slice(1)}`) || preset}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Custom Date Range Inputs (when preset === 'custom') */}
      {activePreset === 'custom' && (
        <View style={styles.customDateContainer}>
          <View style={styles.dateInputsRow}>
            <TextInput
              style={[styles.dateInput, { borderColor: theme.colors.border, color: theme.colors.text }]}
              placeholder={t('orderHistory.fromDate')}
              placeholderTextColor={theme.colors.textMuted}
              value={customFrom}
              onChangeText={setCustomFrom}
            />
            <AppText variant="caption" color={theme.colors.textMuted}>
              →
            </AppText>
            <TextInput
              style={[styles.dateInput, { borderColor: theme.colors.border, color: theme.colors.text }]}
              placeholder={t('orderHistory.toDate')}
              placeholderTextColor={theme.colors.textMuted}
              value={customTo}
              onChangeText={setCustomTo}
            />
            <Pressable
              onPress={handleCustomDateApply}
              style={[styles.applyDateBtn, { backgroundColor: theme.colors.primary }]}
            >
              <AppText variant="caption" color="#ffffff" style={{ fontWeight: '600' }}>
                Apply
              </AppText>
            </Pressable>
          </View>

          {dateError && (
            <AppText variant="caption" color={theme.colors.error} style={{ marginTop: 4 }}>
              ⚠️ {dateError}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  datePresetsScroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    alignItems: 'center',
    gap: 6,
  },
  dateLabel: {
    marginEnd: 4,
    fontWeight: '600',
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  customDateContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  dateInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 12,
  },
  applyDateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
});
