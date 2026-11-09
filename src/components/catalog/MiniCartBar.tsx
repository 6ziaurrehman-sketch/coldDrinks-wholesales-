import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useCartStore } from '@/store/cartStore';
import { useTheme } from '@/theme/themeContext';
import { tokens } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { formatMoney } from '@/utils/formatMoney';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';

export function MiniCartBar() {
  const router = useRouter();
  const theme = useTheme();
  // We assume totalAmount might not be there yet, but we requested it or we default to 0
  const { itemCount } = useCartStore();
  const totalAmount = (useCartStore.getState() as any).totalAmount || 0;

  if (itemCount === 0) return null;

  return (
    <View style={styles.wrapper}>
      <Pressable 
        style={[styles.container, { backgroundColor: theme.colors.primary }]}
        onPress={() => router.push('/(app)/(tabs)/cart')}
        accessibilityRole="button"
        accessibilityLabel={t('catalog.viewCart')}
      >
        <View style={styles.side}>
          <Ionicons name="cart" size={24} color={theme.colors.onPrimary} />
          <AppText color="onPrimary" variant="subtitle" style={styles.text}>
            {itemCount} {itemCount === 1 ? t('catalog.item') : t('catalog.items')}
          </AppText>
        </View>
        <View style={styles.side}>
          <AppText color="onPrimary" variant="subtitle">{formatMoney(totalAmount)}</AppText>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.onPrimary} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: tokens.spacing.md,
    start: tokens.spacing.md,
    end: tokens.spacing.md,
  },
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  text: {
    marginStart: tokens.spacing.xs,
  }
});
