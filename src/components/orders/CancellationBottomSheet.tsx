import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Card } from '@/components/ui/Card';
import { useCancellationStore } from '@/store/cancellationStore';
import { useUiStore } from '@/store/uiStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import type { CancellationPreview, CancellationResult } from '@/types/cancellation.types';

interface CancellationBottomSheetProps {
  visible: boolean;
  orderId: string;
  orderNumber?: number;
  onClose: () => void;
  onCancelled?: (result: CancellationResult) => void;
}

const REASON_KEYS = [
  'mistake',
  'duplicate',
  'late',
  'price',
  'address',
  'other',
] as const;

export function CancellationBottomSheet({
  visible,
  orderId,
  orderNumber,
  onClose,
  onCancelled,
}: CancellationBottomSheetProps) {
  const theme = useTheme();
  const isOnline = useUiStore((s) => s.isOnline);
  const { previewCancellation, submitCancellation, submitting } = useCancellationStore();

  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [selectedReasonKey, setSelectedReasonKey] = useState<string>('mistake');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [confirmDialogVisible, setConfirmDialogVisible] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<CancellationResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleClose = () => {
    setSubmissionResult(null);
    setSubmitError(null);
    setAdditionalNotes('');
    setSelectedReasonKey('mistake');
    onClose();
  };

  const loadPreviewData = useCallback(async () => {
    if (!orderId) return;
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const data = await previewCancellation(orderId);
      setPreview(data);
    } catch (err: any) {
      setPreviewError(err?.message || 'Failed to load cancellation details');
    } finally {
      setLoadingPreview(false);
    }
  }, [orderId, previewCancellation]);

  useEffect(() => {
    let active = true;
    if (!visible || !orderId) return;

    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoadingPreview(true);
      setPreviewError(null);
      try {
        const data = await previewCancellation(orderId);
        if (active) setPreview(data);
      } catch (err: any) {
        if (active) setPreviewError(err?.message || 'Failed to load cancellation details');
      } finally {
        if (active) setLoadingPreview(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [visible, orderId, previewCancellation]);

  const selectedReasonLabel = useMemo(() => {
    return t(`cancellation.reasons.${selectedReasonKey}` as any);
  }, [selectedReasonKey]);

  const fullReason = useMemo(() => {
    if (!additionalNotes.trim()) {
      return selectedReasonLabel;
    }
    return `${selectedReasonLabel}: ${additionalNotes.trim()}`;
  }, [selectedReasonLabel, additionalNotes]);

  const handleOpenConfirm = () => {
    if (!isOnline) {
      setSubmitError('Cannot submit cancellation while offline.');
      return;
    }
    setConfirmDialogVisible(true);
  };

  const handleConfirmSubmit = async () => {
    setConfirmDialogVisible(false);
    setSubmitError(null);
    try {
      const idempotencyKey = `cancel_${orderId}_${Date.now()}`;
      const result = await submitCancellation(orderId, fullReason, idempotencyKey);
      setSubmissionResult(result);
      if (onCancelled) {
        onCancelled(result);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit cancellation');
    }
  };

  const handleFinish = () => {
    handleClose();
  };

  const sheetTitle = preview?.requiresApproval
    ? t('cancellation.requestTitle')
    : t('cancellation.title');

  return (
    <>
      <BottomSheet visible={visible} title={sheetTitle} onClose={handleClose}>
        {/* RESULT VIEW */}
        {submissionResult ? (
          <View style={styles.resultContainer}>
            <View
              style={[
                styles.resultIconWrap,
                {
                  backgroundColor:
                    submissionResult.outcome === 'CANCELLED'
                      ? theme.colors.success + '20'
                      : theme.colors.primary + '20',
                },
              ]}
            >
              <AppText variant="title">
                {submissionResult.outcome === 'CANCELLED' ? '✅' : '⏳'}
              </AppText>
            </View>

            <AppText variant="title" style={{ textAlign: 'center', marginTop: 12 }}>
              {submissionResult.outcome === 'CANCELLED'
                ? t('cancellation.successImmediateTitle')
                : t('cancellation.successRequestTitle')}
            </AppText>

            <AppText
              variant="body"
              color={theme.colors.textMuted}
              style={{ textAlign: 'center', marginTop: 6, marginBottom: 20 }}
            >
              {submissionResult.outcome === 'CANCELLED'
                ? t('cancellation.successImmediateDesc')
                : t('cancellation.successRequestDesc')}
            </AppText>

            {submissionResult.feeAmount > 0 && (
              <Card style={[styles.feeCard, { backgroundColor: theme.colors.surfaceMuted }]}>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  Estimated Cancellation Fee:
                </AppText>
                <AppText variant="subtitle" color={theme.colors.primary}>
                  Rs. {submissionResult.feeAmount}
                </AppText>
              </Card>
            )}

            <Button
              label={t('cancellation.done')}
              variant="primary"
              onPress={handleFinish}
            />
          </View>
        ) : (
          /* FORM VIEW */
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Loading Indicator */}
            {loadingPreview && (
              <View style={styles.centerBlock}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 8 }}>
                  Checking order cancellation policy...
                </AppText>
              </View>
            )}

            {/* Preview Error */}
            {previewError && (
              <Card
                style={[
                  styles.noticeCard,
                  { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error },
                ]}
              >
                <AppText variant="caption" color={theme.colors.error}>
                  ⚠️ {previewError}
                </AppText>
                <View style={{ marginTop: 8 }}>
                  <Button label="Retry" variant="ghost" onPress={loadPreviewData} />
                </View>
              </Card>
            )}

            {/* Offline Alert */}
            {!isOnline && (
              <Card
                style={[
                  styles.noticeCard,
                  { backgroundColor: theme.colors.warning + '15', borderColor: theme.colors.warning },
                ]}
              >
                <AppText variant="caption" color={theme.colors.warning}>
                  📡 You are currently offline. Cancellations require an internet connection.
                </AppText>
              </Card>
            )}

            {/* Preview Status & Notice */}
            {preview && (
              <>
                <Card
                  style={[
                    styles.noticeCard,
                    {
                      backgroundColor: preview.requiresApproval
                        ? theme.colors.warning + '15'
                        : theme.colors.success + '15',
                      borderColor: preview.requiresApproval
                        ? theme.colors.warning
                        : theme.colors.success,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    color={
                      preview.requiresApproval
                        ? theme.colors.warning
                        : theme.colors.success
                    }
                    style={{ fontWeight: '600' }}
                  >
                    {preview.requiresApproval ? '⚠️ Seller Approval Required' : '⚡ Instant Cancellation'}
                  </AppText>
                  <AppText variant="caption" color={theme.colors.text} style={{ marginTop: 4 }}>
                    {preview.notice}
                  </AppText>
                  {preview.feeEstimate > 0 && (
                    <AppText
                      variant="caption"
                      color={theme.colors.error}
                      style={{ marginTop: 4, fontWeight: '600' }}
                    >
                      Estimated fee: Rs. {preview.feeEstimate}
                    </AppText>
                  )}
                </Card>

                {preview.hasPendingRequest && (
                  <Card
                    style={[
                      styles.noticeCard,
                      { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary },
                    ]}
                  >
                    <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '600' }}>
                      ℹ️ {t('cancellation.pendingNotice')}
                    </AppText>
                  </Card>
                )}
              </>
            )}

            {/* Submit Error */}
            {submitError && (
              <Card
                style={[
                  styles.noticeCard,
                  { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error },
                ]}
              >
                <AppText variant="caption" color={theme.colors.error}>
                  ❌ {submitError}
                </AppText>
              </Card>
            )}

            {/* Reason Chips */}
            <AppText variant="subtitle" style={{ marginTop: 8 }}>
              {t('cancellation.reasonPrompt')}
            </AppText>

            <View style={styles.chipsWrap}>
              {REASON_KEYS.map((key) => {
                const isSelected = selectedReasonKey === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={t(`cancellation.reasons.${key}` as any)}
                    onPress={() => setSelectedReasonKey(key)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.surfaceMuted,
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={isSelected ? theme.colors.surface : theme.colors.text}
                      style={{ fontWeight: isSelected ? '600' : '400' }}
                    >
                      {t(`cancellation.reasons.${key}` as any)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Additional details text input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
                placeholder={t('cancellation.reasonPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={300}
                value={additionalNotes}
                onChangeText={setAdditionalNotes}
                accessibilityLabel="Additional cancellation notes"
              />
              <AppText variant="caption" color={theme.colors.textMuted} style={styles.charCounter}>
                {additionalNotes.length} / 300
              </AppText>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <View style={{ flex: 1, marginEnd: 8 }}>
                <Button label={t('common.cancel')} variant="ghost" onPress={handleClose} />
              </View>
              <View style={{ flex: 1.5 }}>
                <Button
                  label={
                    preview?.requiresApproval
                      ? t('cancellation.submitRequest')
                      : t('cancellation.submitImmediate')
                  }
                  variant={preview?.requiresApproval ? 'primary' : 'destructive'}
                  loading={submitting}
                  disabled={
                    submitting ||
                    loadingPreview ||
                    !isOnline ||
                    preview?.canCancel === false ||
                    preview?.hasPendingRequest === true
                  }
                  onPress={handleOpenConfirm}
                />
              </View>
            </View>
          </ScrollView>
        )}
      </BottomSheet>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        visible={confirmDialogVisible}
        title={t('cancellation.confirmTitle')}
        message={
          preview?.requiresApproval
            ? `Are you sure you want to request cancellation for order #${orderNumber || orderId.slice(0, 8)}? The seller will review this request.`
            : `Are you sure you want to cancel order #${orderNumber || orderId.slice(0, 8)} immediately? Reserved stock and credit will be restored.`
        }
        destructive={!preview?.requiresApproval}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirmDialogVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
    gap: 12,
  },
  centerBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  noticeCard: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  inputContainer: {
    marginTop: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  charCounter: {
    textAlign: 'right',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  resultContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  resultIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feeCard: {
    width: '100%',
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
});
