import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { useTheme } from '@/theme/useTheme';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { CreditAlert } from '@/types/home.types';
import { formatMoney } from '@/utils/formatMoney';
import { Ionicons } from '@expo/vector-icons';

export const CreditAlertCard = memo(function CreditAlertCard({ alert }: { alert: CreditAlert }) {
  const theme = useTheme();
  
  const isWarning = alert.overdue || (alert.available / alert.creditLimit) < 0.1;
  const bgColor = isWarning ? theme.colors.surfaceMuted : theme.colors.surface;
  const textColor = isWarning ? theme.colors.error : theme.colors.text;

  return (
    <Card style={[styles.card, { backgroundColor: bgColor }]}>
      <View style={styles.header}>
        <Ionicons name="wallet-outline" size={24} color={textColor} />
        <AppText variant="subtitle" style={{ color: textColor }}>{t('home.creditStatus')}</AppText>
      </View>
      <View style={styles.row}>
        <View style={styles.column}>
          <AppText muted variant="caption">{t('home.availableCredit')}</AppText>
          <AppText variant="subtitle" style={{ color: textColor }}>{formatMoney(alert.available)}</AppText>
        </View>
        <View style={styles.column}>
          <AppText muted variant="caption">{t('home.usedCredit')}</AppText>
          <AppText>{formatMoney(alert.used)}</AppText>
        </View>
      </View>
      {alert.overdue && (
        <AppText variant="caption" style={{ color: theme.colors.error, marginTop: spacing.sm }}>
          {t('home.creditOverdueWarning')}
        </AppText>
      )}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  column: {
    flex: 1,
  }
});
