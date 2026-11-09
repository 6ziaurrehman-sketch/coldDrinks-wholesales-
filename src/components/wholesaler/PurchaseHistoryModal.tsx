import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/theme/useTheme';
import { wholesalerService } from '@/lib/wholesalerService';
import { formatMoney } from '@/utils/formatMoney';
import { formatDate } from '@/utils/formatDate';

interface PurchaseHistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PurchaseHistoryModal({ visible, onClose }: PurchaseHistoryModalProps) {
  const { colors, spacing } = useTheme();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (visible) {
      wholesalerService
        .getPurchasesHistory()
        .then((data) => {
          if (active) setPurchases(data);
        })
        .catch((err: any) => {
          if (active) Alert.alert('Error', err.message || 'Failed to load purchases');
        });
    }
    return () => {
      active = false;
    };
  }, [visible]);

  const handleRefresh = async () => {
    try {
      setLoading(true);
      const data = await wholesalerService.getPurchasesHistory();
      setPurchases(data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to refresh purchases');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <AppText variant="title">Supplier Invoices & Purchases</AppText>
              <AppText variant="caption" muted>Incoming shipments & payments history</AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable onPress={handleRefresh} hitSlop={8}>
                <Ionicons name="refresh" size={22} color={colors.primary} />
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} size="large" />
              <AppText variant="caption" muted style={{ marginTop: 8 }}>
                Loading supplier invoices...
              </AppText>
            </View>
          ) : purchases.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={36} color={colors.textMuted} />
              <AppText variant="caption" muted style={{ marginTop: 8 }}>
                No supplier purchases recorded yet.
              </AppText>
            </Card>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: spacing.xl }}>
              {purchases.map((p) => {
                const isExpanded = expandedId === p.id;
                const items = p.purchase_items || [];
                const supplierName = p.suppliers?.name || 'Beverage Supplier';
                const isPaidFull = Number(p.remaining_payable) === 0;

                return (
                  <Card key={p.id} style={styles.purchaseCard}>
                    <Pressable onPress={() => setExpandedId(isExpanded ? null : p.id)}>
                      <View style={styles.purchaseHeader}>
                        <View style={{ flex: 1 }}>
                          <AppText variant="body" style={styles.boldText}>
                            {p.invoice_no || 'No Invoice #'}
                          </AppText>
                          <AppText variant="caption" muted>
                            {supplierName} • {formatDate(p.purchase_date, { style: 'date' })}
                          </AppText>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <AppText variant="body" style={styles.boldText}>
                            {formatMoney(p.total_cost)}
                          </AppText>
                          <AppText
                            variant="caption"
                            style={{
                              color: isPaidFull ? colors.success : colors.error,
                              fontWeight: '600',
                            }}
                          >
                            {isPaidFull
                              ? 'Paid Full'
                              : `Due: ${formatMoney(p.remaining_payable)}`}
                          </AppText>
                        </View>
                      </View>

                      {p.transportCost > 0 && (
                        <AppText variant="caption" muted style={{ marginTop: 2 }}>
                          Transport Cost: {formatMoney(p.transport_cost)}
                        </AppText>
                      )}
                    </Pressable>

                    {/* Expanded Items Breakdown */}
                    {isExpanded && (
                      <View style={styles.itemsBreakdown}>
                        <View style={styles.divider} />
                        <AppText variant="caption" muted style={{ marginBottom: 6, fontWeight: '600' }}>
                          ITEMS RECEIVED:
                        </AppText>
                        {items.map((item: any) => (
                          <View key={item.id} style={styles.itemRow}>
                            <AppText variant="caption" style={{ flex: 1 }}>
                              {item.product_name_snapshot} ({item.size_label_snapshot})
                            </AppText>
                            <AppText variant="caption" muted style={{ marginHorizontal: 8 }}>
                              {item.cartons_qty} ctn × {formatMoney(item.cost_per_carton)}
                            </AppText>
                            <AppText variant="caption" style={styles.boldText}>
                              {formatMoney(item.line_total)}
                            </AppText>
                          </View>
                        ))}
                      </View>
                    )}
                  </Card>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 520,
  },
  purchaseCard: {
    padding: 12,
    marginBottom: 8,
  },
  purchaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  boldText: {
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 8,
  },
  itemsBreakdown: {
    marginTop: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    marginVertical: 10,
  },
});
