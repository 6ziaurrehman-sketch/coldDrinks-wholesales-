import React, { memo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { ActiveOrderSummary } from '@/types/home.types';
import { formatMoney } from '@/utils/formatMoney';
import { formatDate } from '@/utils/formatDate';

export const ActiveOrderCard = memo(function ActiveOrderCard({ order }: { order: ActiveOrderSummary }) {

  return (
    <Pressable onPress={() => router.push(`/orders/${order.id}`)}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <AppText variant="subtitle">{t('home.activeOrder')}</AppText>
          <Badge 
            label={t(`order.status.${order.status}`) || order.status} 
            tone={order.status === 'cancelled' ? 'error' : 'primary'} 
          />
        </View>
        <View style={styles.details}>
          <AppText>{t('order.orderNumber', { number: order.orderNumber })}</AppText>
          <AppText variant="subtitle">{formatMoney(order.total)}</AppText>
        </View>
        {order.expectedDelivery && (
          <AppText muted variant="caption" style={styles.eta}>
            {t('order.expectedDelivery', { date: formatDate(order.expectedDelivery) })}
          </AppText>
        )}
      </Card>
    </Pressable>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eta: {
    marginTop: spacing.sm,
  }
});
