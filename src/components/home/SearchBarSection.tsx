import React, { memo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/useTheme';
import { t } from '@/i18n';
import { spacing, radius, elevation } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';

import { NotificationBellBadge } from '@/components/notifications/NotificationBellBadge';

export const SearchBarSection = memo(function SearchBarSection() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.row}>
        <Pressable 
          style={[styles.searchBar, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
          onPress={() => router.push('/catalog/search')}
          accessibilityRole="search"
          accessibilityLabel={t('home.searchPlaceholder')}
        >
          <Ionicons name="search" size={20} color={theme.colors.textMuted} style={styles.icon} />
          <AppText muted>{t('home.searchPlaceholder')}</AppText>
        </Pressable>
        <NotificationBellBadge />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    ...elevation.sm,
    zIndex: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: {
    marginEnd: spacing.sm,
  }
});
