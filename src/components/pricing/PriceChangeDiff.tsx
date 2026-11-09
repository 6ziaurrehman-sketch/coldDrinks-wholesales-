import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { formatMoney } from '@/utils/formatMoney';

interface PriceChangeDiffProps {
  oldPrice: number;
  newPrice: number;
}

export const PriceChangeDiff: React.FC<PriceChangeDiffProps> = ({ oldPrice, newPrice }) => {
  const { colors, spacing } = useTheme();

  const isIncrease = newPrice > oldPrice;
  const color = isIncrease ? colors.error : colors.success;
  const iconName = isIncrease ? 'arrow-up' : 'arrow-down';

  return (
    <View style={styles.container}>
      <AppText variant="body" color={colors.textMuted} style={styles.strikethrough}>
        {formatMoney(oldPrice)}
      </AppText>
      <Ionicons name="arrow-forward" size={14} color={colors.textMuted} style={{ marginHorizontal: spacing.xs }} />
      <AppText variant="body" style={{ color, fontWeight: 'bold' }}>
        {formatMoney(newPrice)}
      </AppText>
      <Ionicons name={iconName} size={14} color={color} style={{ marginStart: spacing.xxs }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
});
