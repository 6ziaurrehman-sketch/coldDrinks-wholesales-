import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Card } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';
import type { CreditAlertItem } from '@/types/credit.types';

interface CreditAlertBannerProps {
  alerts: CreditAlertItem[];
}

export function CreditAlertBanner({ alerts }: CreditAlertBannerProps) {
  const theme = useTheme();

  if (!alerts || alerts.length === 0) {
    return null;
  }

  const toneColorMap = {
    error: theme.colors.error,
    warning: theme.colors.warning,
    info: theme.colors.primary,
  };

  return (
    <View style={styles.container}>
      {alerts.map((alert) => {
        const color = toneColorMap[alert.tone];
        return (
          <Card
            key={alert.id}
            style={[
              styles.alertCard,
              {
                backgroundColor: color + '12',
                borderColor: color + '40',
              },
            ]}
          >
            <View style={styles.contentCol}>
              <AppText variant="subtitle" color={color} style={{ fontWeight: '700' }}>
                {alert.title}
              </AppText>
              <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                {alert.message}
              </AppText>
            </View>

            {alert.actionLabel && (
              <View style={styles.actionRow}>
                <Button
                  label={alert.actionLabel}
                  variant={alert.tone === 'error' ? 'destructive' : 'primary'}
                  onPress={() => {
                    if (alert.actionRoute) {
                      router.push(alert.actionRoute as any);
                    } else {
                      router.push('/payments/upload-proof');
                    }
                  }}
                />
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  alertCard: {
    padding: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  contentCol: {
    gap: 2,
  },
  actionRow: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
});
