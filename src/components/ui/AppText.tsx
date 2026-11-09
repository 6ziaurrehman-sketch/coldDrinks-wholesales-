import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/theme/tokens';

type Variant = keyof typeof typography;

export type AppTextProps = TextProps & {
  variant?: Variant;
  color?: string;
  muted?: boolean;
  numberOfLines?: number;
};

export function AppText({
  variant = 'body',
  color,
  muted,
  style,
  maxFontSizeMultiplier,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  const resolved: TextStyle = {
    ...typography[variant],
    color: color ?? (muted ? theme.colors.textMuted : theme.colors.text),
    textAlign: 'auto',
    flexShrink: 1,
  };

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? theme.layout.maxFontSizeMultiplier}
      style={[resolved, style]}
      {...rest}
    />
  );
}
