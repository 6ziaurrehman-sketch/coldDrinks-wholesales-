import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { radius, spacing } from '@/theme/tokens';

export type BadgeTone = 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'info';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
};

export function Badge({ label, tone = 'primary' }: BadgeProps) {
  const theme = useTheme();
  const background = {
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
    neutral: theme.colors.surfaceMuted,
    info: theme.colors.info,
  }[tone];
  const color = tone === 'neutral' ? theme.colors.text : theme.colors.badgeText;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.badge, { backgroundColor: background }]}>
      <AppText variant="caption" color={color} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
});
