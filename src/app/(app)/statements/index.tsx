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
import { AppText, Button, Card, EmptyState } from '@/components/ui';
import { useStatementStore } from '@/store/statementStore';
import { useAuthStore, selectRole } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { StatementMovement, StatementPreset } from '@/types/statements.types';

export default function AccountStatementScreen() {
  const theme = useTheme();
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const role = useAuthStore(selectRole);

  const {
    preset,
    summary,
    lines,
    filterType,
    status,
    isOwner,
    exportingProgress,
    setPreset,
    setFilterType,
    loadStatement,
    exportPdf,
  } = useStatementStore();

  const [refreshing, setRefreshing] = useState(false);
  const isOwnerUser = role === 'owner';

  useEffect(() => {
    if (activeShopId && isOwnerUser) {
      void loadStatement(activeShopId);
    }
  }, [activeShopId, isOwnerUser, loadStatement]);

  const onRefresh = async () => {
    if (!activeShopId || !isOwnerUser) return;
    setRefreshing(true);
    await loadStatement(activeShopId);
    setRefreshing(false);
  };

  const handleExport = async () => {
    if (!activeShopId) return;
    try {
      await exportPdf(activeShopId);
    } catch (err: any) {
      console.warn('Export error:', err);
    }
  };

  // Owner guard
  if (!isOwnerUser || !isOwner) {
    return (
      <Screen title={t('statements.title')} onBack={router.back}>
        <View style={styles.restrictedContainer}>
          <Card style={styles.restrictedCard}>
            <AppText variant="title" style={{ fontSize: 32, textAlign: 'center' }}>🔒</AppText>
            <AppText variant="subtitle" style={{ textAlign: 'center', marginTop: spacing.sm, fontWeight: '700' }}>
              Owner Access Required
            </AppText>
            <AppText variant="body" color={theme.colors.textMuted} style={{ textAlign: 'center', marginTop: spacing.xs }}>
              {t('statements.ownerOnly')}
            </AppText>
            <View style={{ marginTop: spacing.md }}>
              <Button label="Back to Account" variant="secondary" onPress={() => router.back()} />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  // Filter movement lines
  const filteredLines = lines.filter((l) => {
    if (filterType === 'all') return true;
    if (filterType === 'charge') return l.amount > 0;
    if (filterType === 'payment') return l.type === 'payment';
    if (filterType === 'credit_note') return l.type === 'credit_note' || l.type === 'reversal';
    return true;
  });

  const isExporting = exportingProgress > 0;

  return (
    <Screen
      title={t('statements.title')}
      onBack={router.back}
      rightAction={
        <Button
          label={isExporting ? 'Exporting...' : '📄 Export PDF'}
          variant="secondary"
          onPress={handleExport}
          disabled={isExporting}
        />
      }
    >
      <ScreenState
        status={
          status === 'loading' && !summary
            ? 'loading'
            : status === 'error' && !summary
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
            {/* Range Preset Selector */}
            <View style={styles.presetsRow}>
              {[
                { key: 'this_month', label: t('statements.presetThisMonth') },
                { key: 'last_month', label: t('statements.presetLastMonth') },
                { key: 'last_90_days', label: t('statements.preset90Days') },
              ].map((p) => (
                <Pressable
                  key={p.key}
                  onPress={() => activeShopId && setPreset(p.key as StatementPreset, activeShopId)}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: preset === p.key ? theme.colors.primary : theme.colors.surfaceMuted,
                      borderColor: preset === p.key ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${p.label} date range`}
                >
                  <AppText
                    variant="caption"
                    color={preset === p.key ? '#FFF' : theme.colors.text}
                    style={{ fontWeight: preset === p.key ? '700' : '500' }}
                  >
                    {p.label}
                  </AppText>
                </Pressable>
              ))}
            </View>

            {/* Sticky Summary Card */}
            {summary && (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    ACCOUNT RECONCILIATION SUMMARY
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    {new Date(summary.fromDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} -{' '}
                    {new Date(summary.toDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </AppText>
                </View>

                {/* Balances Grid */}
                <View style={styles.balancesGrid}>
                  <View style={styles.balanceCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('statements.openingBalance')}
                    </AppText>
                    <AppText variant="subtitle" style={{ fontWeight: '700' }}>
                      {formatMoney(summary.openingBalance)}
                    </AppText>
                  </View>

                  <View style={styles.balanceCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('statements.closingBalance')}
                    </AppText>
                    <AppText
                      variant="subtitle"
                      color={summary.closingBalance > 0 ? theme.colors.error : theme.colors.success}
                      style={{ fontWeight: '800' }}
                    >
                      {formatMoney(summary.closingBalance)}
                    </AppText>
                  </View>
                </View>

                {/* Movements Breakdown */}
                <View style={styles.movementsBreakdown}>
                  <View style={styles.movementItem}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('statements.charges')}
                    </AppText>
                    <AppText variant="body" style={{ fontWeight: '600' }}>
                      +{formatMoney(summary.totalCharges)}
                    </AppText>
                  </View>

                  <View style={styles.movementItem}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('statements.payments')}
                    </AppText>
                    <AppText variant="body" color={theme.colors.success} style={{ fontWeight: '600' }}>
                      -{formatMoney(summary.totalPayments)}
                    </AppText>
                  </View>

                  <View style={styles.movementItem}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('statements.creditNotes')}
                    </AppText>
                    <AppText variant="body" color={theme.colors.primary} style={{ fontWeight: '600' }}>
                      -{formatMoney(summary.totalCreditNotes)}
                    </AppText>
                  </View>
                </View>
              </Card>
            )}

            {/* Type Filters */}
            <View style={styles.typeFiltersRow}>
              {[
                { key: 'all', label: 'All Activity' },
                { key: 'charge', label: 'Invoices' },
                { key: 'payment', label: 'Payments' },
                { key: 'credit_note', label: 'Credits' },
              ].map((tf) => (
                <Pressable
                  key={tf.key}
                  onPress={() => setFilterType(tf.key as any)}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: filterType === tf.key ? theme.colors.primary : theme.colors.surfaceMuted,
                      borderColor: filterType === tf.key ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    color={filterType === tf.key ? '#FFF' : theme.colors.text}
                    style={{ fontWeight: filterType === tf.key ? '700' : '500' }}
                  >
                    {tf.label}
                  </AppText>
                </Pressable>
              ))}
            </View>

            {/* Movements List or Empty State */}
            {filteredLines.length === 0 ? (
              <EmptyState
                title={t('statements.noActivity')}
                message={
                  summary
                    ? t('statements.openingEqualsClosing', {
                        balance: formatMoney(summary.openingBalance),
                      })
                    : 'No ledger transactions recorded in this date range.'
                }
              />
            ) : (
              <View style={styles.linesList}>
                {filteredLines.map((line: StatementMovement) => {
                  const isPositive = line.amount > 0;
                  return (
                    <Card key={line.id} style={styles.lineCard}>
                      <View style={styles.lineHeader}>
                        <View style={{ flex: 1 }}>
                          <AppText variant="body" style={{ fontWeight: '700' }}>
                            {line.description}
                          </AppText>
                          <AppText variant="caption" color={theme.colors.textMuted}>
                            {new Date(line.date).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </AppText>
                        </View>

                        <AppText
                          variant="subtitle"
                          color={isPositive ? theme.colors.error : theme.colors.success}
                          style={{ fontWeight: '800' }}
                        >
                          {isPositive ? '+' : ''}
                          {formatMoney(line.amount)}
                        </AppText>
                      </View>

                      {/* Running Balance Line */}
                      <View style={styles.runningBalanceRow}>
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          {t('statements.runningBalance')}:
                        </AppText>
                        <AppText variant="caption" style={{ fontWeight: '700' }}>
                          {formatMoney(line.runningBalance)}
                        </AppText>
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </ScrollView>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  restrictedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  restrictedCard: {
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  presetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  summaryCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balancesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#00000006',
    padding: spacing.sm,
    borderRadius: 8,
  },
  balanceCol: {
    gap: 2,
  },
  movementsBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#0000000A',
  },
  movementItem: {
    alignItems: 'center',
  },
  typeFiltersRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  typeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  linesList: {
    gap: spacing.xs,
  },
  lineCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  runningBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#00000008',
    paddingTop: spacing.xs,
  },
});
