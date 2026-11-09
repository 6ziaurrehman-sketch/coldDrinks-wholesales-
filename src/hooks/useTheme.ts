import { useColorScheme } from 'react-native';

import {
  colors,
  elevation,
  layout,
  radius,
  spacing,
  typography,
  type ColorSchemeName,
  type ThemeTokens,
} from '@/theme/tokens';

export function useTheme(): ThemeTokens {
  const scheme = useColorScheme();
  const resolved: ColorSchemeName = scheme === 'dark' ? 'dark' : 'light';

  return {
    colors: colors[resolved],
    spacing,
    radius,
    elevation,
    typography,
    layout,
    scheme: resolved,
  };
}
