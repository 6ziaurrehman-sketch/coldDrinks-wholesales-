import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Badge, Button, Card, EmptyState } from '@/components/ui';
import { usePaymentStore } from '@/store/paymentStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { PaymentStatus, ProofStatus } from '@/types/payments.types';

type PaymentFilterTab = 'all' | 'verified' | 'pending' | 'rejected';

export default function PaymentsHistoryScreen() {
  const theme = useTheme();
  const activeShopId = useAuthStore((s) => s.activeShopId);

  const {
    payments,
    proofs,
    status,
    loadPayments,
    loadProofs,
    subscribe,
    unsubscribe,
  } = usePaymentStore();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<PaymentFilterTab>('all');

  useEffect(() => {
    if (activeShopId) {
      void loadPayments(activeShopId);
      void loadProofs(activeShopId);
      subscribe(activeShopId);
    }
    return () => {
      unsubscribe();
    };
  }, [activeShopId, loadPayments, loadProofs, subscribe, unsubscribe]);

  const onRefresh = async () => {
    if (!activeShopId) return;
    setRefreshing(true);
    await Promise.all([
      loadPayments(activeShopId),
      loadProofs(activeShopId),
    ]);
    setRefreshing(false);
  };

  const statusToneMap: Record<PaymentStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
    verified: 'success',
    pending: 'warning',
    rejected: 'error',
    refunded: 'neutral',
  };

  const proofStatusToneMap: Record<ProofStatus, 'warning' | 'success' | 'error'> = {
    submitted: 'warning',
    verified: 'success',
    rejected: 'error',
  };

  // Filter proofs and payments based on selected tab
  const filteredProofs = proofs.filter((prf) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'verified') return prf.status === 'verified';
    if (activeTab === 'pending') return prf.status === 'submitted';
    if (activeTab === 'rejected') return prf.status === 'rejected';
    return true;
  });

  const filteredPayments = payments.filter((pay) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'verified') return pay.status === 'verified';
    if (activeTab === 'pending') return pay.status === 'pending';
    if (activeTab === 'rejected') return pay.status === 'rejected';
    return true;
  });

  const hasAnyItems = filteredPayments.length > 0 || filteredProofs.length > 0;

  return (
    <Screen
      title={t('payments.title')}
      onBack={router.back}
      rightAction={
        <Button
          label={`+ ${t('payments.uploadProof')}`}
          variant="primary"
          onPress={() => router.push('/payments/upload-proof')}
        />
      }
    >
      <ScreenState
        status={
          status === 'loading' && payments.length === 0 && proofs.length === 0
            ? 'loading'
            : status === 'error' && payments.length === 0
            ? 'error'
            : 'data'
        }
        onRetry={onRefresh}
        data={
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
            {/* Filter Chips */}
            <View style={styles.tabsRow}>
              {(['all', 'verified', 'pending', 'rejected'] as PaymentFilterTab[]).map((tab) => (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: activeTab === tab ? theme.colors.primary : theme.colors.surfaceMuted,
                      borderColor: activeTab === tab ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter ${tab} records`}
                >
                  <AppText
                    variant="caption"
                    color={activeTab === tab ? '#FFF' : theme.colors.text}
                    style={{ fontWeight: activeTab === tab ? '700' : '500', textTransform: 'capitalize' }}
                  >
                    {tab === 'pending' ? 'Under Review' : tab}
                  </AppText>
                </Pressable>
              ))}
            </View>

            {!hasAnyItems ? (
              <EmptyState
                title="No payments or proofs"
                message="Your bank transfers, deposit slips, and verified receipts will appear here."
              />
            ) : (
              <View style={styles.list}>
                {/* 1. Submitted Proofs Section */}
                {filteredProofs.length > 0 && (
                  <View style={styles.section}>
                    <AppText variant="caption" color={theme.colors.textMuted} style={styles.sectionHeader}>
                      DEPOSIT SLIPS & PROOFS ({filteredProofs.length})
                    </AppText>
                    {filteredProofs.map((prf) => (
                      <Pressable
                        key={prf.id}
                        onPress={() => router.push({ pathname: '/payments/proof-detail', params: { id: prf.id } })}
                        accessibilityLabel={`Proof for ${formatMoney(prf.amount)}, status ${prf.status}. Tap to view details.`}
                      >
                        <Card style={styles.card}>
                          <View style={styles.cardHeader}>
                            <View style={{ flex: 1 }}>
                              <AppText variant="subtitle" style={{ fontWeight: '700' }}>
                                {formatMoney(prf.amount)}
                              </AppText>
                              <AppText variant="caption" color={theme.colors.textMuted}>
                                {prf.bank} • Ref: {prf.referenceNumber}
                              </AppText>
                            </View>

                            <Badge
                              label={prf.status === 'submitted' ? 'UNDER REVIEW' : prf.status.toUpperCase()}
                              tone={proofStatusToneMap[prf.status]}
                            />
                          </View>

                          <View style={styles.cardFooter}>
                            <AppText variant="caption" color={theme.colors.textMuted}>
                              {new Date(prf.createdAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </AppText>

                            <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '700' }}>
                              View Proof →
                            </AppText>
                          </View>
                        </Card>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* 2. Recorded Payments Section */}
                {filteredPayments.length > 0 && (
                  <View style={styles.section}>
                    <AppText variant="caption" color={theme.colors.textMuted} style={styles.sectionHeader}>
                      LEDGER PAYMENTS ({filteredPayments.length})
                    </AppText>
                    {filteredPayments.map((p) => (
                      <Card key={p.id} style={styles.card}>
                        <View style={styles.cardHeader}>
                          <View style={{ flex: 1 }}>
                            <AppText variant="subtitle" style={{ fontWeight: '700' }}>
                              {formatMoney(p.amount)}
                            </AppText>
                            <AppText variant="caption" color={theme.colors.textMuted}>
                              Method: {p.method.toUpperCase().replace('_', ' ')}
                            </AppText>
                          </View>

                          <Badge
                            label={p.status.toUpperCase()}
                            tone={statusToneMap[p.status]}
                          />
                        </View>

                        {p.reference && (
                          <AppText variant="caption" color={theme.colors.textMuted}>
                            Ref: {p.reference}
                          </AppText>
                        )}

                        <View style={styles.cardFooter}>
                          <AppText variant="caption" color={theme.colors.textMuted}>
                            {new Date(p.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </AppText>

                          {p.orderId && (
                            <Button
                              label="View Order"
                              variant="ghost"
                              onPress={() => router.push(`/orders/${p.orderId}`)}
                            />
                          )}
                        </View>
                      </Card>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tabChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  list: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
});
