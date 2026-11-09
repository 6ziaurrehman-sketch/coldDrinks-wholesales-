import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/theme/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { DispatchDeliveryModal } from './DispatchDeliveryModal';

export interface IncomingOrderData {
  id: string;
  order_number: number;
  shop_id: string;
  status: 'confirmed' | 'processing' | 'out_for_delivery' | 'delivered' | 'cancelled';
  payment_method: string;
  payment_status: string;
  subtotal: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
  shop?: {
    id: string;
    name: string;
    owner_name?: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  items?: {
    id: string;
    product_name: string;
    brand: string | null;
    sale_unit: string;
    pieces_per_unit: number;
    unit_price: number;
    qty: number;
    line_total: number;
  }[];
}

interface IncomingOrderDetailModalProps {
  visible: boolean;
  order: IncomingOrderData | null;
  onClose: () => void;
  onUpdateStatus: (orderId: string, newStatus: 'processing' | 'out_for_delivery' | 'delivered' | 'cancelled') => Promise<void>;
}

export function IncomingOrderDetailModal({
  visible,
  order,
  onClose,
  onUpdateStatus,
}: IncomingOrderDetailModalProps) {
  const { colors, spacing } = useTheme();
  const [updating, setUpdating] = React.useState(false);
  const [showDispatchModal, setShowDispatchModal] = React.useState(false);

  if (!order) return null;

  const handleConfirmDispatch = async (orderId: string, notes?: string) => {
    setUpdating(true);
    try {
      await onUpdateStatus(orderId, 'out_for_delivery');
      setShowDispatchModal(false);
      onClose();
    } catch (err: any) {
      const errorMsg = err?.message || 'Could not dispatch order';
      if (Platform.OS === 'web') {
        window.alert(`Error: ${errorMsg}`);
      } else {
        Alert.alert('Error', errorMsg);
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleAction = async (newStatus: 'processing' | 'out_for_delivery' | 'delivered' | 'cancelled') => {
    if (newStatus === 'out_for_delivery') {
      setShowDispatchModal(true);
      return;
    }

    let confirmTitle = 'Confirm Action';
    let confirmMsg = `Are you sure you want to change order #${order.order_number} to ${newStatus}?`;

    if (newStatus === 'processing') {
      confirmTitle = 'Accept Order';
      confirmMsg = `Accept order #${order.order_number} and start preparing cartons?`;
    } else if (newStatus === 'delivered') {
      confirmTitle = 'Mark Delivered';
      confirmMsg = `Deliver order #${order.order_number}? This will automatically create a Sales Slip and deduct warehouse stock.`;
    } else if (newStatus === 'cancelled') {
      confirmTitle = 'Reject Order';
      confirmMsg = `Are you sure you want to decline/reject order #${order.order_number}?`;
    }

    const runAction = async () => {
      setUpdating(true);
      try {
        await onUpdateStatus(order.id, newStatus);
        onClose();
      } catch (err: any) {
        const errorMsg = err?.message || 'Could not update order status';
        if (Platform.OS === 'web') {
          window.alert(`Error: ${errorMsg}`);
        } else {
          Alert.alert('Error', errorMsg);
        }
      } finally {
        setUpdating(false);
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm) {
        if (window.confirm(`${confirmTitle}\n\n${confirmMsg}`)) {
          void runAction();
        }
      } else {
        void runAction();
      }
      return;
    }

    Alert.alert(confirmTitle, confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Proceed',
        style: newStatus === 'cancelled' ? 'destructive' : 'default',
        onPress: runAction,
      },
    ]);
  };

  const getStatusBadge = () => {
    switch (order.status) {
      case 'confirmed':
        return { label: 'NEW ORDER', bg: '#fef3c7', color: '#d97706' };
      case 'processing':
        return { label: 'PREPARING', bg: '#e0f2fe', color: '#0284c7' };
      case 'out_for_delivery':
        return { label: 'ON THE WAY', bg: '#ede9fe', color: '#7c3aed' };
      case 'delivered':
        return { label: 'DELIVERED', bg: '#ecfdf5', color: '#059669' };
      case 'cancelled':
        return { label: 'CANCELLED', bg: '#fee2e2', color: '#dc2626' };
      default:
        return { label: String(order.status).toUpperCase(), bg: '#f1f5f9', color: '#475569' };
    }
  };

  const badge = getStatusBadge();

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View>
              <View style={styles.titleRow}>
                <AppText variant="subtitle" style={styles.boldText}>
                  Order #{order.order_number}
                </AppText>
                <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                  <AppText style={[styles.statusBadgeText, { color: badge.color }]}>
                    {badge.label}
                  </AppText>
                </View>
              </View>
              <AppText variant="caption" muted style={{ marginTop: 2 }}>
                Placed: {new Date(order.created_at).toLocaleString('en-PK')}
              </AppText>
            </View>

            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md }}>
            {/* Shop & Customer Card */}
            <Card style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="storefront" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                <AppText variant="body" style={styles.boldText}>
                  Customer Shop Details
                </AppText>
              </View>
              <AppText variant="subtitle" style={[styles.boldText, { marginTop: 6 }]}>
                {order.shop?.name || 'Retail Customer Store'}
              </AppText>
              {order.shop?.phone && (
                <AppText variant="caption" muted style={{ marginTop: 2 }}>
                  Phone: {order.shop.phone}
                </AppText>
              )}
              {order.shop?.address && (
                <AppText variant="caption" muted style={{ marginTop: 2 }}>
                  Address: {order.shop.address}
                </AppText>
              )}
              {order.notes && (
                <View style={styles.notesBox}>
                  <AppText variant="caption" style={{ color: '#64748b', fontStyle: 'italic' }}>
                    Instructions: {order.notes}
                  </AppText>
                </View>
              )}
            </Card>

