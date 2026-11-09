import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useUiStore } from '@/store/uiStore';
import { spacing } from '@/theme/tokens';

export function OfflineBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isOnline = useUiStore((state) => state.isOnline);

  if (isOnline) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.warning,
          paddingTop: Math.max(insets.top, spacing.xs),
        },
      ]}>
      <AppText variant="caption" color={theme.colors.text}>
        {t('common.offline')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
});
