import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { formatDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/formatMoney';
import {
  getOrderStatusTone,
  getPaymentStatusTone,
} from '@/utils/orders';
import type { OrderHistoryItem } from '@/types/orderHistory.types';

interface OrderHistoryCardProps {
  item: OrderHistoryItem;
  onReorder: (orderId: string) => Promise<void>;
}

export function OrderHistoryCard({ item, onReorder }: OrderHistoryCardProps) {
  const theme = useTheme();
  const handleReorderPress = () => {
    router.push(`/orders/reorder/${item.id}`);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${item.orderNumber}, Status ${item.orderStatus}`}
      onPress={() => router.push(`/orders/history/${item.id}`)}
      style={styles.pressable}
    >
      <Card style={styles.card}>
        {/* Top Header: Order # & Date */}
        <View style={styles.headerRow}>
          <View>
            <AppText variant="title">#{item.orderNumber}</AppText>
            <AppText variant="caption" color={theme.colors.textMuted} style={styles.dateText}>
              {formatDate(item.createdAt, { style: 'datetime' })}
            </AppText>
          </View>

          <View style={styles.badgesCol}>
            <Badge
              label={t(`orders.status.${item.orderStatus}`) || item.orderStatus}
              tone={getOrderStatusTone(item.orderStatus)}
            />
            <View style={{ height: 4 }} />
            <Badge
              label={t(`orders.payment.${item.paymentStatus}`) || item.paymentStatus}
              tone={getPaymentStatusTone(item.paymentStatus)}
            />
          </View>
        </View>

        {/* Middle Info: Delivery Status and Item Count */}
        <View style={[styles.infoRow, { backgroundColor: theme.colors.surfaceMuted }]}>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t(`orders.delivery.${item.deliveryStatus}`) || item.deliveryStatus}
          </AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {item.itemCount} items
          </AppText>
        </View>

        {/* Bottom Footer: Grand Total (or Role Restricted) + Visible Reorder Button */}
        <View style={[styles.footerRow, { borderTopColor: theme.colors.border }]}>
          <View>
            <AppText variant="caption" color={theme.colors.textMuted}>
              Grand Total
            </AppText>
            {item.isFinancialAuthorized && item.grandTotal !== null ? (
              <AppText variant="subtitle" color={theme.colors.primary}>
                {formatMoney(item.grandTotal)}
              </AppText>
            ) : (
              <Badge label={t('orderHistory.roleRestricted')} tone="neutral" />
            )}
          </View>

          {/* Visible 'Reorder' button on EVERY card */}
          <View style={styles.reorderBtnContainer}>
            <Button
              label={`🔄 ${t('orderHistory.reorder')}`}
              variant="secondary"
              onPress={handleReorderPress}
            />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  card: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dateText: {
    marginTop: 2,
  },
  badgesCol: {
    alignItems: 'flex-end',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reorderBtnContainer: {
    minWidth: 100,
  },
});
