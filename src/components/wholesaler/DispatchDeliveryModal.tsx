import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/theme/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { IncomingOrderData } from './IncomingOrderDetailModal';

interface DispatchDeliveryModalProps {
  visible: boolean;
  order: IncomingOrderData | null;
  onClose: () => void;
  onConfirm: (orderId: string, notes?: string) => Promise<void>;
}

export function DispatchDeliveryModal({
  visible,
  order,
  onClose,
  onConfirm,
}: DispatchDeliveryModalProps) {
  const { colors, spacing } = useTheme();
  const [riderInfo, setRiderInfo] = useState('');
  const [dispatchNote, setDispatchNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setRiderInfo('');
    setDispatchNote('');
    setIsSubmitting(false);
    onClose();
  };

  if (!order) return null;

  const totalCartons =
    order.items?.reduce((acc, it) => acc + (it.qty || 0), 0) || order.items?.length || 0;

  const handleCallShop = () => {
    const phone = order.shop?.phone;
    if (phone) {
      void Linking.openURL(`tel:${phone}`);
    }
  };

  const handleConfirmDispatch = async () => {
    setIsSubmitting(true);
    try {
      const extraNotes = [
        riderInfo ? `Rider: ${riderInfo}` : null,
        dispatchNote ? `Note: ${dispatchNote}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      await onConfirm(order.id, extraNotes || undefined);
      handleClose();
    } catch {
      // Handled upstream
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="bicycle" size={24} color="#7c3aed" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="subtitle" style={styles.title}>
                  Dispatch Out for Delivery
                </AppText>
                <AppText variant="caption" muted>
                  Order #{order.order_number} • Confirm rider handover
                </AppText>
              </View>
            </View>
            <Pressable onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ padding: spacing.md }}>
            {/* Destination Shop Info */}
            <Card style={styles.shopCard}>
              <View style={styles.shopTopRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" muted style={styles.smallLabel}>
                    DELIVERY DESTINATION
                  </AppText>
                  <AppText variant="body" style={styles.shopName}>
                    {order.shop?.name || 'Retail Customer'}
                  </AppText>
                  {order.shop?.owner_name ? (
                    <AppText variant="caption" muted>
                      Owner: {order.shop.owner_name}
                    </AppText>
                  ) : null}
                </View>

                {order.shop?.phone ? (
                  <Pressable style={styles.callBtn} onPress={handleCallShop}>
                    <Ionicons name="call" size={14} color="#059669" style={{ marginRight: 4 }} />
                    <AppText variant="caption" style={styles.callBtnText}>
                      Call Shop
                    </AppText>
                  </Pressable>
                ) : null}
              </View>

              {order.shop?.address ? (
                <View style={styles.addressRow}>
                  <Ionicons name="location-outline" size={14} color="#64748b" style={{ marginRight: 4 }} />
                  <AppText variant="caption" style={styles.addressText} numberOfLines={2}>
                    {order.shop.address}
                  </AppText>
                </View>
              ) : null}
            </Card>

            {/* Cargo / Order Summary */}
            <Card style={styles.cargoCard}>
              <View style={styles.cargoHeaderRow}>
                <AppText variant="caption" muted style={styles.smallLabel}>
                  CARGO & CARTONS TO DELIVER
                </AppText>
                <View style={styles.cartonsCountBadge}>
                  <AppText style={styles.cartonsCountText}>{totalCartons} Cartons</AppText>
                </View>
              </View>

              <View style={styles.itemsList}>
                {order.items && order.items.length > 0 ? (
                  order.items.map((it, idx) => (
                    <View key={it.id || idx} style={styles.itemRow}>
                      <View style={styles.itemBullet} />
                      <AppText variant="body" style={styles.itemName} numberOfLines={1}>
                        {it.product_name}
                      </AppText>
                      <AppText variant="body" style={styles.itemQty}>
                        {it.qty} {it.sale_unit || 'ctn'}
                      </AppText>
                    </View>
                  ))
                ) : (
                  <AppText variant="caption" muted>No item details</AppText>
                )}
              </View>

              <View style={styles.summaryTotalRow}>
                <View>
                  <AppText variant="caption" muted>Payment Method</AppText>
                  <AppText variant="body" style={styles.boldText}>
                    {order.payment_method ? order.payment_method.toUpperCase() : 'CASH ON DELIVERY'}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="caption" muted>Cash / Amount to Collect</AppText>
                  <AppText variant="title" style={[styles.boldText, { color: colors.primary }]}>
                    {formatMoney(order.grand_total)}
                  </AppText>
                </View>
              </View>
            </Card>

            {/* Rider & Delivery Note Inputs */}
            <View style={styles.inputsSection}>
              <AppText variant="caption" muted style={styles.smallLabel}>
                RIDER / DRIVER DETAILS (OPTIONAL)
              </AppText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Rider: Bilal • Phone: 0321-xxxxxxx"
                placeholderTextColor="#94a3b8"
                value={riderInfo}
                onChangeText={setRiderInfo}
              />

              <AppText variant="caption" muted style={[styles.smallLabel, { marginTop: 10 }]}>
                DISPATCH NOTE / VEHICLE (OPTIONAL)
              </AppText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Suzuki Carry #3, dispatch batch 2"
                placeholderTextColor="#94a3b8"
                value={dispatchNote}
                onChangeText={setDispatchNote}
              />
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footer}>
            <Pressable
              style={styles.cancelBtn}
              onPress={handleClose}
              disabled={isSubmitting}
            >
              <AppText style={styles.cancelBtnText}>Cancel</AppText>
            </Pressable>

            <Pressable
              style={[styles.confirmBtn, isSubmitting && { opacity: 0.7 }]}
              onPress={handleConfirmDispatch}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <AppText style={styles.confirmBtnText}>Confirm Out for Delivery</AppText>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#faf5ff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: {
    fontWeight: '700',
    color: '#581c87',
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    maxHeight: 460,
  },
  shopCard: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  shopTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  smallLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  shopName: {
    fontWeight: '700',
    fontSize: 15,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  callBtnText: {
    color: '#059669',
    fontWeight: '700',
    fontSize: 11,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  addressText: {
    color: '#475569',
    flex: 1,
  },
  cargoCard: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cargoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cartonsCountBadge: {
    backgroundColor: '#ede9fe',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  cartonsCountText: {
    color: '#7c3aed',
    fontWeight: '700',
    fontSize: 11,
  },
  itemsList: {
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7c3aed',
    marginRight: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
  },
  itemQty: {
    fontWeight: '700',
    color: '#334155',
    fontSize: 13,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  boldText: {
    fontWeight: '700',
  },
  inputsSection: {
    marginTop: 6,
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontWeight: '600',
    color: '#475569',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 2,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#7c3aed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    fontWeight: '700',
    color: '#ffffff',
    fontSize: 14,
  },
});
