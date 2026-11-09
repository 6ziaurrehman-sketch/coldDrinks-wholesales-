import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AppText, Button, Card } from '@/components/ui';
import { useDiscountStore } from '@/store/discountStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { DiscountRequestedType } from '@/types/discounts.types';

interface DiscountRequestSheetProps {
  visible: boolean;
  orderId: string;
  orderSubtotal: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DiscountRequestSheet({
  visible,
  orderId,
  orderSubtotal,
  onClose,
  onSuccess,
}: DiscountRequestSheetProps) {
  const theme = useTheme();
  const { createRequest, status } = useDiscountStore();

  const [requestedType, setRequestedType] = useState<DiscountRequestedType>('percent');
  const [valueInput, setValueInput] = useState<string>('5');
  const [message, setMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const numericVal = Number(valueInput.replace(/,/g, '')) || 0;

  // Real-time calculated discount and new total
  let calculatedDiscount = 0;
  if (requestedType === 'percent') {
    calculatedDiscount = Math.round(orderSubtotal * (numericVal / 100));
  } else {
    calculatedDiscount = numericVal;
  }
  calculatedDiscount = Math.min(orderSubtotal, Math.max(0, calculatedDiscount));
  const newSubtotal = Math.max(0, orderSubtotal - calculatedDiscount);

  const handleSubmit = async () => {
    if (numericVal <= 0) {
      setErrorMsg('Please enter a discount value greater than 0.');
      return;
    }

    if (requestedType === 'percent' && numericVal > 30) {
      setErrorMsg('Maximum discount request is 30% of order value.');
      return;
    }

    if (requestedType === 'amount' && numericVal >= orderSubtotal) {
      setErrorMsg(`Discount cannot exceed order subtotal (${formatMoney(orderSubtotal)}).`);
      return;
    }

    setErrorMsg(null);
    try {
      await createRequest({
        orderId,
        requestedType,
        requestedValue: numericVal,
        message: message.trim() || undefined,
      });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit discount request.');
    }
  };

  const isSubmitting = status === 'submitting';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <Pressable style={styles.sheetContent} onPress={(e) => e.stopPropagation()}>
            <Card style={styles.card}>
              <View style={styles.headerRow}>
                <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                  {t('discounts.requestDiscount')}
                </AppText>
                <Pressable onPress={onClose} accessibilityLabel="Close discount sheet">
                  <AppText variant="subtitle" color={theme.colors.textMuted}>✕</AppText>
                </Pressable>
              </View>

              {/* Order Base Amount */}
              <View style={styles.subtotalBanner}>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  ORDER BASE SUB-TOTAL:
                </AppText>
                <AppText variant="body" style={{ fontWeight: '800' }}>
                  {formatMoney(orderSubtotal)}
                </AppText>
              </View>

              {/* Type Toggle: Percent vs Amount */}
              <View style={styles.toggleRow}>
                <Pressable
                  onPress={() => {
                    setRequestedType('percent');
                    setValueInput('5');
                  }}
                  style={[
                    styles.toggleBtn,
                    {
                      backgroundColor:
                        requestedType === 'percent' ? theme.colors.primary : theme.colors.surfaceMuted,
                      borderColor:
                        requestedType === 'percent' ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    color={requestedType === 'percent' ? '#FFF' : theme.colors.text}
                    style={{ fontWeight: requestedType === 'percent' ? '700' : '500' }}
                  >
                    {t('discounts.typePercent')}
                  </AppText>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setRequestedType('amount');
                    setValueInput('2000');
                  }}
                  style={[
                    styles.toggleBtn,
                    {
                      backgroundColor:
                        requestedType === 'amount' ? theme.colors.primary : theme.colors.surfaceMuted,
                      borderColor:
                        requestedType === 'amount' ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    color={requestedType === 'amount' ? '#FFF' : theme.colors.text}
                    style={{ fontWeight: requestedType === 'amount' ? '700' : '500' }}
                  >
                    {t('discounts.typeAmount')}
                  </AppText>
                </Pressable>
              </View>

              {/* Value Input */}
              <View style={styles.inputGroup}>
                <AppText variant="caption" style={{ fontWeight: '700' }}>
                  {t('discounts.discountValue')} ({requestedType === 'percent' ? '%' : 'PKR'})
                </AppText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceMuted,
                      color: theme.colors.text,
                    },
                  ]}
                  keyboardType="numeric"
                  value={valueInput}
                  onChangeText={setValueInput}
                  placeholder={requestedType === 'percent' ? 'e.g. 5' : 'e.g. 2500'}
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>

              {/* Real-time Rs. Preview Card */}
              <View style={styles.previewCard}>
                <View style={styles.previewRow}>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    {t('discounts.previewCalculated')}
                  </AppText>
                  <AppText variant="body" color={theme.colors.success} style={{ fontWeight: '700' }}>
                    -{formatMoney(calculatedDiscount)}
                  </AppText>
                </View>

                <View style={[styles.previewRow, { borderTopWidth: 1, borderTopColor: '#0000000A', paddingTop: 4 }]}>
                  <AppText variant="caption" color={theme.colors.textMuted} style={{ fontWeight: '700' }}>
                    {t('discounts.previewNewTotal')}
                  </AppText>
                  <AppText variant="subtitle" style={{ fontWeight: '800' }}>
                    {formatMoney(newSubtotal)}
                  </AppText>
                </View>
              </View>

              {/* Reason / Message Input */}
              <View style={styles.inputGroup}>
                <AppText variant="caption" style={{ fontWeight: '700' }}>
                  Reason (Optional)
                </AppText>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceMuted,
                      color: theme.colors.text,
                    },
                  ]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t('discounts.messagePlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {errorMsg && (
                <AppText variant="caption" color={theme.colors.error}>
                  {errorMsg}
                </AppText>
              )}

              <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                <Button
                  label={isSubmitting ? 'Submitting...' : t('discounts.submitRequest')}
                  variant="primary"
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={onClose}
                  disabled={isSubmitting}
                />
              </View>
            </Card>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  keyboardContainer: {
    width: '100%',
  },
  sheetContent: {
    padding: spacing.md,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtotalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#00000006',
    padding: spacing.sm,
    borderRadius: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  inputGroup: {
    gap: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 15,
  },
  textArea: {
    height: 60,
    textAlignVertical: 'top',
  },
  previewCard: {
    backgroundColor: '#00000008',
    padding: spacing.sm,
    borderRadius: 8,
    gap: spacing.xs,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
