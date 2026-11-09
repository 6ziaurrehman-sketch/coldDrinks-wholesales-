import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/useTheme';
import { InventoryItem, WholesalerCustomer } from '@/types/wholesaler.types';
import { getDisplayName } from '@/utils/productUtils';
import { matchInventoryItem } from '@/utils/searchUtils';

interface CustomerReturnModalProps {
  visible: boolean;
  customers: WholesalerCustomer[];
  inventory: InventoryItem[];
  preSelectedCustomer?: WholesalerCustomer | null;
  onClose: () => void;
  onSubmit: (params: {
    customerId?: string;
    variantId: string;
    cartonsQty: number;
    looseUnitsQty: number;
    creditAmount: number;
    reason: string;
    notes?: string;
  }) => Promise<void>;
}

export function CustomerReturnModal({
  visible,
  customers,
  inventory,
  preSelectedCustomer,
  onClose,
  onSubmit,
}: CustomerReturnModalProps) {
  const { colors, spacing } = useTheme();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    preSelectedCustomer?.id || customers[0]?.id || ''
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    inventory[0]?.variant_id || ''
  );
  const [cartons, setCartons] = useState('');
  const [looseUnits, setLooseUnits] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [reason, setReason] = useState('Customer overstock return');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const [productSearch, setProductSearch] = useState('');

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => matchInventoryItem(item, productSearch));
  }, [inventory, productSearch]);

  const selectedItem =
    inventory.find((i) => i.variant_id === (selectedVariantId || inventory[0]?.variant_id)) ||
    inventory[0];

  const handleCartonOrLooseChange = (newCartons: string, newLoose: string) => {
    setCartons(newCartons);
    setLooseUnits(newLoose);

    if (selectedItem) {
      const c = parseInt(newCartons, 10) || 0;
      const l = parseInt(newLoose, 10) || 0;
      const calcCredit = (c * selectedItem.price_per_carton) + (l * selectedItem.price_per_unit);
      setCreditAmount(calcCredit > 0 ? String(calcCredit) : '');
    }
  };

  const handleSubmit = async () => {
    const cVal = parseInt(cartons, 10) || 0;
    const lVal = parseInt(looseUnits, 10) || 0;
    if (cVal <= 0 && lVal <= 0) {
      Alert.alert('Required Quantity', 'Please enter at least 1 carton or loose bottle returned.');
      return;
    }

    const crVal = parseFloat(creditAmount) || 0;
    const variantId = selectedVariantId || inventory[0]?.variant_id;
    const custId = selectedCustomerId || preSelectedCustomer?.id || customers[0]?.id;

    try {
      setLoading(true);
      await onSubmit({
        customerId: custId || undefined,
        variantId,
        cartonsQty: cVal,
        looseUnitsQty: lVal,
        creditAmount: crVal,
        reason,
        notes: notes.trim() || undefined,
      });

      Alert.alert(
        'Return Processed',
        `Stock restocked into inventory${crVal > 0 ? ` and Rs. ${crVal} credited to customer Loan Khata.` : '.'}`
      );
      setCartons('');
      setLooseUnits('');
      setCreditAmount('');
      setNotes('');
      onClose();
    } catch (err: any) {
      Alert.alert('Return Failed', err.message);
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
              <AppText variant="title">Customer Stock Return</AppText>
              <AppText variant="caption" muted>
                Return unsold/defective bottles & credit Loan Khata
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {/* Customer Picker */}
            {customers.length > 0 && (
              <>
                <AppText variant="caption" muted style={{ marginTop: 8 }}>
                  Returning Customer (Shop)
                </AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {customers.map((c) => {
                    const isSel = (selectedCustomerId || customers[0]?.id) === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setSelectedCustomerId(c.id)}
                        style={[
                          styles.chip,
                          isSel && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                      >
                        <AppText variant="caption" color={isSel ? 'onPrimary' : 'text'}>
                          {c.name}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Product Picker */}
            <AppText variant="caption" muted style={{ marginTop: 12 }}>
              Select Product Returned
            </AppText>
            <View style={styles.modalSearchBox}>
              <Ionicons name="search" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={[styles.modalSearchInput, { color: colors.text }]}
                placeholder="Search 7Up 1.5L, cartoons, etc..."
                placeholderTextColor={colors.textMuted}
                value={productSearch}
                onChangeText={setProductSearch}
              />
              {productSearch.length > 0 && (
                <Pressable onPress={() => setProductSearch('')} hitSlop={6}>
                  <Ionicons name="close-circle" size={14} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {filteredInventory.slice(0, 30).map((item) => {
                const isSel = (selectedVariantId || inventory[0]?.variant_id) === item.variant_id;
                return (
                  <Pressable
                    key={item.variant_id}
                    onPress={() => {
                      setSelectedVariantId(item.variant_id);
                      const c = parseInt(cartons, 10) || 0;
                      const l = parseInt(looseUnits, 10) || 0;
                      const calcCredit = (c * item.price_per_carton) + (l * item.price_per_unit);
                      setCreditAmount(calcCredit > 0 ? String(calcCredit) : '');
                    }}
                    style={[
                      styles.chip,
                      isSel && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <AppText variant="caption" color={isSel ? 'onPrimary' : 'text'}>
                      {getDisplayName(item.product_name, item.size_label)}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Quantities */}
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Input
                  label="Cartons Returned"
                  keyboardType="numeric"
                  value={cartons}
                  onChangeText={(val) => handleCartonOrLooseChange(val, looseUnits)}
                  placeholder="0"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Bottles Returned"
                  keyboardType="numeric"
                  value={looseUnits}
                  onChangeText={(val) => handleCartonOrLooseChange(cartons, val)}
                  placeholder="0"
                />
              </View>
            </View>

            {/* Credit Amount */}
            <View style={{ marginTop: 8 }}>
              <Input
                label="Amount to Credit Customer (Rs.)"
                keyboardType="numeric"
                value={creditAmount}
                onChangeText={setCreditAmount}
                placeholder="Auto calculated"
              />
            </View>

            {/* Reason Chips */}
            <AppText variant="caption" muted style={{ marginTop: 12 }}>
              Reason for Return
            </AppText>
            <View style={styles.reasonsGrid}>
              {[
                'Customer overstock return',
                'Wrong flavor delivered',
                'Broken / Leaking bottles',
                'Expired / Flat drink',
                'Shop owner request',
              ].map((r) => {
                const isSel = reason === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setReason(r)}
                    style={[
                      styles.reasonChip,
                      isSel && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <AppText variant="caption" color={isSel ? 'onPrimary' : 'text'}>
                      {r}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Optional Notes */}
            <View style={{ marginTop: 8 }}>
              <Input
                label="Optional Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Returned with delivery driver"
              />
            </View>
          </ScrollView>

          {/* Action Button */}
          <View style={styles.actions}>
            <Button
              label={loading ? 'Processing...' : 'Confirm Return & Credit Loan Khata'}
              variant="primary"
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
    marginBottom: 8,
  },
  scroll: {
    maxHeight: 460,
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 36,
    marginTop: 6,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 0,
  },
  chipsScroll: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d5dee4',
    marginRight: 6,
  },
  row: {
    flexDirection: 'row',
    marginTop: 8,
  },
  reasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  reasonChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d5dee4',
  },
  actions: {
    marginTop: 12,
  },
});
