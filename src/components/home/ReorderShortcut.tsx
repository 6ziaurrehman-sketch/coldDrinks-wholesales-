import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { LastOrderSummary } from '@/types/home.types';
import { formatMoney } from '@/utils/formatMoney';
import { formatDate } from '@/utils/formatDate';

export const ReorderShortcut = memo(function ReorderShortcut({ order }: { order: LastOrderSummary }) {
  return (
    <Card style={styles.card}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <AppText variant="subtitle">{t('home.reorderTitle')}</AppText>
          <AppText muted variant="caption">
            {t('home.lastOrderOn', { date: formatDate(order.createdAt) })}
          </AppText>
          <AppText>{formatMoney(order.total)} • {t('home.itemCount', { count: order.itemCount })}</AppText>
        </View>
        <Button 
          label={t('home.orderAgain')} 
          onPress={() => router.push(`/orders/${order.id}/reorder`)}
          variant="secondary"
        />
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginEnd: spacing.md,
  }
});
