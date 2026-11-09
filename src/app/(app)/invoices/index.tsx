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
import { useInvoiceStore } from '@/store/invoiceStore';
import { useAuthStore, selectRole } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { InvoiceStatus } from '@/types/invoices.types';

export default function InvoicesListScreen() {
  const theme = useTheme();
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const role = useAuthStore(selectRole);

  const {
    invoices,
    status,
    roleDenied,
    filterStatus,
    hasMore,
    setFilterStatus,
    loadInvoices,
    loadMoreInvoices,
    getPdfUrl,
    sharePdf,
  } = useInvoiceStore();

  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isStaff = role === 'staff';

  useEffect(() => {
    if (activeShopId && !isStaff) {
      void loadInvoices(activeShopId);
    }
  }, [activeShopId, isStaff, filterStatus, loadInvoices]);

  const onRefresh = async () => {
    if (!activeShopId || isStaff) return;
    setRefreshing(true);
    await loadInvoices(activeShopId, true);
    setRefreshing(false);
  };

  const handleSharePdf = async (inv: any) => {
    setDownloadingId(inv.id);
    try {
      const url = await getPdfUrl(inv);
      await sharePdf(inv.invoiceNumber, url);
    } catch (err: any) {
      console.warn('Share PDF error:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  // Staff role guard: Owner & Manager only
  if (isStaff || roleDenied) {
    return (
      <Screen title={t('invoices.title')} onBack={router.back}>
        <View style={styles.restrictedContainer}>
          <Card style={styles.restrictedCard}>
            <AppText variant="title" style={{ fontSize: 32, textAlign: 'center' }}>🔒</AppText>
            <AppText variant="subtitle" style={{ textAlign: 'center', marginTop: spacing.sm, fontWeight: '700' }}>
              Access Restricted
            </AppText>
            <AppText variant="body" color={theme.colors.textMuted} style={{ textAlign: 'center', marginTop: spacing.xs }}>
              Financial invoices and accounting documents can only be viewed by the shop Owner and Manager.
            </AppText>
            <View style={{ marginTop: spacing.md }}>
              <Button label="Back to Account" variant="secondary" onPress={() => router.back()} />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const invoiceStatusToneMap: Record<InvoiceStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
    paid: 'success',
    partially_paid: 'warning',
    unpaid: 'error',
    voided: 'neutral',
  };

  return (
    <Screen
      title={t('invoices.title')}
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
        status={
          status === 'loading' && invoices.length === 0
            ? 'loading'
            : status === 'error' && invoices.length === 0
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
            <View style={styles.filterChipsRow}>
              {[
                { key: 'all', label: 'All Invoices' },
                { key: 'unpaid', label: 'Unpaid' },
                { key: 'partially_paid', label: 'Partially Paid' },
                { key: 'paid', label: 'Paid' },
              ].map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setFilterStatus(f.key)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: filterStatus === f.key ? theme.colors.primary : theme.colors.surfaceMuted,
                      borderColor: filterStatus === f.key ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${f.label}`}
                >
                  <AppText
                    variant="caption"
                    color={filterStatus === f.key ? '#FFF' : theme.colors.text}
                    style={{ fontWeight: filterStatus === f.key ? '700' : '500' }}
                  >
                    {f.label}
                  </AppText>
                </Pressable>
              ))}
            </View>

            {invoices.length === 0 ? (
              <EmptyState
                title={t('invoices.noInvoices')}
                message={t('invoices.noInvoicesDesc')}
              />
            ) : (
              <View style={styles.list}>
                {invoices.map((inv) => (
                  <Pressable
                    key={inv.id}
                    onPress={() => router.push(`/invoices/${inv.id}`)}
                    accessibilityLabel={`Invoice ${inv.invoiceNumber}, Total ${formatMoney(inv.total)}, Status ${inv.status}. Tap to view.`}
                  >
                    <Card style={styles.invoiceCard}>
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                            {inv.invoiceNumber}
                          </AppText>
                          {inv.orderNumber && (
                            <AppText variant="caption" color={theme.colors.textMuted}>
                              Order #{inv.orderNumber}
                            </AppText>
                          )}
                        </View>

                        <Badge
                          label={inv.status.replace('_', ' ').toUpperCase()}
                          tone={invoiceStatusToneMap[inv.status]}
                        />
                      </View>

                      {/* Amounts Summary */}
                      <View style={styles.amountRow}>
                        <View>
                          <AppText variant="caption" color={theme.colors.textMuted}>
                            {t('invoices.total')}
                          </AppText>
                          <AppText variant="body" style={{ fontWeight: '700' }}>
                            {formatMoney(inv.total)}
                          </AppText>
                        </View>

                        <View>
                          <AppText variant="caption" color={theme.colors.textMuted}>
                            {t('invoices.paid')}
                          </AppText>
                          <AppText variant="body" color={theme.colors.success} style={{ fontWeight: '700' }}>
                            {formatMoney(inv.paidAmount)}
                          </AppText>
                        </View>

                        <View>
                          <AppText variant="caption" color={theme.colors.textMuted}>
                            {t('invoices.remaining')}
                          </AppText>
                          <AppText
                            variant="body"
                            color={inv.remainingAmount > 0 ? theme.colors.error : theme.colors.textMuted}
                            style={{ fontWeight: '700' }}
                          >
                            {formatMoney(inv.remainingAmount)}
                          </AppText>
                        </View>
                      </View>

                      <View style={styles.cardFooter}>
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          Billed:{' '}
                          {new Date(inv.createdAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </AppText>

                        <Button
                          label={downloadingId === inv.id ? 'Loading...' : `📄 ${t('invoices.sharePdf')}`}
                          variant="ghost"
                          onPress={() => void handleSharePdf(inv)}
                          disabled={downloadingId === inv.id}
                        />
                      </View>
                    </Card>
                  </Pressable>
                ))}

                {hasMore && (
                  <View style={{ marginTop: spacing.sm, alignItems: 'center' }}>
                    <Button
                      label="Load More Invoices"
                      variant="secondary"
                      onPress={() => activeShopId && void loadMoreInvoices(activeShopId)}
                    />
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
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  list: {
    gap: spacing.md,
  },
  invoiceCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#00000006',
    padding: spacing.sm,
    borderRadius: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
});
