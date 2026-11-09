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
import { useReturnsStore } from '@/store/returnsStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { ReturnStatus } from '@/types/returns.types';

export default function ReturnsHistoryScreen() {
  const theme = useTheme();
  const activeShopId = useAuthStore((s) => s.activeShopId);

  const {
    returns,
    emptiesSummary,
    status,
    loadReturns,
    loadEmpties,
  } = useReturnsStore();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (activeShopId) {
      void loadReturns(activeShopId);
      void loadEmpties(activeShopId);
    }
  }, [activeShopId, loadReturns, loadEmpties]);

  const onRefresh = async () => {
    if (!activeShopId) return;
    setRefreshing(true);
    await Promise.all([
      loadReturns(activeShopId),
      loadEmpties(activeShopId),
    ]);
    setRefreshing(false);
  };

  const returnStatusToneMap: Record<ReturnStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
    pending: 'warning',
    approved: 'success',
    partially_approved: 'warning',
    rejected: 'error',
  };

  return (
    <Screen
      title={t('returns.title')}
      onBack={router.back}
      rightAction={
        <Button
          label={`+ ${t('returns.createReturn')}`}
          variant="primary"
          onPress={() => router.push('/returns/create')}
        />
      }
    >
      <ScreenState
        status={status === 'loading' && returns.length === 0 ? 'loading' : status === 'error' && returns.length === 0 ? 'error' : 'data'}
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
            {/* Empties Summary Banner */}
            <Pressable onPress={() => router.push('/returns/empties')}>
              <Card style={[styles.emptiesCard, { backgroundColor: theme.colors.surfaceMuted }]}>
                <View style={styles.emptiesHeader}>
                  <View>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('returns.emptiesTitle').toUpperCase()}
                    </AppText>
                    <AppText variant="subtitle" style={{ fontWeight: '800', marginTop: 2 }}>
                      🍾 Bottles: {emptiesSummary ? emptiesSummary.bottles.balance : 0} • 📦 Crates: {emptiesSummary ? emptiesSummary.crates.balance : 0}
                    </AppText>
                  </View>
                  <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '700' }}>
                    View Ledger →
                  </AppText>
                </View>
              </Card>
            </Pressable>

            {/* Returns History List */}
            {returns.length === 0 ? (
              <EmptyState
                title="No return requests"
                message="Delivered orders damaged in transit or short-delivered can be submitted for return within 24 hours of delivery."
              />
            ) : (
              <View style={styles.list}>
                <AppText variant="caption" color={theme.colors.textMuted} style={styles.sectionHeader}>
                  RETURN REQUESTS ({returns.length})
                </AppText>

                {returns.map((ret) => (
                  <Pressable
                    key={ret.id}
                    onPress={() => router.push(`/returns/${ret.id}`)}
                    accessibilityLabel={`Return ${ret.returnNumber}, status ${ret.status}. Tap to view.`}
                  >
                    <Card style={styles.returnCard}>
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                            {ret.returnNumber}
                          </AppText>
                          {ret.orderNumber && (
                            <AppText variant="caption" color={theme.colors.textMuted}>
                              Order #{ret.orderNumber}
                            </AppText>
                          )}
                        </View>

                        <Badge
                          label={t(`returns.status.${ret.status}`).toUpperCase()}
                          tone={returnStatusToneMap[ret.status]}
                        />
                      </View>

                      <View style={styles.refundRow}>
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          Claim Refund Amount:
                        </AppText>
                        <AppText variant="body" style={{ fontWeight: '700' }}>
                          {formatMoney(ret.totalRefundAmount)}
                        </AppText>
                      </View>

                      <View style={styles.cardFooter}>
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          Submitted:{' '}
                          {new Date(ret.createdAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </AppText>

                        <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '700' }}>
                          View Details →
                        </AppText>
                      </View>
                    </Card>
                  </Pressable>
                ))}
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
  emptiesCard: {
    padding: spacing.md,
  },
  emptiesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  list: {
    gap: spacing.sm,
  },
  sectionHeader: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  returnCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  refundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#00000006',
    padding: spacing.xs,
    borderRadius: 6,
    marginTop: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
});
