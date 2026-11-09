import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { layout } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: {
      bg: theme.colors.primary,
      fg: theme.colors.onPrimary,
      border: theme.colors.primary,
    },
    secondary: {
      bg: theme.colors.secondary,
      fg: theme.colors.onSecondary,
      border: theme.colors.secondary,
    },
    destructive: {
      bg: theme.colors.destructive,
      fg: theme.colors.onDestructive,
      border: theme.colors.destructive,
    },
    ghost: {
      bg: theme.colors.ghost,
      fg: theme.colors.primary,
      border: theme.colors.border,
    },
  };

  const colors = palette[variant];

  return (
    <Pressable
      accessibilityRole={'button' as AccessibilityRole}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <AppText variant="button" color={colors.fg} style={styles.label}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.minTap,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    width: '100%',
  } satisfies ViewStyle,
  label: {
    textAlign: 'center',
  },
});
