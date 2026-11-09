import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';

export type EmptyStateProps = {
  title?: string;
  message?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title = t('common.emptyTitle'),
  message,
  body,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const displayMessage = body ?? message ?? t('common.emptyBody');

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <AppText variant="subtitle">{title}</AppText>
      <AppText muted>{displayMessage}</AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: spacing.sm,
    padding: spacing.md,
    minWidth: 0,
  },
});
