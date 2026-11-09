import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { radius, spacing } from '@/theme/tokens';

export type CardProps = ViewProps & {
  onPress?: () => void;
};

export function Card({ style, onPress, children, ...rest }: CardProps) {
  const theme = useTheme();

  const cardStyle = [
    styles.card,
    theme.elevation.md,
    {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={cardStyle}
        {...rest}>
        {children}
      </Pressable>
    );
  }

  return (
    <View style={cardStyle} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    width: '100%',
    minWidth: 0,
  },
});
