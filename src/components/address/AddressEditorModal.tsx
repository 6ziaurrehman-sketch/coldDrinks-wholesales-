import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { LocationPinPicker } from '@/components/shop/LocationPinPicker';
import { AppText, Button, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme/tokens';
import type { CustomerAddress, ServiceableZoneResult } from '@/types/database.types';
import { formatMoney } from '@/utils/formatMoney';
import { formatPhoneAsYouType, isValidPakistanPhone, normalizePhone } from '@/utils/phone';

export interface AddressEditorModalProps {
  visible: boolean;
  address: CustomerAddress | null;
  onClose: () => void;
  onCheckServiceable: (params: {
    lat: number | null;
    lng: number | null;
    area?: string;
    fullAddress?: string;
  }) => Promise<ServiceableZoneResult>;
  onSave: (params: {
    addressId?: string;
    label: string;
    fullAddress: string;
    lat: number | null;
    lng: number | null;
    area?: string;
    contactName?: string;
    contactPhone?: string;
    instructions?: string;
    isDefault?: boolean;
    expectedUpdatedAt?: string;
  }) => Promise<unknown>;
}

export function AddressEditorModal({
  visible,
  address,
  onClose,
  onCheckServiceable,
  onSave,
}: AddressEditorModalProps) {
  const theme = useTheme();

  const [label, setLabel] = useState(address?.label ?? 'Main Store');
  const [fullAddress, setFullAddress] = useState(address?.full_address ?? '');
  const [area, setArea] = useState('');
  const [lat, setLat] = useState<number | null>(address?.lat ?? null);
  const [lng, setLng] = useState<number | null>(address?.lng ?? null);
  const [contactName, setContactName] = useState(address?.contact_name ?? '');
  const [contactPhone, setContactPhone] = useState(
    address?.contact_phone ? formatPhoneAsYouType(address.contact_phone) : '',
  );
  const [instructions, setInstructions] = useState(address?.instructions ?? '');
  const [isDefault, setIsDefault] = useState(Boolean(address?.is_default));

  const [checkingZone, setCheckingZone] = useState(false);
  const [resolvedZone, setResolvedZone] = useState<ServiceableZoneResult | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Re-check serviceability when address or coordinates change
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!fullAddress.trim() && lat === null) {
        setResolvedZone(null);
        setServiceError(null);
        return;
      }

      setCheckingZone(true);
      setServiceError(null);
      try {
        const res = await onCheckServiceable({
          lat,
          lng,
          area: area.trim(),
          fullAddress: fullAddress.trim(),
        });
        setResolvedZone(res);
        setServiceError(null);
      } catch (err: unknown) {
        setResolvedZone(null);
        const msg = err instanceof Error ? err.message : t('addresses.serviceAreaError');
        setServiceError(msg);
      } finally {
        setCheckingZone(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [fullAddress, area, lat, lng, onCheckServiceable]);

  const handleSubmit = async () => {
    if (!fullAddress.trim()) {
      setErrorMsg('Please enter the full street address.');
      return;
    }

    let normalizedPhone: string | undefined = undefined;
    if (contactPhone.trim()) {
      const norm = normalizePhone(contactPhone);
      if (!norm || !isValidPakistanPhone(contactPhone)) {
        setErrorMsg('Please enter a valid 11-digit Pakistan mobile number.');
        return;
      }
      normalizedPhone = norm;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      await onSave({
        addressId: address?.id,
        label: label.trim() || 'Store Address',
        fullAddress: fullAddress.trim(),
        lat,
        lng,
        area: area.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactPhone: normalizedPhone,
        instructions: instructions.trim() || undefined,
        isDefault,
        expectedUpdatedAt: address?.updated_at,
      });

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save address.';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.dialogCard, { backgroundColor: theme.colors.surface }]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            <AppText variant="subtitle">
              {address ? t('addresses.editAddress') : t('addresses.addAddress')}
            </AppText>

            {errorMsg ? (
              <View style={[styles.alertBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                <AppText variant="caption" color={theme.colors.error}>
                  {errorMsg}
                </AppText>
              </View>
            ) : null}

            {/* Address Label */}
            <Input
              label={t('addresses.label')}
              placeholder={t('addresses.labelPlaceholder')}
              value={label}
              onChangeText={setLabel}
            />

            {/* Area / Market */}
            <Input
              label={t('addresses.area')}
              placeholder={t('addresses.areaPlaceholder')}
              value={area}
              onChangeText={setArea}
            />

            {/* Full Street Address & GPS Pin */}
            <LocationPinPicker
              latitude={lat}
              longitude={lng}
              address={fullAddress}
              onCoordinatesChange={(newLat, newLng) => {
                setLat(newLat);
                setLng(newLng);
              }}
              onAddressChange={setFullAddress}
            />

            {/* Live Service Zone Resolution Feedback */}
            {checkingZone ? (
              <View style={[styles.zoneBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                <AppText variant="caption" muted>
                  Checking delivery service zone...
                </AppText>
              </View>
            ) : resolvedZone ? (
              <View style={[styles.zoneBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                <AppText variant="subtitle" color={theme.colors.success}>
                  ✓ Serviceable: {resolvedZone.zoneName}
                </AppText>
                <AppText variant="caption" muted>
                  {t('addresses.deliveryFee', { fee: formatMoney(resolvedZone.fee) })} •{' '}
                  {t('addresses.minOrder', { amount: formatMoney(resolvedZone.minOrderAmount) })}
                </AppText>
              </View>
            ) : serviceError ? (
              <View style={[styles.zoneBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                <AppText variant="caption" color={theme.colors.error}>
                  {serviceError}
                </AppText>
              </View>
            ) : null}

            {/* Contact Person */}
            <Input
              label={t('addresses.contactName')}
              placeholder="e.g. Aslam Khan"
              value={contactName}
              onChangeText={setContactName}
            />

            {/* Contact Phone */}
            <Input
              label={t('addresses.contactPhone')}
              placeholder="0300 1234567"
              keyboardType="phone-pad"
              value={contactPhone}
              onChangeText={(txt) => setContactPhone(formatPhoneAsYouType(txt))}
            />

            {/* Gate / Unloading Instructions */}
            <Input
              label={t('addresses.instructions')}
              placeholder={t('addresses.instructionsPlaceholder')}
              multiline
              numberOfLines={2}
              value={instructions}
              onChangeText={setInstructions}
            />

            {/* Default Address Toggle */}
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <AppText>{t('addresses.setAsDefault')}</AppText>
                <AppText variant="caption" muted>
                  Used automatically for fast checkout and slot dispatch.
                </AppText>
              </View>
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <View style={styles.actionCol}>
                <Button
                  label={t('common.cancel')}
                  variant="ghost"
                  onPress={onClose}
                  disabled={saving}
                />
              </View>
              <View style={styles.actionCol}>
                <Button
                  label={t('addresses.saveAddress')}
                  variant="primary"
                  loading={saving}
                  disabled={saving || !fullAddress.trim() || Boolean(serviceError)}
                  onPress={() => {
                    void handleSubmit();
                  }}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dialogCard: {
    borderTopStartRadius: radius.xl,
    borderTopEndRadius: radius.xl,
    maxHeight: '88%',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  alertBox: {
    padding: spacing.sm,
    borderRadius: radius.xs,
  },
  zoneBox: {
    padding: spacing.md,
    borderRadius: radius.sm,
    gap: spacing.xxs,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  switchInfo: {
    flex: 1,
    marginEnd: spacing.sm,
    gap: spacing.xxs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionCol: {
    flex: 1,
  },
});
