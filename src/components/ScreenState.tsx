import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { AppText } from '@/components/ui/AppText';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';

export type ScreenStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'data'
  | 'empty'
  | 'error'
  | 'offline';

export type ScreenStateProps = {
  status: ScreenStatus;
  data?: ReactNode;
  empty?: ReactNode;
  error?: ReactNode;
  offline?: ReactNode;
  loading?: ReactNode;
  errorMessage?: string;
  errorActionLabel?: string;
  onRetry?: () => void;
};

export function ScreenState({
  status,
  data,
  empty,
  error,
  offline,
  loading,
  errorMessage,
  errorActionLabel,
  onRetry,
}: ScreenStateProps) {
  if (status === 'loading') {
    return <>{loading ?? <SkeletonBlock />}</>;
  }
  if (status === 'empty') {
    return <>{empty ?? <EmptyState />}</>;
  }
  if (status === 'error') {
    return (
      <>
        {error ?? (
          <ErrorState
            message={errorMessage}
            actionLabel={errorActionLabel}
            onRetry={onRetry}
          />
        )}
      </>
    );
  }
  if (status === 'offline') {
    return (
      <>
        {offline ?? (
          <View style={styles.offline}>
            <AppText variant="subtitle">{t('common.offline')}</AppText>
            {onRetry ? <ErrorState message={t('common.offline')} onRetry={onRetry} /> : null}
          </View>
        )}
      </>
    );
  }
  return <>{data}</>;
}

const styles = StyleSheet.create({
  offline: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
