import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Button, Card, EmptyState } from '@/components/ui';
import { CreditSummaryCard } from '@/components/credit/CreditSummaryCard';
import { CreditAlertBanner } from '@/components/credit/CreditAlertBanner';
import { LedgerEntryRow } from '@/components/credit/LedgerEntryRow';
import { useCreditStore } from '@/store/creditStore';
import { useAuthStore, selectRole } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'charge', label: 'Charges' },
  { id: 'payment', label: 'Payments' },
  { id: 'adjustment', label: 'Adjustments' },
];

export default function CreditAccountScreen() {
  const theme = useTheme();
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const role = useAuthStore(selectRole);

  const {
    summary,
    ledgerEntries,
    alerts,
    filterType,
    status,
    isOwner,
    lastLoadedAt,
    loadSummary,
    loadLedger,
    setFilterType,
    subscribe,
    unsubscribe,
  } = useCreditStore();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (activeShopId && role === 'owner') {
      void loadSummary(activeShopId);
      void loadLedger(activeShopId);
      subscribe(activeShopId);
    }
    return () => {
      unsubscribe();
    };
  }, [activeShopId, role, loadSummary, loadLedger, subscribe, unsubscribe]);

  const onRefresh = async () => {
    if (!activeShopId) return;
    setRefreshing(true);
    await Promise.all([
      loadSummary(activeShopId),
      loadLedger(activeShopId),
    ]);
    setRefreshing(false);
  };

  // 1. Non-Owner Deep-Link Guard
  if (role !== 'owner' || !isOwner) {
    return (
      <Screen title={t('credit.title')} onBack={router.back}>
        <View style={styles.forbiddenContainer}>
          <Card style={styles.forbiddenCard}>
            <AppText style={{ fontSize: 36, textAlign: 'center' }}>🔒</AppText>
            <AppText variant="subtitle" style={{ textAlign: 'center', marginTop: 8 }}>
              Owner Access Required
            </AppText>
            <AppText variant="body" color={theme.colors.textMuted} style={{ textAlign: 'center', marginTop: 4 }}>
              {t('credit.ownerOnly')}
            </AppText>
            <View style={{ marginTop: spacing.md }}>
              <Button label="Back to Account" variant="primary" onPress={() => router.back()} />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const isZeroCredit = summary && summary.limit === 0 && summary.used === 0;

  return (
    <Screen
      title={t('credit.title')}
      onBack={router.back}
      rightAction={
        <Button
          label="Make Payment"
          variant="secondary"
          onPress={() => router.push('/payments/upload-proof')}
        />
      }
    >
      <ScreenState
        status={status === 'loading' && !summary ? 'loading' : status === 'error' && !summary ? 'error' : 'data'}
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
            {/* Dated Cache Notice */}
            {lastLoadedAt && status !== 'loading' && (
              <AppText variant="caption" color={theme.colors.textMuted} style={{ textAlign: 'center' }}>
                Showing records updated as of{' '}
                {new Date(lastLoadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </AppText>
            )}

            {/* Top Card: Limit, Used, Available, Outstanding */}
            {summary && <CreditSummaryCard summary={summary} />}

            {/* Actionable Alerts */}
            {alerts.length > 0 && <CreditAlertBanner alerts={alerts} />}

            {/* Zero Credit Facility Card */}
            {isZeroCredit ? (
              <Card style={styles.zeroCreditCard}>
                <AppText variant="subtitle">📋 {t('credit.zeroCreditTitle')}</AppText>
                <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
                  {t('credit.zeroCreditDesc')}
                </AppText>
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    label="Contact Seller to Apply"
                    variant="primary"
                    onPress={() => router.push('/support')}
                  />
                </View>
              </Card>
            ) : (
              /* Customer Ledger Section */
              <Card style={styles.ledgerCard}>
                <View style={styles.ledgerHeaderRow}>
                  <AppText variant="subtitle">{t('credit.ledgerTitle')}</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    Immutable Audit Trail
                  </AppText>
                </View>

                {/* Filter Chips */}
                <View style={styles.filterRow}>
                  {FILTER_TABS.map((tab) => {
                    const isSelected = filterType === tab.id;
                    return (
                      <Pressable
                        key={tab.id}
                        style={[
                          styles.filterChip,
                          {
                            backgroundColor: isSelected
                              ? theme.colors.primary
                              : theme.colors.surfaceMuted,
                            borderColor: theme.colors.border,
                          },
                        ]}
                        onPress={() => activeShopId && setFilterType(activeShopId, tab.id)}
                      >
                        <AppText
                          variant="caption"
                          color={isSelected ? '#FFFFFF' : theme.colors.text}
                          style={{ fontWeight: isSelected ? '700' : '400' }}
                        >
                          {tab.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Entries List */}
                {ledgerEntries.length === 0 ? (
                  <EmptyState
                    title="No ledger entries found"
                    message="Transactions will automatically appear here when orders are invoiced or payments recorded."
                  />
                ) : (
                  <View style={styles.entriesList}>
                    {ledgerEntries.map((entry) => (
                      <LedgerEntryRow key={entry.id} entry={entry} />
                    ))}
                  </View>
                )}
              </Card>
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
  forbiddenContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forbiddenCard: {
    width: '100%',
    padding: spacing.lg,
    gap: spacing.xs,
  },
  zeroCreditCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  ledgerCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  ledgerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  entriesList: {
    marginTop: spacing.xs,
  },
});
