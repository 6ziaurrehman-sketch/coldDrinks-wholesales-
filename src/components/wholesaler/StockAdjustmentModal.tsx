import React, { useState } from 'react';
import { View, StyleSheet, Modal, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/useTheme';
import { InventoryItem } from '@/types/wholesaler.types';
import { formatStockDisplay } from '@/utils/productUtils';

interface StockAdjustmentModalProps {
  visible: boolean;
  item: InventoryItem | null;
  onClose: () => void;
  onSubmit: (params: {
    variantId: string;
    type: 'opening_stock' | 'damage' | 'expiry' | 'breakage' | 'count_correction' | 'return';
    unitsDelta: number;
    reason: string;
    notes?: string;
  }) => Promise<void>;
}

function getDisplayName(productName: string, sizeLabel?: string): string {
  if (!sizeLabel) return productName;
  const pLower = productName.toLowerCase();
  const sLower = sizeLabel.toLowerCase().trim();
  if (pLower.includes(sLower)) {
    return productName;
  }
  return `${productName} (${sizeLabel})`;
}

export function StockAdjustmentModal({ visible, item, onClose, onSubmit }: StockAdjustmentModalProps) {
  const { colors, spacing } = useTheme();
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [cartons, setCartons] = useState('');
  const [loose, setLoose] = useState('');
  const [loading, setLoading] = useState(false);

  if (!item) return null;

  const piecesPerCarton = Math.max(1, item.pieces_per_carton || 1);

  const handleSubmit = async () => {
    const cVal = parseInt(cartons, 10) || 0;
    const lVal = parseInt(loose, 10) || 0;
    const totalInputUnits = (cVal * piecesPerCarton) + lVal;

    if (totalInputUnits <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a quantity greater than zero.');
      return;
    }

    const isDeduction = action === 'remove';
    const unitsDelta = isDeduction ? -totalInputUnits : totalInputUnits;

    if (isDeduction && totalInputUnits > item.total_units) {
      Alert.alert(
        'Insufficient Stock',
        `Cannot deduct ${totalInputUnits} units. Only ${item.total_units} units available.`
      );
      return;
    }

    try {
      setLoading(true);
      await onSubmit({
        variantId: item.variant_id,
        type: isDeduction ? 'damage' : 'count_correction',
        unitsDelta,
        reason: isDeduction ? 'Manual stock deduction' : 'Manual stock addition',
      });
      setCartons('');
      setLoose('');
      onClose();
    } catch (err: any) {
      Alert.alert('Adjustment Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <AppText variant="title">Stock Adjustment</AppText>
              <AppText variant="caption" muted>
                {getDisplayName(item.product_name, item.size_label)}
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.stockBanner}>
            <AppText variant="caption">Current Stock: </AppText>
            <AppText variant="caption" style={styles.boldText}>
              {formatStockDisplay(item.available_cartons, item.available_loose_units)} ({item.total_units} units)
            </AppText>
          </View>

          {/* Add or Remove Action Selector */}
          <View style={styles.actionToggleRow}>
            <Pressable
              style={[
                styles.actionToggleBtn,
                action === 'add'
                  ? { backgroundColor: '#ecfdf5', borderColor: '#10b981' }
                  : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
              ]}
              onPress={() => setAction('add')}
            >
              <Ionicons
                name="add-circle"
                size={18}
                color={action === 'add' ? '#059669' : '#64748b'}
                style={{ marginRight: 6 }}
              />
              <AppText
                variant="body"
                style={[
                  styles.boldText,
                  { color: action === 'add' ? '#059669' : '#64748b' },
                ]}
              >
                Add Stock (+)
              </AppText>
            </Pressable>

            <Pressable
              style={[
                styles.actionToggleBtn,
                action === 'remove'
                  ? { backgroundColor: '#fef2f2', borderColor: '#ef4444' }
                  : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
              ]}
              onPress={() => setAction('remove')}
            >
              <Ionicons
                name="remove-circle"
                size={18}
                color={action === 'remove' ? '#dc2626' : '#64748b'}
                style={{ marginRight: 6 }}
              />
              <AppText
                variant="body"
                style={[
                  styles.boldText,
                  { color: action === 'remove' ? '#dc2626' : '#64748b' },
                ]}
              >
                Remove Stock (-)
              </AppText>
            </Pressable>
          </View>

          {/* Quantity Inputs */}
          <View style={styles.inputsRow}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Input
                label={`Cartons (${piecesPerCarton} pcs/ctn)`}
                keyboardType="numeric"
                value={cartons}
                onChangeText={setCartons}
                placeholder="0"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Bottles"
                keyboardType="numeric"
                value={loose}
                onChangeText={setLoose}
                placeholder="0"
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              label={
                loading
                  ? 'Saving...'
                  : action === 'add'
                  ? 'Add to Stock'
                  : 'Remove from Stock'
              }
              variant={action === 'add' ? 'primary' : 'destructive'}
              onPress={handleSubmit}
              disabled={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockBanner: { marginTop: 8, padding: 8, backgroundColor: '#f0f4f8', borderRadius: 8, flexDirection: 'row' },
  boldText: { fontWeight: '700' },
  actionToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
  },
  actionToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  inputsRow: { flexDirection: 'row', marginTop: 8 },
  actions: { marginTop: 20 },
});
