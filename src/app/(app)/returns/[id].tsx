import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText, Badge, Button, Card, CachedImage } from '@/components/ui';
import { useReturnsStore } from '@/store/returnsStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { ReturnStatus } from '@/types/returns.types';

export default function ReturnDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const returns = useReturnsStore((s) => s.returns);

  const returnRecord = useMemo(() => {
    return returns.find((r) => r.id === id) || null;
  }, [id, returns]);

  if (!returnRecord) {
    return (
      <Screen title={t('returns.title')} onBack={router.back}>
        <View style={styles.center}>
          <AppText variant="subtitle">Return Record Not Found</AppText>
          <View style={{ marginTop: spacing.md }}>
            <Button
              label="Back to Returns"
              variant="secondary"
              onPress={() => router.back()}
            />
          </View>
        </View>
      </Screen>
    );
  }

  const returnStatusToneMap: Record<ReturnStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
    pending: 'warning',
    approved: 'success',
    partially_approved: 'warning',
    rejected: 'error',
  };

  return (
    <Screen title={returnRecord.returnNumber} onBack={router.back}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Card */}
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <AppText variant="caption" color={theme.colors.textMuted}>
                RETURN CLAIM DETAILS
              </AppText>
              <AppText variant="title" style={{ fontWeight: '800', marginTop: 2 }}>
                {returnRecord.returnNumber}
              </AppText>
              {returnRecord.orderNumber && (
                <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '600' }}>
                  Linked to Order #{returnRecord.orderNumber}
                </AppText>
              )}
            </View>

            <Badge
              label={t(`returns.status.${returnRecord.status}`).toUpperCase()}
              tone={returnStatusToneMap[returnRecord.status]}
            />
          </View>

          <View style={styles.metaRow}>
            <View>
              <AppText variant="caption" color={theme.colors.textMuted}>
                Date Submitted:
              </AppText>
              <AppText variant="body" style={{ fontWeight: '600' }}>
                {new Date(returnRecord.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </AppText>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="caption" color={theme.colors.textMuted}>
                Total Refund:
              </AppText>
              <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                {formatMoney(returnRecord.totalRefundAmount)}
              </AppText>
            </View>
          </View>
        </Card>

        {/* Seller Decision Note */}
        {returnRecord.sellerNote && (
          <Card
            style={[
              styles.card,
              {
                backgroundColor:
                  returnRecord.status === 'rejected'
                    ? theme.colors.error + '10'
                    : theme.colors.primary + '10',
              },
            ]}
          >
            <AppText variant="subtitle" style={{ fontWeight: '700' }}>
              Seller Decision Note
            </AppText>
            <AppText variant="body" style={{ marginTop: 4, lineHeight: 20 }}>
              {`"${returnRecord.sellerNote}"`}
            </AppText>
          </Card>
        )}

        {/* Return Items Breakdown */}
        <Card style={styles.card}>
          <AppText variant="subtitle" style={{ fontWeight: '700', marginBottom: spacing.xs }}>
            Return Items ({returnRecord.items?.length || 0})
          </AppText>

          {(returnRecord.items || []).map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="body" style={{ fontWeight: '700' }}>
                  {item.productName}
                </AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {item.variantTitle} • Return Qty: {item.qty} × {formatMoney(item.unitPrice)}
                </AppText>
                <AppText variant="caption" color={theme.colors.warning} style={{ fontWeight: '600', marginTop: 2 }}>
                  Reason: {t(`returns.reasons.${item.reason}`)}
                </AppText>

                {/* Photo Evidence Thumbnails */}
                {item.photos && item.photos.length > 0 && (
                  <View style={styles.photosRow}>
                    {item.photos.map((ph, idx) => (
                      <CachedImage key={idx} imageUrl={ph} style={styles.photoThumb} contentFit="cover" />
                    ))}
                  </View>
                )}
              </View>

              <AppText variant="body" style={{ fontWeight: '700' }}>
                {formatMoney(item.refundAmount)}
              </AppText>
            </View>
          ))}
        </Card>

        {/* Linked Order & Return Actions */}
        <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
          {returnRecord.orderId && (
            <Button
              label="View Original Order"
              variant="secondary"
              onPress={() => router.push(`/orders/${returnRecord.orderId}`)}
            />
          )}
        </View>
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
  card: {
    padding: spacing.md,
    gap: spacing.sm,
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
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#0000000A',
  },
  photosRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  photoThumb: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: '#00000010',
  },
});
