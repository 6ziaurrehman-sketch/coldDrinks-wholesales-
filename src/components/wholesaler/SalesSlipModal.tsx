import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Alert,
  Share,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { getDisplayName } from '@/utils/productUtils';
import { WholesalerSaleReceipt } from '@/types/wholesaler.types';

interface SalesSlipModalProps {
  visible: boolean;
  receipt: WholesalerSaleReceipt | null;
  items?: any[];
  onClose: () => void;
}

export function SalesSlipModal({ visible, receipt, items = [], onClose }: SalesSlipModalProps) {
  const { colors, spacing } = useTheme();
  const [sharingImage, setSharingImage] = useState(false);
  const receiptCardRef = useRef<View>(null);

  if (!receipt) return null;

  const rawDate = receipt.sale_date || (receipt as any).created_at;
  const parsedDate = rawDate ? new Date(rawDate) : new Date();
  const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const formattedDate = validDate.toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const customerName =
    receipt.customer_name ||
    (receipt as any).customer_name_snapshot ||
    'Retail Shop Customer';

  const customerPhone =
    receipt.customer_phone ||
    (receipt as any).customer_phone_snapshot ||
    null;

  const paymentMethod = (
    receipt.payment_method ||
    (receipt as any).payment_method ||
    'cash'
  ).toUpperCase();

  const generateTextReceipt = () => {
    let text = `================================\n`;
    text += `       AL FAJAR TRADERS         \n`;
    text += `    Cold Drinks & Beverages     \n`;
    text += `================================\n`;
    text += `Receipt No: ${receipt.receipt_no}\n`;
    text += `Date: ${formattedDate}\n`;
    text += `Customer: ${customerName}\n`;
    if (customerPhone) text += `Phone: ${customerPhone}\n`;
    text += `--------------------------------\n`;
    text += `ITEMS:\n`;

    if (items.length > 0) {
      items.forEach((it, idx) => {
        text += `${idx + 1}. ${getDisplayName(it.product_name_snapshot, it.size_label_snapshot)}\n`;
        const cty = it.cartons_qty > 0 ? `${it.cartons_qty} cartons ` : '';
        const lty = it.loose_units_qty > 0 ? `${it.loose_units_qty} bottles` : '';
        text += `   Qty: ${cty}${lty} | Total: ${formatMoney(it.line_total)}\n`;
      });
    }

    text += `--------------------------------\n`;
    text += `Subtotal:      ${formatMoney(receipt.subtotal)}\n`;
    if (receipt.discount > 0) {
      text += `Discount:     -${formatMoney(receipt.discount)}\n`;
    }
    text += `Total Payable: ${formatMoney(receipt.total_amount)}\n`;
    text += `Amount Paid:   ${formatMoney(receipt.paid_amount)}\n`;
    text += `Remaining Due: ${formatMoney(receipt.balance_due)}\n`;
    const totalKhata = receipt.current_total_balance ?? (receipt as any).new_balance ?? 0;
    if (totalKhata > 0) {
      text += `Total Loan Khata Balance: ${formatMoney(totalKhata)}\n`;
    }
    text += `Payment Type:  ${paymentMethod}\n`;
    text += `================================\n`;
    text += `Thank you for your business!\n`;
    return text;
  };

  // Capture sales slip as a picture and share directly to WhatsApp/System Share
  const handleShareImage = async () => {
    if (!receiptCardRef.current) return;
    setSharingImage(true);

    try {
      const uri = await captureRef(receiptCardRef, {
        format: 'png',
        quality: 1.0,
      });

      if (Platform.OS === 'web') {
        if (typeof document !== 'undefined') {
          const a = document.createElement('a');
          a.href = uri;
          a.download = `Al-Fajar-Traders-Slip-${receipt.receipt_no}.png`;
          a.click();
        }
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Al Fajar Traders Sales Slip #${receipt.receipt_no}`,
          UTI: 'public.png',
        });
      } else {
        await Share.share({
          message: generateTextReceipt(),
          title: `Sales Slip ${receipt.receipt_no}`,
        });
      }
    } catch (err: any) {
      console.warn('Image capture error, falling back to text share:', err);
      try {
        await Share.share({
          message: generateTextReceipt(),
          title: `Sales Slip ${receipt.receipt_no}`,
        });
      } catch (e: any) {
        Alert.alert('Share Error', e?.message || 'Could not share sales slip');
      }
    } finally {
      setSharingImage(false);
    }
  };

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(generateTextReceipt());
      Alert.alert('Copied', 'Sales slip copied to clipboard. You can paste it into WhatsApp.');
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <AppText variant="title">Sales Slip</AppText>
              <AppText variant="caption" muted>{receipt.receipt_no}</AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close-circle" size={28} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            <View
              ref={receiptCardRef}
              collapsable={false}
              style={[styles.slipCard, { backgroundColor: '#ffffff' }]}
            >
              {/* Header Branding with Logo */}
              <View style={styles.centerText}>
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={styles.receiptLogo}
                  resizeMode="contain"
                />
                <AppText variant="subtitle" style={styles.companyTitle}>
                  AL FAJAR TRADERS
                </AppText>
                <AppText variant="caption" style={styles.companySubtitle}>
                  Wholesale Cold Drinks & Beverages Distribution
                </AppText>
                <AppText variant="caption" muted style={{ fontSize: 10, marginTop: 1 }}>
                  Official Sales Slip & Delivery Invoice
                </AppText>
                <View style={styles.divider} />
              </View>

              {/* Metadata */}
              <View style={styles.row}>
                <AppText variant="caption" muted>Receipt No:</AppText>
                <AppText variant="caption" style={styles.bold}>{receipt.receipt_no}</AppText>
              </View>
              <View style={styles.row}>
                <AppText variant="caption" muted>Date & Time:</AppText>
                <AppText variant="caption">{formattedDate}</AppText>
              </View>
              <View style={styles.row}>
                <AppText variant="caption" muted>Customer (Shop):</AppText>
                <AppText variant="caption" style={styles.bold}>{customerName}</AppText>
              </View>
              {customerPhone && (
                <View style={styles.row}>
                  <AppText variant="caption" muted>Phone:</AppText>
                  <AppText variant="caption">{customerPhone}</AppText>
                </View>
              )}

              <View style={styles.divider} />

              {/* Items List */}
              {items.length > 0 && (
                <View style={styles.itemsSection}>
                  <View style={[styles.row, { marginBottom: 6 }]}>
                    <AppText variant="caption" style={styles.bold}>ITEM DESCRIPTION</AppText>
                    <AppText variant="caption" style={styles.bold}>AMOUNT</AppText>
                  </View>
                  {items.map((it, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <AppText variant="body" style={styles.bold}>
                          {it.product_name_snapshot}
                        </AppText>
                        <AppText variant="caption" muted>
                          {[
                            it.size_label_snapshot && !it.product_name_snapshot.toLowerCase().includes(it.size_label_snapshot.toLowerCase().trim())
                              ? it.size_label_snapshot
                              : null,
                            it.cartons_qty > 0 ? `${it.cartons_qty} cartons` : null,
                            it.loose_units_qty > 0 ? `${it.loose_units_qty} bottles` : null,
                          ].filter(Boolean).join(' • ')}
                        </AppText>
                      </View>
                      <AppText variant="body" style={styles.bold}>
                        {formatMoney(it.line_total)}
                      </AppText>
                    </View>
                  ))}
                  <View style={styles.divider} />
                </View>
              )}

              {/* Financial Totals */}
              <View style={styles.row}>
                <AppText variant="body">Subtotal:</AppText>
                <AppText variant="body">{formatMoney(receipt.subtotal)}</AppText>
              </View>
              {receipt.discount > 0 && (
                <View style={styles.row}>
                  <AppText variant="body" style={{ color: colors.success }}>Discount:</AppText>
                  <AppText variant="body" style={{ color: colors.success }}>-{formatMoney(receipt.discount)}</AppText>
                </View>
              )}
              <View style={[styles.row, styles.totalRow]}>
                <AppText variant="subtitle" style={styles.bold}>Final Total:</AppText>
                <AppText variant="subtitle" style={[styles.bold, { color: colors.primary }]}>
                  {formatMoney(receipt.total_amount)}
                </AppText>
              </View>

              <View style={styles.divider} />

              {/* Payment & Balances */}
              <View style={styles.row}>
                <AppText variant="body" style={styles.bold}>Amount Paid ({paymentMethod}):</AppText>
                <AppText variant="body" style={[styles.bold, { color: colors.success }]}>
                  {formatMoney(receipt.paid_amount)}
                </AppText>
              </View>
              <View style={styles.row}>
                <AppText variant="body">Remaining Balance Due:</AppText>
                <AppText variant="body" style={[styles.bold, receipt.balance_due > 0 ? { color: colors.error } : {}]}>
                  {formatMoney(receipt.balance_due)}
                </AppText>
              </View>

              {receipt.current_total_balance > 0 && (
                <View style={[styles.row, { marginTop: 4 }]}>
                  <AppText variant="caption" muted>Total Customer Loan Khata Balance:</AppText>
                  <AppText variant="caption" style={styles.bold}>{formatMoney(receipt.current_total_balance)}</AppText>
                </View>
              )}

              {/* OFFICIAL STAMP OF AL FAJAR TRADERS */}
              <View style={styles.stampWrapper}>
                <View style={styles.stampOuter}>
                  <View style={styles.stampDashedRing}>
                    <View style={styles.stampInner}>
                      <AppText style={styles.stampBrandText}>★ AL FAJAR TRADERS ★</AppText>
                      <View style={styles.stampInnerLine} />
                      <View style={styles.stampBadgeRow}>
                        <Ionicons name="checkmark-done-circle" size={17} color="#1d4ed8" style={{ marginRight: 4 }} />
                        <AppText style={styles.stampStatusText}>
                          {receipt.balance_due === 0 ? 'VERIFIED & PAID' : 'OFFICIAL SLIP'}
                        </AppText>
                      </View>
                      <AppText style={styles.stampSubText}>WHOLESALE COLD DRINKS</AppText>
                      <View style={styles.stampInnerLine} />
                      <AppText style={styles.stampFooterText}>AUTHORISED SIGNATURE</AppText>
                    </View>
                  </View>
                </View>
              </View>

              {/* Footer text */}
              <View style={styles.slipFooter}>
                <AppText variant="caption" muted style={styles.footerNoteText}>
                  Computer generated sales slip with verified digital stamp of Al Fajar Traders.
                </AppText>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.modalActions}>
            <Pressable
              disabled={sharingImage}
              style={[styles.sharePicBtn, sharingImage && { opacity: 0.7 }]}
              onPress={handleShareImage}
            >
              {sharingImage ? (
                <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 6 }} />
              ) : (
                <Ionicons name="image-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
              )}
              <AppText style={styles.sharePicBtnText}>
                {sharingImage ? 'Creating Image...' : 'Share Picture (WhatsApp)'}
              </AppText>
            </Pressable>

            <Pressable
              style={styles.copyBtn}
              onPress={handleCopy}
            >
              <Ionicons name="copy-outline" size={16} color="#475569" style={{ marginRight: 4 }} />
              <AppText style={styles.copyBtnText}>Copy Text</AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  scrollArea: { maxHeight: 520 },
  slipCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  centerText: { alignItems: 'center', marginBottom: 10 },
  receiptLogo: {
    width: 60,
    height: 60,
    borderRadius: 14,
    marginBottom: 6,
  },
  companyTitle: {
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#0f172a',
    fontSize: 18,
  },
  companySubtitle: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 12,
    marginTop: 1,
  },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8, width: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 3 },
  bold: { fontWeight: '700' },
  totalRow: { marginTop: 8, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: '#cbd5e1' },
  itemsSection: { marginVertical: 4 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 5 },

  // OFFICIAL STAMP STYLES
  stampWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 6,
  },
  stampOuter: {
    borderWidth: 2.5,
    borderColor: '#1d4ed8',
    borderRadius: 14,
    padding: 3,
    backgroundColor: '#eff6ff',
    transform: [{ rotate: '-6deg' }],
    shadowColor: '#1d4ed8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  stampDashedRing: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#1d4ed8',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  stampInner: {
    alignItems: 'center',
  },
  stampBrandText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1d4ed8',
    letterSpacing: 1,
  },
  stampInnerLine: {
    height: 1,
    backgroundColor: '#93c5fd',
    width: '100%',
    marginVertical: 3,
  },
  stampBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 1,
  },
  stampStatusText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.5,
  },
  stampSubText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2563eb',
    letterSpacing: 0.5,
  },
  stampFooterText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1e40af',
    letterSpacing: 0.8,
  },

  slipFooter: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footerNoteText: {
    textAlign: 'center',
    fontSize: 10,
    fontStyle: 'italic',
  },

  modalActions: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 6,
  },
  sharePicBtn: {
    flex: 1.7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669', // Emerald Green for WhatsApp
    paddingVertical: 12,
    borderRadius: 10,
    marginRight: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  sharePicBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  copyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 12,
    borderRadius: 10,
  },
  copyBtnText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
});
