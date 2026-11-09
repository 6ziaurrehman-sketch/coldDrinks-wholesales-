import React from 'react';
import { ScrollView, View, StyleSheet, Pressable } from 'react-native';
import { tokens } from '@/theme/tokens';
import { useTheme } from '@/theme/themeContext';
import { AppText } from '@/components/ui/AppText';
import { Ionicons } from '@expo/vector-icons';
import { CatalogFilters } from '@/types/catalog.types';
import { t } from '@/i18n';

interface FilterChipsProps {
  filters: CatalogFilters;
  onRemoveFilter: (key: keyof CatalogFilters) => void;
  onClearAll: () => void;
}

export function FilterChips({ filters, onRemoveFilter, onClearAll }: FilterChipsProps) {
  const theme = useTheme();

  const activeFilters = Object.entries(filters).filter(([_, value]) => value !== null);

  if (activeFilters.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {activeFilters.map(([key, value]) => (
          <Pressable 
            key={key} 
            style={[styles.chip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={() => onRemoveFilter(key as keyof CatalogFilters)}
          >
            <AppText variant="caption">{String(value)}</AppText>
            <Ionicons name="close" size={16} color={theme.colors.textMuted} style={styles.icon} />
          </Pressable>
        ))}
        <Pressable onPress={onClearAll} style={styles.clearBtn}>
          <AppText variant="caption" color="primary">{t('catalog.clearFilters')}</AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: tokens.spacing.sm,
  },
  scroll: {
    paddingHorizontal: tokens.spacing.md,
    gap: tokens.spacing.sm,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xxs,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
  },
  icon: {
    marginStart: tokens.spacing.xxs,
  },
  clearBtn: {
    paddingHorizontal: tokens.spacing.sm,
  }
});
