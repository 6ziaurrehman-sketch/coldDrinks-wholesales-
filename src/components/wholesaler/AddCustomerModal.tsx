import React, { useState } from 'react';
import { View, StyleSheet, Modal, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/useTheme';
import { WholesalerCustomer } from '@/types/wholesaler.types';

interface AddCustomerModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (customer: {
    name: string;
    owner_name?: string;
    phone?: string;
    address?: string;
    area?: string;
    opening_balance?: number;
    notes?: string;
  }) => Promise<WholesalerCustomer>;
  onCustomerAdded?: (customer: WholesalerCustomer) => void;
}

export function AddCustomerModal({ visible, onClose, onSubmit, onCustomerAdded }: AddCustomerModalProps) {
  const { colors } = useTheme();

  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!shopName.trim()) {
      Alert.alert('Required Field', 'Please enter the retail shop / customer name.');
      return;
    }

    try {
      setLoading(true);
      const newCust = await onSubmit({
        name: shopName.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        opening_balance: parseFloat(openingBalance) || 0,
      });

      // Reset
      setShopName('');
      setPhone('');
      setAddress('');
      setOpeningBalance('');

      if (onCustomerAdded) {
        onCustomerAdded(newCust);
      }
      onClose();
    } catch (err: any) {
      Alert.alert('Failed to Add Customer', err.message);
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
              <AppText variant="title">Add Shop / Customer</AppText>
              <AppText variant="caption" muted>Register local retail buyer profile</AppText>
            </View>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={{ marginTop: 12 }}>
            <Input
              label="Shop Name *"
              value={shopName}
              onChangeText={setShopName}
              placeholder="e.g. Al-Rehman General Store"
            />
          </View>

          <View style={{ marginTop: 10 }}>
            <Input
              label="Phone Number (Optional)"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. 0300 1234567"
            />
          </View>

          <View style={{ marginTop: 10 }}>
            <Input
              label="Shop Address / Market (Optional)"
              value={address}
              onChangeText={setAddress}
              placeholder="e.g. Shop #4, Bismillah Chowk"
            />
          </View>

          <View style={{ marginTop: 10 }}>
            <Input
              label="Opening Loan Khata Balance (Optional)"
              keyboardType="numeric"
              value={openingBalance}
              onChangeText={setOpeningBalance}
              placeholder="Rs. 0"
            />
          </View>

          <View style={styles.actions}>
            <Button
              label={loading ? 'Registering...' : 'Save Customer'}
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
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { marginTop: 20 },
});
