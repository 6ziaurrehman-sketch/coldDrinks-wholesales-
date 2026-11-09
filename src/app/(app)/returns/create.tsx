import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Button, Card, EmptyState } from '@/components/ui';
import { useReturnsStore } from '@/store/returnsStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { EligibleOrder, ReturnReason } from '@/types/returns.types';

const REASON_OPTIONS: { key: ReturnReason; label: string }[] = [
  { key: 'damaged', label: 'Damaged / Broken' },
  { key: 'wrong_item', label: 'Wrong Item' },
  { key: 'expired', label: 'Expired' },
  { key: 'short_delivery', label: 'Short Delivery' },
];

export default function CreateReturnScreen() {
  const theme = useTheme();
  const activeShopId = useAuthStore((s) => s.activeShopId);

  const {
    eligibleOrders,
    selectedOrder,
    draftItems,
    status,
    loadEligible,
    selectOrder,
    updateItemDraft,
    removeItemDraft,
    uploadPhoto,
    submitReturn,
    resetDraft,
  } = useReturnsStore();

  const [currentTime] = useState(() => Date.now());
  const [isOffline, setIsOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);

  useEffect(() => {
    if (activeShopId) {
      void loadEligible(activeShopId);
    }
  }, [activeShopId, loadEligible]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsub();
  }, []);

  const formatDeadline = (deadlineIso: string) => {
    const diffMs = new Date(deadlineIso).getTime() - currentTime;
    if (diffMs <= 0) return t('returns.windowClosed');
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return t('returns.windowCountdown', { time: `${hours}h ${mins}m` });
  };

  const handlePickPhoto = async (orderItemId: string) => {
    if (!activeShopId) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setUploadingPhotoFor(orderItemId);

        const uploadedPath = await uploadPhoto(activeShopId, {
          uri: asset.uri,
          name: asset.fileName || 'damaged.jpg',
          size: asset.fileSize,
        });

        const currentDraft = draftItems[orderItemId];
        if (currentDraft) {
          updateItemDraft(orderItemId, {
            ...currentDraft,
            photos: [...currentDraft.photos, uploadedPath],
          });
        }
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err.message || 'Could not upload photo.');
    } finally {
      setUploadingPhotoFor(null);
    }
  };

  const handleQtyChange = (
    item: { orderItemId: string; productName: string; variantTitle: string; unitPrice: number; returnableQty: number },
    delta: number,
  ) => {
    const current = draftItems[item.orderItemId];
    const currentQty = current ? current.qty : 0;
    const nextQty = Math.max(0, Math.min(item.returnableQty, currentQty + delta));

    if (nextQty === 0) {
      removeItemDraft(item.orderItemId);
    } else {
      updateItemDraft(item.orderItemId, {
        orderItemId: item.orderItemId,
        productName: item.productName,
        variantTitle: item.variantTitle,
        unitPrice: item.unitPrice,
        qty: nextQty,
        reason: current ? current.reason : 'damaged',
        photos: current ? current.photos : [],
      });
    }
  };

  const handleSubmit = async () => {
    if (isOffline) {
      Alert.alert('Offline', 'You are currently offline. Return drafts are preserved, but submission requires an active network connection.');
      return;
    }

    if (!selectedOrder || !activeShopId) return;

    const items = Object.values(draftItems);
    if (items.length === 0) {
      Alert.alert('No Items Selected', 'Please select at least one item to return.');
      return;
    }

    // Validate photo mandatory for damaged
    for (const item of items) {
      if (item.reason === 'damaged' && item.photos.length === 0) {
        Alert.alert(
          'Photo Required',
          `Please attach at least one photo of damaged goods for "${item.productName}".`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await submitReturn(selectedOrder.id, activeShopId);
      Alert.alert(
        'Return Request Submitted',
        `Return request ${res.returnNumber} has been submitted for seller review. A credit note will be issued upon approval.`,
        [
          {
            text: 'View Returns',
            onPress: () => router.replace('/returns'),
          },
        ],
      );
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message || 'Failed to submit return request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      title={t('returns.createReturn')}
      onBack={() => {
        if (Object.keys(draftItems).length > 0) {
          Alert.alert(
            'Discard Return Draft?',
            'You have items selected in your return draft. Leaving now will discard your selections.',
            [
              { text: 'Keep Editing', style: 'cancel' },
              {
                text: 'Discard & Leave',
                style: 'destructive',
                onPress: () => {
                  resetDraft();
                  router.back();
                },
              },
            ],
          );
        } else {
          router.back();
        }
      }}
    >
      <ScreenState
        status={status === 'loading' && eligibleOrders.length === 0 ? 'loading' : 'data'}
        data={
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Step 1: Select Eligible Order */}
            <AppText variant="caption" color={theme.colors.textMuted} style={styles.stepTitle}>
              STEP 1: SELECT DELIVERED ORDER
            </AppText>

            {eligibleOrders.length === 0 ? (
              <EmptyState
                title={t('returns.noEligibleOrders')}
                message={t('returns.noEligibleDesc')}
              />
            ) : (
              <View style={styles.ordersList}>
                {eligibleOrders.map((ord: EligibleOrder) => {
                  const isSelected = selectedOrder?.id === ord.id;
                  return (
                    <Pressable
                      key={ord.id}
                      onPress={() => selectOrder(ord)}
                      accessibilityLabel={`Order #${ord.orderNumber}, ${formatDeadline(ord.returnDeadline)}`}
                    >
                      <Card
                        style={[
                          styles.orderCard,
                          {
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                            borderWidth: isSelected ? 2 : 1,
                            backgroundColor: isSelected ? theme.colors.primary + '06' : theme.colors.surface,
                          },
                        ]}
                      >
                        <View style={styles.orderHeader}>
                          <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                            Order #{ord.orderNumber}
                          </AppText>
                          <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '700' }}>
                            {formatDeadline(ord.returnDeadline)}
                          </AppText>
                        </View>
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          Delivered: {new Date(ord.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} • Total: {formatMoney(ord.totalAmount)}
                        </AppText>
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Step 2: Select Items and Quantity */}
            {selectedOrder && (
              <View style={styles.stepSection}>
                <AppText variant="caption" color={theme.colors.textMuted} style={styles.stepTitle}>
                  STEP 2: SELECT RETURN QUANTITIES & REASONS
                </AppText>

                {selectedOrder.items.map((item) => {
                  const draft = draftItems[item.orderItemId];
                  const returnQty = draft ? draft.qty : 0;
                  const isDamaged = draft?.reason === 'damaged';

                  return (
                    <Card key={item.orderItemId} style={styles.itemCard}>
                      <View style={styles.itemHeader}>
                        <View style={{ flex: 1 }}>
                          <AppText variant="body" style={{ fontWeight: '700' }}>
                            {item.productName}
                          </AppText>
                          <AppText variant="caption" color={theme.colors.textMuted}>
                            {item.variantTitle} • {formatMoney(item.unitPrice)} each
                          </AppText>
                          <AppText variant="caption" color={theme.colors.primary}>
                            {t('returns.returnableQty', { qty: item.returnableQty })}
                          </AppText>
                        </View>

                        {/* Stepper Capped at Returnable Qty */}
                        <View style={styles.stepper}>
                          <Pressable
                            onPress={() => handleQtyChange(item, -1)}
                            style={[styles.stepperBtn, { borderColor: theme.colors.border }]}
                            disabled={returnQty === 0}
                          >
                            <AppText variant="subtitle" style={{ fontWeight: '800' }}>-</AppText>
                          </Pressable>

                          <View style={styles.stepperValue}>
                            <AppText variant="body" style={{ fontWeight: '800' }}>
                              {returnQty}
                            </AppText>
                          </View>

                          <Pressable
                            onPress={() => handleQtyChange(item, 1)}
                            style={[styles.stepperBtn, { borderColor: theme.colors.border }]}
                            disabled={returnQty >= item.returnableQty}
                          >
                            <AppText variant="subtitle" style={{ fontWeight: '800' }}>+</AppText>
                          </Pressable>
                        </View>
                      </View>

                      {/* If Item Selected: Pick Reason and Photos */}
                      {returnQty > 0 && draft && (
                        <View style={styles.draftDetails}>
                          <AppText variant="caption" style={{ fontWeight: '700' }}>
                            {t('returns.reason')}:
                          </AppText>

                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reasonsRow}>
                            {REASON_OPTIONS.map((r) => (
                              <Pressable
                                key={r.key}
                                onPress={() => updateItemDraft(item.orderItemId, { ...draft, reason: r.key })}
                                style={[
                                  styles.reasonChip,
                                  {
                                    backgroundColor: draft.reason === r.key ? theme.colors.primary : theme.colors.surfaceMuted,
                                    borderColor: draft.reason === r.key ? theme.colors.primary : theme.colors.border,
                                  },
                                ]}
                              >
                                <AppText
                                  variant="caption"
                                  color={draft.reason === r.key ? '#FFF' : theme.colors.text}
                                  style={{ fontWeight: draft.reason === r.key ? '700' : '500' }}
                                >
                                  {r.label}
                                </AppText>
                              </Pressable>
                            ))}
                          </ScrollView>

                          {/* Photos mandatory for Damaged */}
                          {isDamaged && (
                            <View style={styles.photosSection}>
                              <AppText variant="caption" color={draft.photos.length === 0 ? theme.colors.error : theme.colors.text} style={{ fontWeight: '700' }}>
                                📸 {t('returns.attachDamagedPhoto')} *
                              </AppText>

                              {draft.photos.length > 0 && (
                                <View style={styles.photoThumbnails}>
                                  {draft.photos.map((ph, idx) => (
                                    <View key={idx} style={styles.thumbnailWrapper}>
                                      <Image source={{ uri: ph }} style={styles.thumbnail} />
                                      <Pressable
                                        onPress={() => {
                                          const nextPhotos = draft.photos.filter((_, i) => i !== idx);
                                          updateItemDraft(item.orderItemId, { ...draft, photos: nextPhotos });
                                        }}
                                        style={styles.removePhotoBadge}
                                      >
                                        <AppText variant="caption" style={{ color: '#FFF', fontSize: 10 }}>✕</AppText>
                                      </Pressable>
                                    </View>
                                  ))}
                                </View>
                              )}

                              <Button
                                label={uploadingPhotoFor === item.orderItemId ? 'Uploading...' : '+ Attach Photo'}
                                variant="secondary"
                                onPress={() => void handlePickPhoto(item.orderItemId)}
                                disabled={uploadingPhotoFor === item.orderItemId}
                              />
                            </View>
                          )}
                        </View>
                      )}
                    </Card>
                  );
                })}

                {/* Submit Action */}
                <View style={{ marginTop: spacing.md }}>
                  <Button
                    label={submitting ? 'Submitting Return...' : t('returns.submitReturn')}
                    variant="primary"
                    onPress={handleSubmit}
                    disabled={submitting || Object.keys(draftItems).length === 0}
                  />
                </View>
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
  stepTitle: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ordersList: {
    gap: spacing.xs,
  },
  orderCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepSection: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  itemCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    width: 32,
    alignItems: 'center',
  },
  draftDetails: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#0000000A',
    gap: spacing.xs,
  },
  reasonsRow: {
    flexDirection: 'row',
  },
  reasonChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: spacing.xs,
  },
  photosSection: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  photoThumbnails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  thumbnailWrapper: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  removePhotoBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#00000099',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
