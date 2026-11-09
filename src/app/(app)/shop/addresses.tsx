import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { ScreenState } from '@/components/ui/ScreenState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useTheme } from '@/hooks/useTheme';
import { useAddressStore } from '@/store/addressStore';
import { useUiStore } from '@/store/uiStore';
import { t } from '@/i18n';
import { formatMoney } from '@/utils/formatMoney';
import { AddressEditorModal } from '@/components/address/AddressEditorModal';
import { Ionicons } from '@expo/vector-icons';
import { AppError, ErrorCode } from '@/lib/errors';
import { useRouter } from 'expo-router';

export default function AddressesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isOnline, showToast } = useUiStore();
  const { addresses, zones, defaultId, status, loadAddresses, removeAddress, setDefault, checkServiceable, updateAddress, addAddress } = useAddressStore();
  
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | undefined>(undefined);
  
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);
  
  const [menuVisibleFor, setMenuVisibleFor] = useState<string | null>(null);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const handleEdit = (id: string) => {
    if (!isOnline) {
      showToast(t('shop.offlineDisabled'), 'error');
      return;
    }
    setMenuVisibleFor(null);
    setEditingAddressId(id);
    setEditorVisible(true);
  };

  const handleDeletePrompt = (id: string) => {
    if (!isOnline) {
      showToast(t('shop.offlineDisabled'), 'error');
      return;
    }
    setMenuVisibleFor(null);
    setAddressToDelete(id);
    setDeleteDialogVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!addressToDelete) return;
    try {
      await removeAddress(addressToDelete);
      setDeleteDialogVisible(false);
      setAddressToDelete(null);
    } catch (e: any) {
      setDeleteDialogVisible(false);
      setAddressToDelete(null);
      if (e instanceof AppError && e.code === ErrorCode.CUSTOM_RPC_ERROR && e.message.includes('ADDRESS_IN_USE')) {
        showToast(t('addresses.inUseError'), 'error');
      } else {
        showToast(t('common.errorTitle'), 'error');
      }
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!isOnline) {
      showToast(t('shop.offlineDisabled'), 'error');
      return;
    }
    setMenuVisibleFor(null);
    try {
      await setDefault(id);
    } catch {
      showToast(t('common.errorTitle'), 'error');
    }
  };

  const getZone = (zoneId: string | null) => {
    if (!zoneId) return null;
    return zones.find(z => z.id === zoneId);
  };

  const renderContent = () => (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.md }}>
      {!isOnline && (
        <View style={{ marginBottom: theme.spacing.md }}>
          <OfflineBanner />
        </View>
      )}
      
      {addresses.map(address => {
        const isDefault = address.id === defaultId;
        const zone = getZone(address.zone_id);
        const isServiceable = zone?.active === true;
        const showMenu = menuVisibleFor === address.id;

        return (
          <Card key={address.id} style={[styles.card, { marginBottom: theme.spacing.md }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Badge label={address.label} tone="neutral" />
                {isDefault && <Badge label={t('addresses.defaultBadge')} tone="primary" />}
              </View>
              <Pressable 
                onPress={() => setMenuVisibleFor(showMenu ? null : address.id)} 
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Options"
              >
                <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {showMenu && (
              <View style={[styles.menu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Pressable style={styles.menuItem} onPress={() => handleEdit(address.id)}>
                  <AppText variant="body" style={{ color: theme.colors.text }}>{t('addresses.editAddress')}</AppText>
                </Pressable>
                {!isDefault && (
                  <Pressable style={styles.menuItem} onPress={() => handleSetDefault(address.id)}>
                    <AppText variant="body" style={{ color: theme.colors.text }}>{t('addresses.setAsDefault')}</AppText>
                  </Pressable>
                )}
                <Pressable style={styles.menuItem} onPress={() => handleDeletePrompt(address.id)}>
                  <AppText variant="body" style={{ color: theme.colors.destructive }}>{t('common.cancel')}</AppText>
                </Pressable>
              </View>
            )}

            <View style={{ marginTop: theme.spacing.sm }}>
              <AppText variant="body" style={{ color: theme.colors.text }}>{address.full_address}</AppText>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.xs, gap: theme.spacing.xs }}>
                <Ionicons name="person-outline" size={16} color={theme.colors.textMuted} />
                <AppText variant="caption" style={{ color: theme.colors.textMuted }}>
                  {address.contact_name} • {address.contact_phone}
                </AppText>
              </View>

              {address.instructions && (
                <View style={[styles.instructionsBox, { backgroundColor: theme.colors.surfaceMuted, marginTop: theme.spacing.sm, padding: theme.spacing.xs, borderRadius: theme.radius.xs }]}>
                  <AppText variant="caption" style={{ color: theme.colors.textMuted }}>
                    {address.instructions}
                  </AppText>
                </View>
              )}
            </View>

            <View style={[styles.footer, { marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
              {isServiceable && zone ? (
                <View style={styles.zoneInfo}>
                  <AppText variant="caption" style={{ color: theme.colors.textMuted }}>{zone.name}</AppText>
                  <AppText variant="caption" style={{ color: theme.colors.text, marginStart: theme.spacing.xs }}>
                    {t('addresses.deliveryFee', { fee: formatMoney(zone.fee) })}
                  </AppText>
                </View>
              ) : (
                <View style={styles.zoneInfo}>
                  <Badge label={t('addressPicker.notServiceable') || 'Not Serviceable'} tone="error" />
                  <AppText variant="caption" style={{ color: theme.colors.textMuted, marginStart: theme.spacing.xs }}>
                    {t('addresses.serviceAreaError')}
                  </AppText>
                </View>
              )}

              {!isDefault && !showMenu && (
                <Pressable onPress={() => handleSetDefault(address.id)} hitSlop={8} accessibilityRole="button">
                  <AppText variant="caption" style={{ color: theme.colors.primary }}>
                    {t('addresses.setAsDefault')}
                  </AppText>
                </Pressable>
              )}
            </View>
          </Card>
        );
      })}

      <View style={{ marginTop: theme.spacing.md }}>
        <Button
          label={t('addresses.addAddress')}
          variant="primary"
          onPress={() => {
            if (!isOnline) {
              showToast(t('shop.offlineDisabled'), 'error');
              return;
            }
            setEditingAddressId(undefined);
            setEditorVisible(true);
          }}
        />
      </View>
    </ScrollView>
  );

  const currentEditingAddress = editingAddressId ? addresses.find(a => a.id === editingAddressId) || null : null;

  return (
    <Screen title={t('addresses.title')} onBack={router.back}>
      <ScreenState
        status={status}
        onRetry={() => loadAddresses()}
        loading={null} 
        empty={
          <EmptyState
            title={t('addresses.emptyTitle')}
            message={t('addresses.emptyBody')}
            actionLabel={t('addresses.addAddress')}
            onAction={() => {
              setEditingAddressId(undefined);
              setEditorVisible(true);
            }}
          />
        }
        error={
          <ErrorState message={t('common.errorFallback')} onRetry={() => loadAddresses()} />
        }
        data={addresses.length > 0 ? renderContent() : undefined}
      />

      <AddressEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        address={currentEditingAddress}
        onCheckServiceable={checkServiceable}
        onSave={async (params) => {
          if (params.addressId && currentEditingAddress) {
            await updateAddress(params.addressId, currentEditingAddress.updated_at, params);
          } else {
            await addAddress(params);
          }
          setEditorVisible(false);
        }}
      />

      <ConfirmDialog
        visible={deleteDialogVisible}
        title={t('addresses.deleteConfirmTitle')}
        message={t('addresses.deleteConfirmMessage')}
        confirmLabel={t('common.confirm')}
        destructive
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialogVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menu: {
    position: 'absolute',
    top: 24,
    end: 0,
    borderWidth: 1,
    borderRadius: 8,
    zIndex: 10,
    minWidth: 120,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  instructionsBox: {
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  zoneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  }
});