            {/* Payment Method & Total */}
            <Card style={[styles.sectionCard, { marginTop: 10 }]}>
              <View style={styles.summaryRow}>
                <AppText variant="caption" muted>Payment Method:</AppText>
                <AppText variant="caption" style={styles.boldText}>
                  {order.payment_method?.toUpperCase()} ({order.payment_status?.toUpperCase()})
                </AppText>
              </View>
              <View style={[styles.summaryRow, { marginTop: 6 }]}>
                <AppText variant="subtitle" style={styles.boldText}>Grand Total:</AppText>
                <AppText variant="subtitle" style={[styles.boldText, { color: colors.primary }]}>
                  {formatMoney(order.grand_total)}
                </AppText>
              </View>
            </Card>

            {/* Ordered Drink Items */}
            <AppText variant="body" style={[styles.boldText, { marginTop: 14, marginBottom: 8 }]}>
              Cartons Ordered ({order.items?.length || 0})
            </AppText>

            {(order.items || []).map((it, idx) => (
              <Card key={it.id || idx} style={styles.itemRowCard}>
                <View style={{ flex: 1 }}>
                  <AppText variant="body" style={styles.boldText} numberOfLines={1}>
                    {it.product_name}
                  </AppText>
                  <AppText variant="caption" muted>
                    {it.brand ? `${it.brand} • ` : ''}{it.sale_unit || 'carton'} ({it.pieces_per_unit || 1} pcs)
                  </AppText>
                  <AppText variant="caption" style={{ color: colors.primary, marginTop: 2 }}>
                    {formatMoney(it.unit_price)} per carton
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                  <AppText variant="subtitle" style={styles.boldText}>
                    x{it.qty} Cartons
                  </AppText>
                  <AppText variant="caption" style={styles.boldText}>
                    {formatMoney(it.line_total)}
                  </AppText>
                </View>
              </Card>
            ))}
          </ScrollView>

          {/* Action Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            {updating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={styles.actionBtnRow}>
                {order.status === 'confirmed' && (
                  <>
                    <Pressable
                      style={[styles.btn, styles.rejectBtn]}
                      onPress={() => handleAction('cancelled')}
                    >
                      <Ionicons name="close-circle-outline" size={15} color="#dc2626" style={{ marginRight: 3 }} />
                      <AppText style={[styles.btnText, { color: '#dc2626' }]}>Reject</AppText>
                    </Pressable>

                    <Pressable
                      style={[styles.btn, styles.acceptBtn, { backgroundColor: colors.primary }]}
                      onPress={() => handleAction('processing')}
                    >
                      <Ionicons name="checkmark-circle-outline" size={15} color="#ffffff" style={{ marginRight: 3 }} />
                      <AppText style={[styles.btnText, { color: '#ffffff' }]}>Accept</AppText>
                    </Pressable>

                    <Pressable
                      style={[styles.btn, { backgroundColor: '#7c3aed', flex: 1.3 }]}
                      onPress={() => handleAction('out_for_delivery')}
                    >
                      <Ionicons name="bicycle-outline" size={15} color="#ffffff" style={{ marginRight: 3 }} />
                      <AppText style={[styles.btnText, { color: '#ffffff' }]}>Dispatch</AppText>
                    </Pressable>
                  </>
                )}

                {order.status === 'processing' && (
                  <Pressable
                    style={[styles.btn, { backgroundColor: '#7c3aed', flex: 1 }]}
                    onPress={() => handleAction('out_for_delivery')}
                  >
                    <Ionicons name="bicycle-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                    <AppText style={[styles.btnText, { color: '#ffffff' }]}>Mark Out for Delivery</AppText>
                  </Pressable>
                )}

                {order.status === 'out_for_delivery' && (
                  <Pressable
                    style={[styles.btn, { backgroundColor: '#059669', flex: 1 }]}
                    onPress={() => handleAction('delivered')}
                  >
                    <Ionicons name="checkmark-done-circle-outline" size={18} color="#ffffff" style={{ marginRight: 4 }} />
                    <AppText style={[styles.btnText, { color: '#ffffff' }]}>Mark Delivered & Generate Slip</AppText>
                  </Pressable>
                )}

                {(order.status === 'delivered' || order.status === 'cancelled') && (
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <AppText variant="caption" muted>
                      Order is finalized ({order.status.toUpperCase()}). No further actions needed.
                    </AppText>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>

    <DispatchDeliveryModal
      visible={showDispatchModal}
      order={order}
      onClose={() => setShowDispatchModal(false)}
      onConfirm={handleConfirmDispatch}
    />
  </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  boldText: {
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  sectionCard: {
    padding: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notesBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#94a3b8',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  acceptBtn: {
    flex: 2,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
