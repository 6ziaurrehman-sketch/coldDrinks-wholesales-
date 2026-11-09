import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { AppText, Badge, Button, Card } from '@/components/ui';
import { useDiscountStore } from '@/store/discountStore';
import { discountService } from '@/lib/discountService';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { DiscountRequestRecord, DiscountStatus } from '@/types/discounts.types';

interface DiscountStatusCardProps {
  request: DiscountRequestRecord;
  orderSubtotal?: number;
  onRefreshOrder?: () => void;
}

export function DiscountStatusCard({
  request,
  orderSubtotal = 0,
  onRefreshOrder,
}: DiscountStatusCardProps) {
  const theme = useTheme();
  const { withdrawRequest, acceptCounter } = useDiscountStore();

  const [secondsRemaining, setSecondsRemaining] = useState<number>(() =>
    discountService.getSecondsRemaining(request.expiresAt),
  );
  const [processing, setProcessing] = useState(false);

  // Live countdown timer based on server expiresAt
  useEffect(() => {
    if (request.status !== 'pending' && request.status !== 'countered') return;

    const interval = setInterval(() => {
      const remaining = discountService.getSecondsRemaining(request.expiresAt);
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request.expiresAt, request.status]);

  const formatTimer = (seconds: number) => {
    if (seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const statusToneMap: Record<DiscountStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
    pending: 'warning',
    countered: 'warning',
    approved: 'success',
    accepted: 'success',
    rejected: 'error',
    expired: 'neutral',
    withdrawn: 'neutral',
  };

  const isCountered = request.status === 'countered';
  const isPending = request.status === 'pending';
  const isExpired = secondsRemaining <= 0 && (isPending || isCountered);

  const handleAcceptCounter = async () => {
    setProcessing(true);
    try {
      const res = await acceptCounter(request.id, request.orderId);
      Alert.alert(
        'Counter Offer Accepted!',
        `A discount of ${formatMoney(res.appliedDiscount)} has been applied to this order. New Total: ${formatMoney(res.newTotal)}.`,
        [{ text: 'OK' }],
      );
      onRefreshOrder?.();
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Could not accept counter offer.');
    } finally {
      setProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    Alert.alert(
      'Withdraw Request',
      'Are you sure you want to withdraw this discount request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              await withdrawRequest(request.id, request.orderId);
              onRefreshOrder?.();
            } catch (err: any) {
              Alert.alert('Failed', err.message || 'Could not withdraw request.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Card style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={theme.colors.textMuted}>
            SPECIAL DISCOUNT REQUEST
          </AppText>
          <AppText variant="subtitle" style={{ fontWeight: '800', marginTop: 2 }}>
            {request.requestedType === 'percent'
              ? `${request.requestedValue}% Off`
              : formatMoney(request.requestedValue)}
          </AppText>
        </View>

        <Badge
          label={
            isExpired
              ? t('discounts.status.expired').toUpperCase()
              : t(`discounts.status.${request.status}`).toUpperCase()
          }
          tone={isExpired ? 'neutral' : statusToneMap[request.status]}
        />
      </View>

      {/* Countdown Timer */}
      {(isPending || isCountered) && !isExpired && (
        <View style={[styles.timerRow, { backgroundColor: theme.colors.warning + '12' }]}>
          <AppText variant="caption" color={theme.colors.warning} style={{ fontWeight: '700' }}>
            ⏳ {t('discounts.expiresIn', { time: formatTimer(secondsRemaining) })}
          </AppText>
        </View>
      )}

      {/* Counter Offer Section */}
      {isCountered && !isExpired && (
        <View style={[styles.counterBox, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '0A' }]}>
          <AppText variant="subtitle" color={theme.colors.primary} style={{ fontWeight: '800' }}>
            🤝 {t('discounts.counterOfferTitle')}
          </AppText>
          <AppText variant="body" style={{ marginTop: 2 }}>
            Seller proposes:{' '}
            <AppText variant="body" style={{ fontWeight: '800' }}>
              {request.counterType === 'percent'
                ? `${request.counterValue}% Discount`
                : formatMoney(request.counterValue || 0)}
            </AppText>
          </AppText>

          {request.sellerNote && (
            <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
              {`Note: "${request.sellerNote}"`}
            </AppText>
          )}

          <View style={styles.counterActions}>
            <Button
              label={processing ? 'Processing...' : t('discounts.acceptCounter')}
              variant="primary"
              onPress={handleAcceptCounter}
              disabled={processing}
            />
            <Button
              label={t('discounts.declineCounter')}
              variant="secondary"
              onPress={handleWithdraw}
              disabled={processing}
            />
          </View>
        </View>
      )}

      {/* Seller Note for Rejected */}
      {request.status === 'rejected' && request.sellerNote && (
        <View style={[styles.noteBox, { backgroundColor: theme.colors.error + '10' }]}>
          <AppText variant="caption" color={theme.colors.error}>
            {`Seller response: "${request.sellerNote}"`}
          </AppText>
        </View>
      )}

      {/* Withdraw action for pending requests */}
      {isPending && !isExpired && (
        <View style={{ alignItems: 'flex-end', marginTop: spacing.xs }}>
          <Button
            label={t('discounts.withdraw')}
            variant="ghost"
            onPress={handleWithdraw}
            disabled={processing}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  timerRow: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  counterBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  counterActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  noteBox: {
    padding: spacing.sm,
    borderRadius: 6,
  },
});
