import React, { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/hooks/useTheme';
import { useAddressStore } from '@/store/addressStore';
import { formatMoney } from '@/utils/formatMoney';
import { t } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';
import { AddressEditorModal } from './AddressEditorModal';
import { type CustomerAddress } from '@/types/database.types';

interface AddressPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (addressId: string) => void;
  selectedAddressId?: string | null;
}

export function AddressPickerSheet({ visible, onClose, onSelect, selectedAddressId }: AddressPickerSheetProps) {
  const theme = useTheme();
  const { addresses, zones, defaultId, setDefault } = useAddressStore();
  const [editorVisible, setEditorVisible] = useState(false);

  const getZoneForAddress = (zoneId: string | null) => {
    if (!zoneId) return null;
    return zones.find(z => z.id === zoneId);
  };

  const handleSelect = (address: CustomerAddress) => {
    if (!address.zone_id) return;
    const zone = getZoneForAddress(address.zone_id);
    if (zone && zone.active) {
      onSelect(address.id);
      onClose();
    }
  };

  const renderAddress = (address: CustomerAddress) => {
    const isSelected = address.id === selectedAddressId;
    const isDefault = address.id === defaultId;
    const zone = getZoneForAddress(address.zone_id);
    const isServiceable = zone?.active === true;

    return (
      <Card
        key={address.id}
        style={[
          styles.card,
          isSelected && { borderColor: theme.colors.primary, borderWidth: 2 },
          !isServiceable && { opacity: 0.6 }
        ]}
      >
        <Pressable
          style={styles.cardPressable}
          onPress={() => handleSelect(address)}
          disabled={!isServiceable}
          accessibilityRole="button"
          accessibilityLabel={address.label}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <AppText variant="subtitle" style={{ color: theme.colors.text }}>{address.label}</AppText>
              {isDefault && <Badge label={t('addressPicker.defaultBadge') || 'Default'} tone="primary" />}
            </View>
            <View style={styles.radioContainer}>
              {isSelected ? (
                <Ionicons name="radio-button-on" size={24} color={theme.colors.primary} />
              ) : (
                <Ionicons name="radio-button-off" size={24} color={theme.colors.border} />
              )}
            </View>
          </View>

          <AppText variant="body" style={{ color: theme.colors.textMuted, marginTop: theme.spacing.xs }}>
            {address.full_address}
          </AppText>
          <AppText variant="caption" style={{ color: theme.colors.textMuted, marginTop: theme.spacing.xxs }}>
            {address.contact_name}
          </AppText>

          <View style={[styles.footer, { marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
            {isServiceable && zone ? (
              <View style={styles.zoneInfo}>
                <AppText variant="caption" style={{ color: theme.colors.textMuted }}>{zone.name}</AppText>
                <AppText variant="caption" style={{ color: theme.colors.text, marginStart: theme.spacing.xs }}>
                  {t('addressPicker.deliveryFee', { fee: formatMoney(zone.fee) })}
                </AppText>
              </View>
            ) : (
              <View style={styles.zoneInfo}>
                <Badge label={t('addressPicker.notServiceable') || 'Not Serviceable'} tone="error" />
                <AppText variant="caption" style={{ color: theme.colors.textMuted, marginStart: theme.spacing.xs }}>
                  {t('addressPicker.notServiceableTooltip')}
                </AppText>
              </View>
            )}

            {!isDefault && (
              <Pressable onPress={() => setDefault(address.id)} hitSlop={8} accessibilityRole="button">
                <AppText variant="caption" style={{ color: theme.colors.primary }}>
                  {t('addressPicker.setAsDefault')}
                </AppText>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Card>
    );
  };

  const { checkServiceable, addAddress } = useAddressStore();

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title={t('addressPicker.title')}>
        <ScrollView style={styles.scroll} contentContainerStyle={{ padding: theme.spacing.md }}>
          {addresses.map(renderAddress)}
          
          <View style={{ marginTop: theme.spacing.md }}>
            <Button
              label={t('addressPicker.addNew')}
              variant="secondary"
              onPress={() => setEditorVisible(true)}
            />
          </View>
        </ScrollView>
      </BottomSheet>
      
      <AddressEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        address={null}
        onCheckServiceable={checkServiceable}
        onSave={async (params) => {
          await addAddress(params);
          setEditorVisible(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 500,
  },
  card: {
    marginBottom: 12,
  },
  cardPressable: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioContainer: {
    paddingStart: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  zoneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  }
});
