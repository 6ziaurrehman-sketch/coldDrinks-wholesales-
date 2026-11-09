import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Card } from '@/components/ui';
import { useReturnsStore } from '@/store/returnsStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';

export default function EmptiesScreen() {
  const theme = useTheme();
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const { emptiesSummary, loadEmpties } = useReturnsStore();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (activeShopId) {
      void loadEmpties(activeShopId);
    }
  }, [activeShopId, loadEmpties]);

  const onRefresh = async () => {
    if (!activeShopId) return;
    setRefreshing(true);
    await loadEmpties(activeShopId);
    setRefreshing(false);
  };

  return (
    <Screen title={t('returns.emptiesTitle')} onBack={router.back}>
      <ScreenState
        status={!emptiesSummary ? 'loading' : 'data'}
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
            {/* Top Deposit Held Banner */}
            {emptiesSummary && (
              <Card style={[styles.depositBanner, { backgroundColor: theme.colors.primary + '12' }]}>
                <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '700' }}>
                  {t('returns.depositHeld').toUpperCase()}
                </AppText>
                <AppText variant="title" color={theme.colors.primary} style={{ fontWeight: '800', fontSize: 28, marginTop: 4 }}>
                  {formatMoney(emptiesSummary.totalDepositHeld)}
                </AppText>
                <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
                  Deposits are credited back to your ledger upon driver empties collection.
                </AppText>
              </Card>
            )}

            {/* Glass Bottles Card */}
            {emptiesSummary && (
              <Card style={styles.itemCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                      🍾 {t('returns.emptiesBottles')}
                    </AppText>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      Deposit: {formatMoney(emptiesSummary.bottles.depositRate)} per bottle
                    </AppText>
                  </View>

                  <View style={[styles.balancePill, { backgroundColor: theme.colors.surfaceMuted }]}>
                    <AppText variant="caption" color={theme.colors.textMuted}>Balance:</AppText>
                    <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                      {emptiesSummary.bottles.balance}
                    </AppText>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('returns.issued')}
                    </AppText>
                    <AppText variant="body" style={{ fontWeight: '700' }}>
                      {emptiesSummary.bottles.issued}
                    </AppText>
                  </View>

                  <View style={styles.statCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('returns.returned')}
                    </AppText>
                    <AppText variant="body" color={theme.colors.success} style={{ fontWeight: '700' }}>
                      {emptiesSummary.bottles.returned}
                    </AppText>
                  </View>

                  <View style={styles.statCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      Deposit Value
                    </AppText>
                    <AppText variant="body" style={{ fontWeight: '700' }}>
                      {formatMoney(emptiesSummary.bottles.balance * emptiesSummary.bottles.depositRate)}
                    </AppText>
                  </View>
                </View>
              </Card>
            )}

            {/* Plastic Crates Card */}
            {emptiesSummary && (
              <Card style={styles.itemCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                      📦 {t('returns.emptiesCrates')}
                    </AppText>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      Deposit: {formatMoney(emptiesSummary.crates.depositRate)} per crate
                    </AppText>
                  </View>

                  <View style={[styles.balancePill, { backgroundColor: theme.colors.surfaceMuted }]}>
                    <AppText variant="caption" color={theme.colors.textMuted}>Balance:</AppText>
                    <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                      {emptiesSummary.crates.balance}
                    </AppText>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('returns.issued')}
                    </AppText>
                    <AppText variant="body" style={{ fontWeight: '700' }}>
                      {emptiesSummary.crates.issued}
                    </AppText>
                  </View>

                  <View style={styles.statCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('returns.returned')}
                    </AppText>
                    <AppText variant="body" color={theme.colors.success} style={{ fontWeight: '700' }}>
                      {emptiesSummary.crates.returned}
                    </AppText>
                  </View>

                  <View style={styles.statCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      Deposit Value
                    </AppText>
                    <AppText variant="body" style={{ fontWeight: '700' }}>
                      {formatMoney(emptiesSummary.crates.balance * emptiesSummary.crates.depositRate)}
                    </AppText>
                  </View>
                </View>
              </Card>
            )}

            {/* Plain language explanation card */}
            <Card style={styles.infoCard}>
              <AppText variant="subtitle" style={{ fontWeight: '700' }}>
                How Empties Work
              </AppText>
              <AppText variant="body" color={theme.colors.textMuted} style={{ lineHeight: 22, marginTop: 4 }}>
                1. Whenever wholesale glass bottles or crates are delivered, a refundable deposit is charged.{'\n'}
                2. When the delivery driver collects empty bottles or crates, your empties balance decreases automatically.{'\n'}
                3. The refunded deposit value is credited directly to your next invoice or customer ledger balance.
              </AppText>
            </Card>
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
  depositBanner: {
    padding: spacing.lg,
    borderRadius: 12,
  },
  itemCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balancePill: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#00000006',
    padding: spacing.sm,
    borderRadius: 8,
  },
  statCol: {
    alignItems: 'center',
  },
  infoCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
});
