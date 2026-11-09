import React, { useState } from 'react';
import { View, StyleSheet, Modal, ScrollView, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/useTheme';
import { WholesalerCustomer } from '@/types/wholesaler.types';
import { formatMoney } from '@/utils/formatMoney';

interface RecordPaymentModalProps {
  visible: boolean;
  customers: WholesalerCustomer[];
  onClose: () => void;
  onSubmit: (params: {
    customerId: string;
    amount: number;
    paymentMethod: string;
    referenceNo?: string;
    notes?: string;
  }) => Promise<void>;
}

export function RecordPaymentModal({ visible, customers, onClose, onSubmit }: RecordPaymentModalProps) {
  const { colors } = useTheme();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'cheque'>('cash');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedCust = customers.find((c) => c.id === (selectedCustomerId || customers[0]?.id));

  const handleSubmit = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a payment amount greater than zero.');
      return;
    }
    const custId = selectedCustomerId || customers[0]?.id;
    if (!custId) {
      Alert.alert('Required', 'Please select a customer.');
      return;
    }

    try {
      setLoading(true);
      await onSubmit({
        customerId: custId,
        amount: amt,
        paymentMethod,
        referenceNo: refNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setAmount('');
      setRefNo('');
      setNotes('');
      onClose();
    } catch (err: any) {
      Alert.alert('Payment Recording Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <View>
              <AppText variant="title">Record Customer Payment</AppText>
              <AppText variant="caption" muted>Clear or reduce customer Loan Khata debt</AppText>
            </View>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Customer Selection */}
          <AppText variant="caption" muted style={{ marginTop: 12 }}>Select Customer Shop</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalChips}>
            {customers.map((c) => {
              const sel = (selectedCustomerId || customers[0]?.id) === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setSelectedCustomerId(c.id)}
                  style={[
                    styles.chip,
                    sel ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border },
                  ]}
                >
                  <AppText variant="caption" color={sel ? 'onPrimary' : 'text'}>
                    {c.name} {c.current_balance > 0 ? `(${formatMoney(c.current_balance)})` : ''}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedCust && (
            <View style={styles.balanceInfo}>
              <AppText variant="caption">Outstanding Loan Khata Balance: </AppText>
              <AppText variant="caption" style={{ fontWeight: '700', color: colors.error }}>
                {formatMoney(selectedCust.current_balance)}
              </AppText>
            </View>
          )}

          <View style={{ marginTop: 10 }}>
            <Input
              label="Amount Received (Rs.) *"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="e.g. 5000"
            />
          </View>

          {/* Payment Method */}
          <AppText variant="caption" muted style={{ marginTop: 10 }}>Payment Mode</AppText>
          <View style={styles.chipsRow}>
            {(['cash', 'bank_transfer', 'cheque'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setPaymentMethod(m)}
                style={[
                  styles.chip,
                  paymentMethod === m ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border },
                ]}
              >
                <AppText variant="caption" color={paymentMethod === m ? 'onPrimary' : 'text'}>
                  {m.toUpperCase()}
                </AppText>
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: 10 }}>
            <Input
              label="Reference / Slip Number (Optional)"
              value={refNo}
              onChangeText={setRefNo}
              placeholder="e.g. TRX-102934"
            />
          </View>

          <View style={styles.actions}>
            <Button
              label={loading ? 'Recording...' : 'Record Payment'}
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  horizontalChips: { flexDirection: 'row', marginVertical: 8 },
  chipsRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, marginRight: 8 },
  balanceInfo: { padding: 8, backgroundColor: '#fff3f3', borderRadius: 8, flexDirection: 'row', marginVertical: 6 },
  actions: { marginTop: 16 },
});
