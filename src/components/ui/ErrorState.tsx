import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';

export type ErrorStateProps = {
  message?: string;
  actionLabel?: string;
  onRetry?: () => void;
};

export function ErrorState({
  message = t('common.errorFallback'),
  actionLabel = t('common.retry'),
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <AppText variant="subtitle">{t('common.errorTitle')}</AppText>
      <AppText muted>{message}</AppText>
      {onRetry ? (
        <Button label={actionLabel} onPress={onRetry} variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    minWidth: 0,
  },
});
