import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { SkeletonBlock } from '@/components/ui/SkeletonBlock';
import { formatMoney } from '@/utils/formatMoney';
import { useTheme } from '@/theme/useTheme';
import { t } from '@/i18n';

interface PriceDisplayProps {
  shopPrice: number | null;
  normalPrice: number | null;
  size?: 'compact' | 'regular' | 'large';
  loading?: boolean;
  showLabel?: boolean;
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  shopPrice,
  normalPrice,
  size = 'regular',
  loading = false,
  showLabel = true,
}) => {
  const { colors, spacing } = useTheme();

  if (loading) {
    return <SkeletonBlock width={100} height={24} />;
  }

  if (shopPrice === null) {
    return (
      <AppText variant="body" color={colors.textMuted}>
        {t('price_unavailable')}
      </AppText>
    );
  }

  const hasDiscount = normalPrice !== null && shopPrice < normalPrice;
  const priceVariant = size === 'large' ? 'title' : size === 'compact' ? 'body' : 'subtitle';
  
  return (
    <View style={styles.container} accessible accessibilityLabel={
      hasDiscount 
        ? t('accessible_price_discount', { price: formatMoney(shopPrice), normal: formatMoney(normalPrice!) })
        : t('accessible_price', { price: formatMoney(shopPrice) })
    }>
      {showLabel && (
        <AppText variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xxs }}>
          {t('your_price')}
        </AppText>
      )}
      <View style={styles.priceRow}>
        <AppText variant={priceVariant} color={colors.text}>
          {formatMoney(shopPrice)}
        </AppText>
        {hasDiscount && (
          <AppText 
            variant="caption" 
            color={colors.textMuted} 
            style={[styles.strikethrough, { marginStart: spacing.xs }]}
          >
            {formatMoney(normalPrice!)}
          </AppText>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
});
