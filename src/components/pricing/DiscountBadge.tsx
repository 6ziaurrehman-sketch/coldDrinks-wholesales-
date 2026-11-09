import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/useTheme';

interface DiscountBadgeProps {
  text: string;
  tone?: 'savings' | 'percentage';
}

export const DiscountBadge: React.FC<DiscountBadgeProps> = ({ text, tone = 'savings' }) => {
  const { colors, spacing, radius } = useTheme();

  const backgroundColor = tone === 'savings' ? colors.success : colors.primary;
  const textColor = colors.badgeText;

  return (
    <View style={[styles.container, { backgroundColor, borderRadius: radius.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs }]}>
      <AppText variant="caption" style={{ color: textColor, fontWeight: 'bold' }}>
        {text}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
});
