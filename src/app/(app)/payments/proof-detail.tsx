import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText, Badge, Button, Card } from '@/components/ui';
import { usePaymentStore } from '@/store/paymentStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { ProofStatus } from '@/types/payments.types';

export default function ProofDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const { proofs, loadProofs } = usePaymentStore();

  const [refreshing, setRefreshing] = useState(false);

  const proof = useMemo(() => {
    return proofs.find((p) => p.id === id) || null;
  }, [id, proofs]);

  const onRefresh = async () => {
    if (!activeShopId) return;
    setRefreshing(true);
    await loadProofs(activeShopId);
    setRefreshing(false);
  };

  if (!proof) {
    return (
      <Screen title={t('payments.proofDetails')} onBack={router.back}>
        <View style={styles.centered}>
          <AppText variant="subtitle">Proof not found</AppText>
          <View style={{ marginTop: spacing.md }}>
            <Button
              label="Back to Payments"
              variant="secondary"
              onPress={() => router.back()}
            />
          </View>
        </View>
      </Screen>
    );
  }

  const proofStatusToneMap: Record<ProofStatus, 'warning' | 'success' | 'error'> = {
    submitted: 'warning',
    verified: 'success',
    rejected: 'error',
  };

  const isRejected = proof.status === 'rejected';
  const isVerified = proof.status === 'verified';

  return (
    <Screen title={t('payments.proofDetails')} onBack={router.back}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Verification Status Card */}
        <Card style={styles.statusCard}>
          <View style={styles.headerRow}>
            <View>
              <AppText variant="caption" color={theme.colors.textMuted}>
                {t('payments.proofTimeline').toUpperCase()}
              </AppText>
              <AppText variant="title" style={{ fontWeight: '800', marginTop: 2 }}>
                {formatMoney(proof.amount)}
              </AppText>
            </View>
            <Badge
              label={proof.status.toUpperCase()}
              tone={proofStatusToneMap[proof.status]}
            />
          </View>

          {/* Timeline */}
          <View style={styles.timeline}>
            {/* Step 1: Submitted */}
            <View style={styles.timelineStep}>
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: theme.colors.success },
                ]}
              />
              <View style={styles.timelineContent}>
                <AppText variant="body" style={{ fontWeight: '700' }}>
                  {t('payments.submitted')}
                </AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {new Date(proof.createdAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </AppText>
              </View>
            </View>

            {/* Vertical connector line */}
            <View
              style={[
                styles.timelineLine,
                {
                  backgroundColor:
                    proof.status !== 'submitted'
                      ? theme.colors.success
                      : theme.colors.border,
                },
              ]}
            />

            {/* Step 2: Verification Result */}
            <View style={styles.timelineStep}>
              <View
                style={[
                  styles.timelineDot,
                  {
                    backgroundColor: isVerified
                      ? theme.colors.success
                      : isRejected
                      ? theme.colors.error
                      : theme.colors.warning,
                  },
                ]}
              />
              <View style={styles.timelineContent}>
                <AppText variant="body" style={{ fontWeight: '700' }}>
                  {isVerified
                    ? t('payments.verified')
                    : isRejected
                    ? t('payments.rejected')
                    : 'Under Verification'}
                </AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {isVerified
                    ? 'Payment verified and credited to your account.'
                    : isRejected
                    ? 'Deposit could not be verified.'
                    : 'Seller accounting team is reviewing deposit.'}
                </AppText>
              </View>
            </View>
          </View>
        </Card>

        {/* Rejection Notice & Resubmit Action */}
        {isRejected && (
          <Card
            style={[
              styles.rejectedCard,
              { backgroundColor: theme.colors.error + '12', borderColor: theme.colors.error },
            ]}
          >
            <AppText variant="subtitle" color={theme.colors.error} style={{ fontWeight: '700' }}>
              ⚠️ {t('payments.rejectionReason')}
            </AppText>
            <AppText variant="body" style={{ marginTop: spacing.xs }}>
              {proof.rejectReason || 'The deposit reference did not match bank statements.'}
            </AppText>
            <View style={{ marginTop: spacing.md }}>
              <Button
                label={t('payments.resubmit')}
                variant="primary"
                onPress={() => {
                  router.push({
                    pathname: '/payments/upload-proof',
                    params: {
                      orderId: proof.orderId || '',
                      amount: String(proof.amount),
                      resubmissionOf: proof.id,
                    },
                  });
                }}
              />
            </View>
          </Card>
        )}

        {/* Transaction Details */}
        <Card style={styles.detailsCard}>
          <AppText variant="subtitle" style={{ fontWeight: '700' }}>
            Deposit Information
          </AppText>

          <View style={styles.detailRow}>
            <AppText variant="body" color={theme.colors.textMuted}>
              Bank / Gateway:
            </AppText>
            <AppText variant="body" style={{ fontWeight: '600' }}>
              {proof.bank}
            </AppText>
          </View>

          <View style={styles.detailRow}>
            <AppText variant="body" color={theme.colors.textMuted}>
              Reference Number:
            </AppText>
            <AppText variant="body" style={{ fontWeight: '600' }}>
              {proof.referenceNumber}
            </AppText>
          </View>

          {proof.orderId && (
            <View style={styles.detailRow}>
              <AppText variant="body" color={theme.colors.textMuted}>
                Linked Order:
              </AppText>
              <Button
                label="View Order"
                variant="ghost"
                onPress={() => router.push(`/orders/${proof.orderId}`)}
              />
            </View>
          )}
        </Card>

        {/* Receipt Screenshot / Document Preview */}
        {proof.filePath && (
          <Card style={styles.previewCard}>
            <AppText variant="subtitle" style={{ fontWeight: '700', marginBottom: spacing.sm }}>
              Attached Receipt
            </AppText>
            <Image
              source={{ uri: proof.filePath }}
              style={styles.proofImage}
              resizeMode="contain"
              accessibilityLabel="Payment deposit slip screenshot"
            />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  statusCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  timeline: {
    marginTop: spacing.sm,
    paddingLeft: spacing.xs,
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
  },
  timelineLine: {
    width: 2,
    height: 32,
    marginLeft: 6,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
  },
  rejectedCard: {
    padding: spacing.md,
    borderWidth: 1,
  },
  detailsCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  previewCard: {
    padding: spacing.md,
  },
  proofImage: {
    width: '100%',
    height: 260,
    backgroundColor: '#00000010',
    borderRadius: 8,
  },
});
