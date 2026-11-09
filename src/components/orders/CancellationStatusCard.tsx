import React from 'react';
import { View, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';
import { formatDate } from '@/utils/formatDate';
import type { CancellationRequest } from '@/types/cancellation.types';

interface CancellationStatusCardProps {
  request?: CancellationRequest | null;
  orderStatus?: string;
  orderNotes?: string | null;
  onRetryRequest?: () => void;
}

export function CancellationStatusCard({
  request,
  orderStatus,
  orderNotes,
  onRetryRequest,
}: CancellationStatusCardProps) {
  const theme = useTheme();

  if (!request && orderStatus !== 'cancelled') {
    return null;
  }

  // If order was cancelled directly (with or without request)
  if (orderStatus === 'cancelled' && (!request || request.status === 'approved')) {
    return (
      <Card
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleWithIcon}>
            <AppText variant="subtitle">🛑 Order Cancelled</AppText>
          </View>
          <Badge label="Cancelled" tone="neutral" />
        </View>

        {request?.feeApplied !== undefined && request.feeApplied !== null && request.feeApplied > 0 && (
          <AppText variant="caption" color={theme.colors.error} style={{ marginTop: 4 }}>
            Cancellation fee applied: Rs. {request.feeApplied}
          </AppText>
        )}

        {request?.sellerNote && (
          <View style={styles.noteBox}>
            <AppText variant="caption" color={theme.colors.textMuted}>
              Seller Note:
            </AppText>
            <AppText variant="body" color={theme.colors.text}>
              {request.sellerNote}
            </AppText>
          </View>
        )}

        {orderNotes && (
          <AppText
            variant="caption"
            color={theme.colors.textMuted}
            style={{ marginTop: 6, fontStyle: 'italic' }}
          >
            {orderNotes}
          </AppText>
        )}
      </Card>
    );
  }

  if (!request) return null;

  // Request is PENDING
  if (request.status === 'pending') {
    return (
      <Card
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.warning + '12',
            borderColor: theme.colors.warning,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleWithIcon}>
            <AppText variant="subtitle" color={theme.colors.warning}>
              ⏳ Cancellation Request Pending
            </AppText>
          </View>
          <Badge label="Under Review" tone="warning" />
        </View>

        <AppText variant="caption" color={theme.colors.text} style={{ marginTop: 6 }}>
          Submitted on {formatDate(request.createdAt, { style: 'datetime' })}
        </AppText>

        <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
          Reason: {request.reason}
        </AppText>

        {request.feeEstimate > 0 && (
          <AppText
            variant="caption"
            color={theme.colors.error}
            style={{ marginTop: 4, fontWeight: '600' }}
          >
            Estimated fee upon approval: Rs. {request.feeEstimate}
          </AppText>
        )}

        <View style={[styles.infoBanner, { backgroundColor: theme.colors.surface }]}>
          <AppText variant="caption" color={theme.colors.textMuted}>
            The seller has been notified. You will be alerted once a decision is made.
          </AppText>
        </View>
      </Card>
    );
  }

  // Request is REJECTED
  if (request.status === 'rejected') {
    return (
      <Card
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.error + '10',
            borderColor: theme.colors.error,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleWithIcon}>
            <AppText variant="subtitle" color={theme.colors.error}>
              ❌ Cancellation Request Rejected
            </AppText>
          </View>
          <Badge label="Rejected" tone="error" />
        </View>

        {request.sellerNote ? (
          <View style={styles.noteBox}>
            <AppText variant="caption" color={theme.colors.textMuted}>
              Seller Reason:
            </AppText>
            <AppText variant="body" color={theme.colors.error}>
              {request.sellerNote}
            </AppText>
          </View>
        ) : (
          <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 6 }}>
            The seller was unable to approve this cancellation request.
          </AppText>
        )}

        {onRetryRequest && orderStatus !== 'delivered' && (
          <View style={{ marginTop: 10 }}>
            <Button label="Request Cancellation Again" variant="ghost" onPress={onRetryRequest} />
          </View>
        )}
      </Card>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  infoBanner: {
    marginTop: 10,
    padding: 8,
    borderRadius: 6,
  },
});
