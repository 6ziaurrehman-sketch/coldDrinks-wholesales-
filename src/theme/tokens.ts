export const palette = {
  ice: '#E8F6FB',
  sky: '#0B6E99',
  skyDark: '#084E6D',
  mint: '#1A9B7A',
  cola: '#C62828',
  amber: '#E6A817',
  ink: '#12202A',
  slate: '#5B6B75',
  fog: '#F4F7F9',
  white: '#FFFFFF',
  line: '#D5DEE4',
  night: '#0C151C',
  nightCard: '#16222B',
  nightLine: '#2A3B46',
  nightText: '#E8EEF2',
  nightMuted: '#9AADB8',
} as const;

export const colors = {
  light: {
    background: palette.fog,
    surface: palette.white,
    surfaceMuted: palette.ice,
    text: palette.ink,
    textMuted: palette.slate,
    border: palette.line,
    primary: palette.sky,
    primaryPressed: palette.skyDark,
    onPrimary: palette.white,
    secondary: palette.mint,
    onSecondary: palette.white,
    destructive: palette.cola,
    onDestructive: palette.white,
    ghost: 'transparent',
    success: palette.mint,
    warning: palette.amber,
    error: palette.cola,
    info: palette.sky,
    overlay: 'rgba(18, 32, 42, 0.45)',
    skeleton: '#E2E8ED',
    badgeText: palette.white,
  },
  dark: {
    background: palette.night,
    surface: palette.nightCard,
    surfaceMuted: '#1C2C36',
    text: palette.nightText,
    textMuted: palette.nightMuted,
    border: palette.nightLine,
    primary: '#4DB3D6',
    primaryPressed: '#2A8FB3',
    onPrimary: palette.night,
    secondary: '#3EC9A4',
    onSecondary: palette.night,
    destructive: '#F07171',
    onDestructive: palette.night,
    ghost: 'transparent',
    success: '#3EC9A4',
    warning: '#F0C14A',
    error: '#F07171',
    info: '#4DB3D6',
    overlay: 'rgba(0, 0, 0, 0.55)',
    skeleton: '#24333D',
    badgeText: palette.night,
  },
} as const;

export type ColorSchemeName = keyof typeof colors;
export type ThemeColors = (typeof colors)[ColorSchemeName];

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#12202A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#12202A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#12202A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },
  subtitle: { fontSize: 18, lineHeight: 26, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  button: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
} as const;

export const layout = {
  minTap: 48,
  maxFontSizeMultiplier: 2,
  screenGutter: spacing.md,
} as const;

export type ThemeTokens = {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  typography: typeof typography;
  layout: typeof layout;
  scheme: ColorSchemeName;
};

export const tokens = {
  spacing,
  radius,
  elevation,
  typography,
  layout,
  colors,
};
