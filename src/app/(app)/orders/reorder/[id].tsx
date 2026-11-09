import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Badge, Card, Button, Stepper, EmptyState } from '@/components/ui';
import { SkeletonBlock } from '@/components/ui/SkeletonBlock';
import { useReorderStore } from '@/store/reorderStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { formatMoney } from '@/utils/formatMoney';
import type {
  ReorderLineItem,
  ReorderReplacementVariant,
} from '@/types/reorder.types';

export default function ReorderPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Array.isArray(id) ? id[0] : (id ?? '');

  const theme = useTheme();
  const {
    preview,
    selections,
    status,
    loadPreview,
    editQty,
    skipLine,
    unskipLine,
    replaceLine,
    apply,
  } = useReorderStore();

  const [activeReplaceLine, setActiveReplaceLine] = useState<ReorderLineItem | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (orderId) {
      void loadPreview(orderId);
    }
  }, [orderId, loadPreview]);

  // Compute live summary counts based on user's current selections
  const summary = useMemo(() => {
    if (!preview) return { willBeAdded: 0, unavailable: 0, totalCount: 0 };

    let willBeAdded = 0;
    let unavailable = 0;

    preview.lines.forEach((line) => {
      const selection = selections[line.lineId];
      if (!selection || selection.skip) {
        if (!line.isAvailable && !selection?.replacementVariantId) {
          unavailable++;
        }
      } else {
        willBeAdded++;
      }
    });

    return {
      willBeAdded,
      unavailable,
      totalCount: preview.lines.length,
    };
  }, [preview, selections]);

  const handleApply = async () => {
    if (!orderId) return;
    setIsApplying(true);
    setApplyError(null);
    try {
      await apply(orderId);
      router.push('/(app)/(tabs)/cart');
    } catch (err: any) {
      setApplyError(err?.message || 'Failed to add items to cart. Please retry.');
    } finally {
      setIsApplying(false);
    }
  };

  const allUnavailable = summary.willBeAdded === 0 && summary.unavailable > 0;

  return (
    <Screen title={t('reorder.title')} onBack={router.back}>
      <ScreenState
        status={status === 'loading' && !preview ? 'loading' : 'data'}
        onRetry={() => void loadPreview(orderId)}
        data={
          preview ? (
            <View style={styles.container}>
              {/* Summary Header */}
              <View
                style={[
                  styles.summaryHeader,
                  { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border },
                ]}
              >
                <AppText variant="subtitle" color={theme.colors.text}>
                  📦{' '}
                  {t('reorder.summaryHeader', {
                    avail: summary.willBeAdded,
                    unavail: summary.unavailable,
                  })}
                </AppText>
              </View>

              {allUnavailable ? (
                <View style={styles.emptyContainer}>
                  <EmptyState
                    title={t('reorder.allUnavailableTitle')}
                    message={t('reorder.allUnavailableMessage')}
                  />
                  <View style={styles.catalogBtn}>
                    <Button
                      label="Browse Catalog"
                      variant="primary"
                      onPress={() => router.push('/(app)/(tabs)/catalog')}
                    />
                  </View>
                </View>
              ) : (
                <ScrollView
                  contentContainerStyle={styles.scrollList}
                  refreshControl={
                    <RefreshControl
                      refreshing={status === 'loading'}
                      onRefresh={() => void loadPreview(orderId)}
                      colors={[theme.colors.primary]}
                    />
                  }
                >
                  {applyError && (
                    <View style={[styles.errorBanner, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.error }]}>
                      <AppText variant="caption" color={theme.colors.error}>
                        ⚠️ {applyError}
                      </AppText>
                    </View>
                  )}

                  {preview.lines.map((line) => {
                    const sel = selections[line.lineId];
                    const isSkipped = sel?.skip ?? false;
                    const currentQty = sel?.qty ?? line.adjustedQty;
                    const hasReplacement = Boolean(sel?.replacementVariantId);

                    return (
                      <Card
                        key={line.lineId}
                        style={[
                          styles.card,
                          isSkipped && { opacity: 0.6, backgroundColor: theme.colors.surfaceMuted },
                        ]}
                      >
                        {/* Line Header: Product Name & Badges */}
                        <View style={styles.cardHeader}>
                          <View style={{ flex: 1 }}>
                            <AppText variant="subtitle">{line.productName}</AppText>
                            <AppText variant="caption" color={theme.colors.textMuted}>
                              {line.brand ? `${line.brand} • ` : ''}
                              {line.saleUnit}
                            </AppText>
                          </View>

                          {!line.isAvailable && !hasReplacement ? (
                            <Badge label="Unavailable" tone="error" />
                          ) : isSkipped ? (
                            <Badge label={t('reorder.skipped')} tone="neutral" />
                          ) : (
                            <Badge label="In Stock" tone="success" />
                          )}
                        </View>

                        {/* Price change banner: Rs. 200 -> Rs. 220 */}
                        {line.flags.price_changed && (
                          <View style={[styles.alertPill, { backgroundColor: theme.colors.surfaceMuted }]}>
                            <AppText variant="caption" color={theme.colors.warning}>
                              ℹ️{' '}
                              {t('reorder.priceChanged', {
                                old: formatMoney(line.originalPrice),
                                new: formatMoney(line.currentPrice),
                              })}
                            </AppText>
                          </View>
                        )}

                        {/* Quantity rule auto-adjustment notice */}
                        {line.flags.qty_adjusted && line.qtyAdjustedReason && (
                          <View style={[styles.alertPill, { backgroundColor: theme.colors.surfaceMuted }]}>
                            <AppText variant="caption" color={theme.colors.primary}>
                              ⚡ {line.qtyAdjustedReason}
                            </AppText>
                          </View>
                        )}

                        {/* Replacement indication */}
                        {hasReplacement && (
                          <View style={[styles.alertPill, { backgroundColor: theme.colors.surfaceMuted }]}>
                            <AppText variant="caption" color={theme.colors.success}>
                              ✓ Replaced with alternative item
                            </AppText>
                          </View>
                        )}

                        {/* Actions & Quantity Stepper Row */}
                        <View style={[styles.cardFooter, { borderTopColor: theme.colors.border }]}>
                          <View style={styles.actionButtonsRow}>
                            {line.isAvailable || hasReplacement ? (
                              <Pressable
                                onPress={() => (isSkipped ? unskipLine(line.lineId) : skipLine(line.lineId))}
                                style={styles.textAction}
                              >
                                <AppText
                                  variant="caption"
                                  color={isSkipped ? theme.colors.primary : theme.colors.textMuted}
                                  style={{ fontWeight: '600' }}
                                >
                                  {isSkipped ? 'Include' : t('reorder.skip')}
                                </AppText>
                              </Pressable>
                            ) : (
                              <View style={{ flexDirection: 'row', gap: 10 }}>
                                <Pressable
                                  onPress={() => setActiveReplaceLine(line)}
                                  style={styles.textAction}
                                >
                                  <AppText
                                    variant="caption"
                                    color={theme.colors.primary}
                                    style={{ fontWeight: '700' }}
                                  >
                                    🔄 {t('reorder.replace')}
                                  </AppText>
                                </Pressable>
                                <Pressable
                                  onPress={() => skipLine(line.lineId)}
                                  style={styles.textAction}
                                >
                                  <AppText variant="caption" color={theme.colors.textMuted}>
                                    {t('reorder.skip')}
                                  </AppText>
                                </Pressable>
                              </View>
                            )}
                          </View>

                          {/* Stepper (enabled only if available and not skipped) */}
                          <View style={styles.stepperContainer}>
                            <Stepper
                              value={currentQty}
                              min={line.minQty ?? 1}
                              max={line.maxQty ?? 999}
                              multiple={line.qtyMultiple ?? 1}
                              disabled={isSkipped || (!line.isAvailable && !hasReplacement)}
                              onChange={(val) => editQty(line.lineId, val)}
                            />
                          </View>
                        </View>
                      </Card>
                    );
                  })}
                  <View style={{ height: 80 }} />
                </ScrollView>
              )}

              {/* Bottom Sticky Action Bar */}
              {!allUnavailable && (
                <View
                  style={[
                    styles.stickyFooter,
                    { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
                  ]}
                >
                  <Button
                    label={`🛒 ${t('reorder.addToCart')} (${summary.willBeAdded})`}
                    variant="primary"
                    loading={isApplying}
                    onPress={handleApply}
                  />
                </View>
              )}
            </View>
          ) : (
            <SkeletonBlock />
          )
        }
      />

      {/* Replacement Variant Selection Modal */}
      <Modal
        visible={Boolean(activeReplaceLine)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveReplaceLine(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <AppText variant="title" style={{ marginBottom: 4 }}>
              {t('reorder.selectReplacement')}
            </AppText>
            <AppText variant="caption" color={theme.colors.textMuted} style={{ marginBottom: 12 }}>
              Alternatives for: {activeReplaceLine?.productName}
            </AppText>

            {activeReplaceLine?.suggestedReplacements &&
            activeReplaceLine.suggestedReplacements.length > 0 ? (
              activeReplaceLine.suggestedReplacements.map((rep: ReorderReplacementVariant) => (
                <Pressable
                  key={rep.variantId}
                  onPress={() => {
                    if (activeReplaceLine) {
                      replaceLine(activeReplaceLine.lineId, rep.variantId);
                      setActiveReplaceLine(null);
                    }
                  }}
                  style={[
                    styles.replacementOption,
                    { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="subtitle">{rep.productName}</AppText>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {rep.saleUnit} • {formatMoney(rep.currentPrice)}
                    </AppText>
                  </View>
                  <Badge label="Select" tone="primary" />
                </Pressable>
              ))
            ) : (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {t('reorder.noReplacements')}
                </AppText>
              </View>
            )}

            <View style={{ marginTop: 14 }}>
              <Button
                label={t('common.cancel')}
                variant="ghost"
                onPress={() => setActiveReplaceLine(null)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryHeader: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogBtn: {
    marginTop: 16,
    width: '60%',
  },
  scrollList: {
    padding: 16,
    gap: 12,
  },
  errorBanner: {
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  card: {
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  alertPill: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textAction: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  stepperContainer: {
    alignItems: 'flex-end',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    padding: 20,
    borderRadius: 12,
  },
  replacementOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
});
