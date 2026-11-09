import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText, Button, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme/tokens';
import type { ShopContactInsert } from '@/types/database.types';
import { formatPhoneAsYouType, isValidPakistanPhone, normalizePhone } from '@/utils/phone';

export interface AddContactModalProps {
  visible: boolean;
  onClose: () => void;
  onAddContact: (contact: Omit<ShopContactInsert, 'shop_id'>) => Promise<unknown>;
}

export function AddContactModal({ visible, onClose, onAddContact }: AddContactModalProps) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [role, setRole] = useState('Receiving Manager');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMsg('Please enter contact person name.');
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !isValidPakistanPhone(phone)) {
      setErrorMsg('Please enter a valid 11-digit Pakistan mobile number.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      await onAddContact({
        name: name.trim(),
        role: role.trim() || 'Contact Person',
        phone: normalizedPhone,
        email: email.trim() || null,
        is_primary: isPrimary,
      });
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add contact.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setRole('Receiving Manager');
    setPhone('');
    setEmail('');
    setIsPrimary(false);
    setErrorMsg(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={handleClose}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          onPress={(e) => e.stopPropagation()}>
          <AppText variant="subtitle">{t('shop.addContact')}</AppText>

          {errorMsg ? (
            <View style={[styles.errorBox, { backgroundColor: theme.colors.surfaceMuted }]}>
              <AppText variant="caption" color={theme.colors.error}>
                {errorMsg}
              </AppText>
            </View>
          ) : null}

          <Input
            label="Contact Full Name"
            placeholder="e.g. Tariq Mehmood"
            value={name}
            onChangeText={(txt) => {
              setErrorMsg(null);
              setName(txt);
            }}
          />

          <Input
            label="Department / Designation"
            placeholder="e.g. Receiving / Storekeeper"
            value={role}
            onChangeText={setRole}
          />

          <Input
            label="Mobile Number"
            placeholder="0300 1234567"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(txt) => {
              setErrorMsg(null);
              setPhone(formatPhoneAsYouType(txt));
            }}
          />

          <Input
            label="Email Address (Optional)"
            placeholder="contact@shop.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <View style={styles.switchRow}>
            <AppText>Primary Delivery Contact</AppText>
            <Switch
              value={isPrimary}
              onValueChange={setIsPrimary}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            />
          </View>

          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label={t('common.cancel')} variant="ghost" onPress={handleClose} disabled={loading} />
            </View>
            <View style={styles.action}>
              <Button
                label="Add Contact"
                variant="primary"
                loading={loading}
                disabled={loading || !name.trim() || !phone.trim()}
                onPress={() => {
                  void handleSubmit();
                }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  errorBox: {
    padding: spacing.sm,
    borderRadius: spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xxs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  action: {
    flex: 1,
  },
});
