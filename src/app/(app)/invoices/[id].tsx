import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText, Badge, Button, Card } from '@/components/ui';
import { useInvoiceStore } from '@/store/invoiceStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { InvoiceStatus } from '@/types/invoices.types';

export default function InvoiceDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    selectedInvoice,
    status,
    loadInvoiceDetail,
    getPdfUrl,
    sharePdf,
  } = useInvoiceStore();

  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (id) {
      void loadInvoiceDetail(id);
    }
  }, [id, loadInvoiceDetail]);

  const onRefresh = async () => {
    if (!id) return;
    setRefreshing(true);
    await loadInvoiceDetail(id);
    setRefreshing(false);
  };

  const handleShare = async () => {
    if (!selectedInvoice) return;
    setDownloading(true);
    try {
      const url = await getPdfUrl(selectedInvoice.invoice);
      await sharePdf(selectedInvoice.invoice.invoiceNumber, url);
    } catch (err: any) {
      console.warn('Share error:', err);
    } finally {
      setDownloading(false);
    }
  };

  if (status === 'loading' && !selectedInvoice) {
    return (
      <Screen title={t('invoices.title')} onBack={router.back}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: spacing.sm }}>
            Loading invoice details...
          </AppText>
        </View>
      </Screen>
    );
  }

  if (!selectedInvoice) {
    return (
      <Screen title={t('invoices.title')} onBack={router.back}>
        <View style={styles.center}>
          <AppText variant="subtitle">Invoice Not Found</AppText>
          <View style={{ marginTop: spacing.md }}>
            <Button
              label="Back to Invoices"
              variant="secondary"
              onPress={() => router.back()}
            />
          </View>
        </View>
      </Screen>
    );
  }

  const { invoice, items, receipts, creditNotes } = selectedInvoice;

  const invoiceStatusToneMap: Record<InvoiceStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
    paid: 'success',
    partially_paid: 'warning',
    unpaid: 'error',
    voided: 'neutral',
  };

  return (
    <Screen
      title={invoice.invoiceNumber}
      onBack={router.back}
      rightAction={
        <Button
          label={downloading ? 'Preparing...' : 'Share PDF'}
          variant="secondary"
          onPress={handleShare}
          disabled={downloading}
        />
      }
    >
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
        {/* Header Card */}
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View>
              <AppText variant="caption" color={theme.colors.textMuted}>
                TAX INVOICE {invoice.version > 1 ? `(v${invoice.version})` : ''}
              </AppText>
              <AppText variant="title" style={{ fontWeight: '800', marginTop: 2 }}>
                {invoice.invoiceNumber}
              </AppText>
              {invoice.orderNumber && (
                <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '600' }}>
                  Linked to Order #{invoice.orderNumber}
                </AppText>
              )}
            </View>

            <Badge
              label={invoice.status.replace('_', ' ').toUpperCase()}
              tone={invoiceStatusToneMap[invoice.status]}
            />
          </View>

          <View style={styles.metaRow}>
            <View>
              <AppText variant="caption" color={theme.colors.textMuted}>
                Date Issued:
              </AppText>
              <AppText variant="body" style={{ fontWeight: '600' }}>
                {new Date(invoice.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </AppText>
            </View>

            {invoice.dueDate && (
              <View>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {t('invoices.dueDate')}:
                </AppText>
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  {new Date(invoice.dueDate).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </AppText>
              </View>
            )}
          </View>
        </Card>

        {/* Line Items Card */}
        <Card style={styles.itemsCard}>
          <AppText variant="subtitle" style={{ fontWeight: '700', marginBottom: spacing.xs }}>
            {t('invoices.itemsCount', { count: items.length })}
          </AppText>

          {items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  {item.productName}
                </AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {item.variantTitle} • Delivered Qty: {item.quantity} × {formatMoney(item.unitPrice)}
                </AppText>
              </View>
              <AppText variant="body" style={{ fontWeight: '700' }}>
                {formatMoney(item.totalPrice)}
              </AppText>
            </View>
          ))}
        </Card>

        {/* Financial Totals Breakdown */}
        <Card style={styles.totalsCard}>
          <AppText variant="subtitle" style={{ fontWeight: '700' }}>
            Financial Summary
          </AppText>

          <View style={styles.breakdownRow}>
            <AppText variant="body" color={theme.colors.textMuted}>
              {t('invoices.subtotal')}
            </AppText>
            <AppText variant="body">{formatMoney(invoice.subtotal)}</AppText>
          </View>

          {invoice.deliveryCharge > 0 && (
            <View style={styles.breakdownRow}>
              <AppText variant="body" color={theme.colors.textMuted}>
                {t('invoices.deliveryCharge')}
              </AppText>
              <AppText variant="body">{formatMoney(invoice.deliveryCharge)}</AppText>
            </View>
          )}

          {invoice.discounts > 0 && (
            <View style={styles.breakdownRow}>
              <AppText variant="body" color={theme.colors.success}>
                {t('invoices.discounts')}
              </AppText>
              <AppText variant="body" color={theme.colors.success}>
                -{formatMoney(invoice.discounts)}
              </AppText>
            </View>
          )}

          {invoice.tax > 0 && (
            <View style={styles.breakdownRow}>
              <AppText variant="body" color={theme.colors.textMuted}>
                {t('invoices.tax')}
              </AppText>
              <AppText variant="body">{formatMoney(invoice.tax)}</AppText>
            </View>
          )}

          <View style={[styles.breakdownRow, styles.grandTotalRow, { borderTopColor: theme.colors.border }]}>
            <AppText variant="subtitle" style={{ fontWeight: '800' }}>
              {t('invoices.total')}
            </AppText>
            <AppText variant="subtitle" style={{ fontWeight: '800' }}>
              {formatMoney(invoice.total)}
            </AppText>
          </View>

          {invoice.paidAmount > 0 && (
            <View style={styles.breakdownRow}>
              <AppText variant="body" color={theme.colors.success}>
                {t('invoices.paid')}
              </AppText>
              <AppText variant="body" color={theme.colors.success} style={{ fontWeight: '700' }}>
                -{formatMoney(invoice.paidAmount)}
              </AppText>
            </View>
          )}

          <View style={styles.breakdownRow}>
            <AppText variant="body" color={theme.colors.textMuted} style={{ fontWeight: '700' }}>
              {t('invoices.remaining')}
            </AppText>
            <AppText
              variant="subtitle"
              color={invoice.remainingAmount > 0 ? theme.colors.error : theme.colors.textMuted}
              style={{ fontWeight: '800' }}
            >
              {formatMoney(invoice.remainingAmount)}
            </AppText>
          </View>

          {invoice.remainingAmount > 0 && (
            <View style={{ marginTop: spacing.md }}>
              <Button
                label={`Pay ${formatMoney(invoice.remainingAmount)} / Upload Slip`}
                variant="primary"
                onPress={() => {
                  router.push({
                    pathname: '/payments/upload-proof',
                    params: {
                      amount: String(invoice.remainingAmount),
                      orderId: invoice.orderId || '',
                      orderNumber: invoice.orderNumber || '',
                    },
                  });
                }}
              />
            </View>
          )}
        </Card>

        {/* Linked Receipts Section */}
        {receipts.length > 0 && (
          <Card style={styles.receiptsCard}>
            <AppText variant="subtitle" style={{ fontWeight: '700', marginBottom: spacing.xs }}>
              {t('invoices.receiptsTitle')} ({receipts.length})
            </AppText>
            {receipts.map((rc) => (
              <View key={rc.id} style={styles.receiptRow}>
                <View>
                  <AppText variant="body" style={{ fontWeight: '600' }}>
                    {rc.receiptNumber}
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    {rc.paymentMethod.toUpperCase()} • Ref: {rc.referenceNumber || 'N/A'}
                  </AppText>
                </View>
                <AppText variant="body" color={theme.colors.success} style={{ fontWeight: '700' }}>
                  {formatMoney(rc.amount)}
                </AppText>
              </View>
            ))}
          </Card>
        )}

        {/* Linked Credit Notes Section */}
        {creditNotes.length > 0 && (
          <Card style={styles.creditNotesCard}>
            <AppText variant="subtitle" style={{ fontWeight: '700', marginBottom: spacing.xs }}>
              {t('invoices.creditNotesTitle')} ({creditNotes.length})
            </AppText>
            {creditNotes.map((cn) => (
              <View key={cn.id} style={styles.creditNoteRow}>
                <View>
                  <AppText variant="body" style={{ fontWeight: '600' }}>
                    {cn.creditNoteNumber}
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    Reason: {cn.reason}
                  </AppText>
                </View>
                <AppText variant="body" color={theme.colors.primary} style={{ fontWeight: '700' }}>
                  {formatMoney(cn.amount)}
                </AppText>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
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
  headerCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#00000006',
    padding: spacing.sm,
    borderRadius: 8,
  },
  itemsCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#0000000A',
  },
  totalsCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  grandTotalRow: {
    borderTopWidth: 1,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  receiptsCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#0000000A',
  },
  creditNotesCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  creditNoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#0000000A',
  },
});
