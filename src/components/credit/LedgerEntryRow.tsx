import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import type { CustomerLedgerEntry, LedgerEntryType } from '@/types/credit.types';

interface LedgerEntryRowProps {
  entry: CustomerLedgerEntry;
}

const TYPE_CONFIG: Record<
  LedgerEntryType,
  { label: string; icon: string; isCredit: boolean }
> = {
  charge: { label: 'Order Invoice', icon: '🛒', isCredit: false },
  payment: { label: 'Payment Received', icon: '💳', isCredit: true },
  credit_note: { label: 'Credit Note / Return', icon: '📝', isCredit: true },
  adjustment: { label: 'Balance Adjustment', icon: '⚖️', isCredit: false },
  reversal: { label: 'Correction / Reversal', icon: '🔄', isCredit: true },
};

export function LedgerEntryRow({ entry }: LedgerEntryRowProps) {
  const theme = useTheme();

  const config = TYPE_CONFIG[entry.entryType] || {
    label: entry.entryType,
    icon: '📄',
    isCredit: entry.amount < 0,
  };

  const isPositive = entry.amount > 0;
  const amountColor = isPositive ? theme.colors.error : theme.colors.success;

  const handlePress = () => {
    if (entry.refType === 'order' && entry.refId) {
      router.push(`/orders/${entry.refId}`);
    } else if (entry.refType === 'payment' && entry.refId) {
      router.push(`/payments/${entry.refId}`);
    }
  };

  return (
    <Pressable
      style={[styles.container, { borderBottomColor: theme.colors.border }]}
      onPress={handlePress}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: theme.colors.surfaceMuted }]}>
        <AppText style={{ fontSize: 18 }}>{config.icon}</AppText>
      </View>

      {/* Main Info */}
      <View style={styles.infoCol}>
        <AppText variant="body" style={{ fontWeight: '600' }}>
          {config.label}
        </AppText>
        <AppText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
          {entry.description || `Ref: ${entry.refType} #${entry.refId?.slice(0, 8) || 'N/A'}`}
        </AppText>
        <AppText variant="caption" color={theme.colors.textMuted} style={{ fontSize: 11, marginTop: 2 }}>
          {new Date(entry.createdAt).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}{' '}
          •{' '}
          {new Date(entry.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </AppText>
      </View>

      {/* Amount & Running Balance */}
      <View style={styles.amountCol}>
        <AppText variant="subtitle" color={amountColor} style={{ fontWeight: '700' }}>
          {isPositive ? `+${formatMoney(entry.amount)}` : formatMoney(entry.amount)}
        </AppText>
        {entry.runningBalance !== undefined && (
          <AppText variant="caption" color={theme.colors.textMuted} style={{ fontSize: 11, marginTop: 2 }}>
            Bal: {formatMoney(entry.runningBalance)}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
});
