import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useCatalogStore } from '@/store/catalogStore';
import { useTheme } from '@/theme/themeContext';
import { tokens } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { CatalogSort, AvailabilityStatus } from '@/types/catalog.types';

const SORT_OPTIONS: { label: string; value: CatalogSort }[] = [
  { label: 'catalog.sort_popularity', value: 'popularity' },
  { label: 'catalog.sort_name', value: 'name' },
  { label: 'catalog.sort_price', value: 'price' },
];

const AVAILABILITY_OPTIONS: { label: string; value: AvailabilityStatus }[] = [
  { label: 'catalog.availability_in_stock', value: 'in_stock' },
  { label: 'catalog.availability_low_stock', value: 'low_stock' },
  { label: 'catalog.availability_out_of_stock', value: 'out_of_stock' },
];

export default function FiltersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { filters, sort, applyFilters } = useCatalogStore();
  
  const [localFilters, setLocalFilters] = useState(filters);
  const [localSort, setLocalSort] = useState<CatalogSort>(sort);

  const handleApply = () => {
    applyFilters(localFilters, localSort);
    router.back();
  };

  const handleReset = () => {
    setLocalFilters({ brandId: null, categoryId: null, availability: null });
    setLocalSort('popularity');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppText variant="title">{t('catalog.filters')}</AppText>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </Pressable>
      </View>
      
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <AppText variant="subtitle" style={styles.sectionTitle}>{t('catalog.sortBy')}</AppText>
          {SORT_OPTIONS.map(opt => (
            <Pressable 
              key={opt.value} 
              style={styles.radioRow}
              onPress={() => setLocalSort(opt.value)}
            >
              <Ionicons 
                name={localSort === opt.value ? "radio-button-on" : "radio-button-off"} 
                size={24} 
                color={localSort === opt.value ? theme.colors.primary : theme.colors.textMuted} 
              />
              <AppText style={styles.radioText}>{t(opt.label)}</AppText>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <AppText variant="subtitle" style={styles.sectionTitle}>{t('catalog.availability')}</AppText>
          {AVAILABILITY_OPTIONS.map(opt => (
            <Pressable 
              key={opt.value} 
              style={styles.radioRow}
              onPress={() => setLocalFilters(prev => ({ 
                ...prev, 
                availability: prev.availability === opt.value ? null : opt.value 
              }))}
            >
              <Ionicons 
                name={localFilters.availability === opt.value ? "checkbox" : "square-outline"} 
                size={24} 
                color={localFilters.availability === opt.value ? theme.colors.primary : theme.colors.textMuted} 
              />
              <AppText style={styles.radioText}>{t(opt.label)}</AppText>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <View style={styles.footerBtn}>
          <Button variant="ghost" label={t('catalog.reset')} onPress={handleReset} />
        </View>
        <View style={styles.footerBtn}>
          <Button variant="primary" label={t('catalog.apply')} onPress={handleApply} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacing.md,
    borderBottomWidth: 1,
  },
  content: { flex: 1 },
  section: {
    padding: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: { marginBottom: tokens.spacing.sm },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  radioText: { marginStart: tokens.spacing.sm },
  footer: {
    flexDirection: 'row',
    padding: tokens.spacing.md,
    borderTopWidth: 1,
    gap: tokens.spacing.md,
  },
  footerBtn: { flex: 1 }
});
