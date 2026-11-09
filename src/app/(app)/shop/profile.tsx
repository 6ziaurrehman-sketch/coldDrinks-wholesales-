import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { LocationPinPicker } from '@/components/shop/LocationPinPicker';
import { AddContactModal } from '@/components/shop/AddContactModal';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import {
  AppText,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  OfflineBanner,
} from '@/components/ui';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import type { UpdateShopPayload } from '@/lib/shopService';
import {
  selectCan,
  selectContacts,
  selectShop,
  useShopStore,
} from '@/store/shopStore';
import { radius, spacing } from '@/theme/tokens';
import type { Shop, ShopContact, ShopContactInsert } from '@/types/database.types';
import { formatNTNAsYouType, isValidNTN } from '@/utils/ntn';
import { formatPhoneAsYouType } from '@/utils/phone';

interface ShopProfileFormProps {
  shop: Shop;
  contacts: ShopContact[];
  canEdit: boolean;
  isOnline: boolean;
  onUpdate: (payload: UpdateShopPayload) => Promise<Shop>;
  onAddContact: (contact: Omit<ShopContactInsert, 'shop_id'>) => Promise<unknown>;
  onRemoveContact: (contactId: string) => Promise<void>;
  registerBackInterceptor: (interceptor: () => boolean) => void;
}

function ShopProfileForm({
  shop,
  contacts,
  canEdit,
  isOnline,
  onUpdate,
  onAddContact,
  onRemoveContact,
  registerBackInterceptor,
}: ShopProfileFormProps) {
  const theme = useTheme();

  // Edit mode & Dialog State
  const [isEditing, setIsEditing] = useState(false);
  const [hasDiscardDialog, setHasDiscardDialog] = useState(false);
  const [isContactModalVisible, setIsContactModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Form Fields initialized directly from shop prop
  const [name, setName] = useState(shop.name ?? '');
  const [ownerName, setOwnerName] = useState(shop.owner_name ?? '');
  const [phone, setPhone] = useState(formatPhoneAsYouType(shop.phone ?? ''));
  const [altPhone, setAltPhone] = useState(formatPhoneAsYouType(shop.alt_phone ?? ''));
  const [email, setEmail] = useState(shop.email ?? '');
  const [businessType, setBusinessType] = useState(shop.business_type ?? 'Retail Grocery');
  const [city, setCity] = useState(shop.city ?? 'Karachi');
  const [area, setArea] = useState(shop.area ?? '');
  const [address, setAddress] = useState(shop.address ?? '');
  const [lat, setLat] = useState<number | null>(shop.lat ?? null);
  const [lng, setLng] = useState<number | null>(shop.lng ?? null);
  const [ntn, setNtn] = useState(formatNTNAsYouType(shop.ntn ?? ''));
  const [strn, setStrn] = useState(shop.strn ?? '');
  const [taxRegistered, setTaxRegistered] = useState(Boolean(shop.tax_registered));
  const [deliveryInstructions, setDeliveryInstructions] = useState(
    shop.default_delivery_instructions ?? '',
  );
  const [approvalThreshold, setApprovalThreshold] = useState(
    shop.approval_threshold !== null && shop.approval_threshold !== undefined
      ? String(shop.approval_threshold)
      : '',
  );
  const [ntnError, setNtnError] = useState<string | null>(null);

  // Dirty state tracking
  const isDirty =
    name !== (shop.name ?? '') ||
    ownerName !== (shop.owner_name ?? '') ||
    email !== (shop.email ?? '') ||
    area !== (shop.area ?? '') ||
    address !== (shop.address ?? '') ||
    lat !== (shop.lat ?? null) ||
    lng !== (shop.lng ?? null) ||
    ntn !== formatNTNAsYouType(shop.ntn ?? '') ||
    strn !== (shop.strn ?? '') ||
    taxRegistered !== Boolean(shop.tax_registered) ||
    deliveryInstructions !== (shop.default_delivery_instructions ?? '');

  // Register interceptor for screen back button
  useEffect(() => {
    registerBackInterceptor(() => {
      if (isEditing && isDirty) {
        setHasDiscardDialog(true);
        return true; // intercept back
      }
      return false;
    });
  }, [isEditing, isDirty, registerBackInterceptor]);

  const handleNtnChange = (val: string) => {
    const formatted = formatNTNAsYouType(val);
    setNtn(formatted);
    if (formatted && formatted.length === 9 && !isValidNTN(formatted)) {
      setNtnError(t('shop.ntnInvalid'));
    } else {
      setNtnError(null);
    }
  };

  const handleSave = async () => {
    if (!isOnline) return;
    if (ntn && !isValidNTN(ntn)) {
      setNtnError(t('shop.ntnInvalid'));
      return;
    }

    setSaving(true);
    setSaveSuccessMsg(null);
    try {
      const parsedThreshold = approvalThreshold.trim() ? parseFloat(approvalThreshold) : null;
      await onUpdate({
        name: name.trim(),
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        altPhone: altPhone.trim(),
        email: email.trim(),
        businessType: businessType.trim(),
        city: city.trim(),
        area: area.trim(),
        lat,
        lng,
        ntn: ntn.trim() || undefined,
        strn: strn.trim() || undefined,
        taxRegistered,
        defaultDeliveryInstructions: deliveryInstructions.trim(),
        approvalThreshold: parsedThreshold,
      });

      setSaveSuccessMsg(t('shop.saveSuccess'));
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const resetFormFields = () => {
    setName(shop.name);
    setOwnerName(shop.owner_name ?? '');
    setPhone(formatPhoneAsYouType(shop.phone ?? ''));
    setAltPhone(formatPhoneAsYouType(shop.alt_phone ?? ''));
    setEmail(shop.email ?? '');
    setBusinessType(shop.business_type ?? 'Retail Grocery');
    setCity(shop.city ?? 'Karachi');
    setArea(shop.area ?? '');
    setAddress(shop.address ?? '');
    setLat(shop.lat ?? null);
    setLng(shop.lng ?? null);
    setNtn(formatNTNAsYouType(shop.ntn ?? ''));
    setStrn(shop.strn ?? '');
    setTaxRegistered(Boolean(shop.tax_registered));
    setDeliveryInstructions(shop.default_delivery_instructions ?? '');
    setApprovalThreshold(
      shop.approval_threshold !== null && shop.approval_threshold !== undefined
        ? String(shop.approval_threshold)
        : '',
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardView}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {/* Header card with Role badge & Edit Toggle */}
        <Card style={styles.topCard}>
          <View style={styles.topHeader}>
            <View style={styles.headerInfo}>
              <AppText variant="title">{shop.name || 'Shop Profile'}</AppText>
              <AppText muted>{shop.city || 'Pakistan'}</AppText>
            </View>
            {canEdit ? (
              <Button
                label={isEditing ? 'Cancel Edit' : t('shop.editProfile')}
                variant={isEditing ? 'ghost' : 'secondary'}
                onPress={() => {
                  if (isEditing && isDirty) {
                    setHasDiscardDialog(true);
                  } else {
                    setIsEditing(!isEditing);
                  }
                }}
              />
            ) : null}
          </View>

          {saveSuccessMsg ? (
            <View style={[styles.successBanner, { backgroundColor: theme.colors.surfaceMuted }]}>
              <AppText color={theme.colors.success}>{saveSuccessMsg}</AppText>
            </View>
          ) : null}

          {/* Offline disabled message */}
          {!isOnline && isEditing ? (
            <View style={[styles.offlineNotice, { backgroundColor: theme.colors.surfaceMuted }]}>
              <AppText variant="caption" color={theme.colors.warning}>
                {t('shop.offlineDisabled')}
              </AppText>
            </View>
          ) : null}
        </Card>

        {/* 1. Basic Information Card */}
        <Card style={styles.sectionCard}>
          <AppText variant="subtitle">{t('shop.basicSection')}</AppText>
          <Input
            label={t('shop.name')}
            value={name}
            editable={isEditing}
            onChangeText={setName}
          />
          <Input
            label={t('shop.ownerName')}
            value={ownerName}
            editable={isEditing}
            onChangeText={setOwnerName}
          />
          <Input
            label={t('shop.phone')}
            value={phone}
            editable={isEditing}
            keyboardType="phone-pad"
            onChangeText={(txt) => setPhone(formatPhoneAsYouType(txt))}
          />
          <Input
            label={t('shop.altPhone')}
            value={altPhone}
            editable={isEditing}
            keyboardType="phone-pad"
            onChangeText={(txt) => setAltPhone(formatPhoneAsYouType(txt))}
          />
          <Input
            label={t('shop.email')}
            value={email}
            editable={isEditing}
            keyboardType="email-address"
            autoCapitalize="none"
            onChangeText={setEmail}
          />
        </Card>

        {/* 2. Business & Tax Information Card */}
        <Card style={styles.sectionCard}>
          <AppText variant="subtitle">{t('shop.businessSection')}</AppText>
          <Input
            label={t('shop.businessType')}
            value={businessType}
            editable={isEditing}
            onChangeText={setBusinessType}
          />
          <View style={styles.row}>
            <View style={styles.col}>
              <Input
                label={t('shop.city')}
                value={city}
                editable={isEditing}
                onChangeText={setCity}
              />
            </View>
            <View style={styles.col}>
              <Input
                label={t('shop.area')}
                value={area}
                editable={isEditing}
                onChangeText={setArea}
              />
            </View>
          </View>

          <Input
            label={t('shop.ntn')}
            placeholder="1234567-8"
            value={ntn}
            editable={isEditing}
            keyboardType="numeric"
            onChangeText={handleNtnChange}
            error={ntnError ?? undefined}
            helper={t('shop.ntnHelper')}
          />

          <Input
            label={t('shop.strn')}
            placeholder="Sales tax number"
            value={strn}
            editable={isEditing}
            onChangeText={setStrn}
          />

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <AppText>{t('shop.taxRegistered')}</AppText>
              <AppText variant="caption" muted>
                Enables official FBR tax invoices and sales tax withholding deductions.
              </AppText>
            </View>
            <Switch
              value={taxRegistered}
              disabled={!isEditing}
              onValueChange={setTaxRegistered}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            />
          </View>
        </Card>

        {/* 3. Delivery Defaults & Approval Card */}
        <Card style={styles.sectionCard}>
          <AppText variant="subtitle">{t('shop.deliverySection')}</AppText>
          <Input
            label={t('shop.deliveryInstructions')}
            placeholder={t('shop.deliveryInstructionsPlaceholder')}
            multiline
            numberOfLines={3}
            value={deliveryInstructions}
            editable={isEditing}
            onChangeText={setDeliveryInstructions}
          />

          <Input
            label={t('approvalThreshold.amountLabel')}
            placeholder="e.g. 50000"
            keyboardType="numeric"
            value={approvalThreshold}
            editable={isEditing}
            onChangeText={setApprovalThreshold}
            helper={t('approvalThreshold.amountHelper')}
          />
        </Card>

        {/* 4. Location Pin Picker Card */}
        <LocationPinPicker
          latitude={lat}
          longitude={lng}
          address={address}
          editable={isEditing}
          onCoordinatesChange={(newLat, newLng) => {
            setLat(newLat);
            setLng(newLng);
          }}
          onAddressChange={setAddress}
        />

        {/* 5. Shop Contacts Card */}
        <Card style={styles.sectionCard}>
          <View style={styles.contactHeader}>
            <AppText variant="subtitle">{t('shop.contactsSection')}</AppText>
            {canEdit ? (
              <Button
                label={t('shop.addContact')}
                variant="ghost"
                onPress={() => setIsContactModalVisible(true)}
              />
            ) : null}
          </View>

          {contacts.length === 0 ? (
            <AppText muted>{t('shop.noContacts')}</AppText>
          ) : (
            contacts.map((c) => (
              <View
                key={c.id}
                style={[styles.contactItem, { borderColor: theme.colors.border }]}>
                <View style={styles.contactDetails}>
                  <View style={styles.contactNameRow}>
                    <AppText variant="subtitle">{c.name}</AppText>
                    {c.is_primary ? <Badge label="Primary" tone="success" /> : null}
                  </View>
                  <AppText variant="caption" muted>
                    {c.role} • {c.phone}
                  </AppText>
                  {c.email ? (
                    <AppText variant="caption" muted>
                      {c.email}
                    </AppText>
                  ) : null}
                </View>
                {canEdit ? (
                  <Button
                    label="Delete"
                    variant="ghost"
                    onPress={() => {
                      void onRemoveContact(c.id);
                    }}
                  />
                ) : null}
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      {/* Sticky Save Button (Shown when in edit mode) */}
      {isEditing ? (
        <View
          style={[
            styles.stickyFooter,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}>
          <Button
            label={t('shop.saveChanges')}
            variant="primary"
            loading={saving}
            disabled={saving || !isOnline || Boolean(ntnError)}
            onPress={() => {
              void handleSave();
            }}
          />
        </View>
      ) : null}

      {/* Discard Unsaved Changes Dialog */}
      <ConfirmDialog
        visible={hasDiscardDialog}
        title={t('shop.unsavedTitle')}
        message={t('shop.unsavedMessage')}
        confirmLabel={t('shop.discard')}
        cancelLabel={t('shop.keepEditing')}
        destructive
        onConfirm={() => {
          setHasDiscardDialog(false);
          setIsEditing(false);
          resetFormFields();
        }}
        onCancel={() => setHasDiscardDialog(false)}
      />

      {/* Add Contact Modal */}
      <AddContactModal
        visible={isContactModalVisible}
        onClose={() => setIsContactModalVisible(false)}
        onAddContact={async (contactData: Omit<ShopContactInsert, 'shop_id'>) => {
          await onAddContact(contactData);
        }}
      />
    </KeyboardAvoidingView>
  );
}

export default function ShopProfileScreen() {
  const isOnline = useNetworkStatus();

  // Store bindings
  const shop = useShopStore(selectShop);
  const contacts = useShopStore(selectContacts);
  const status = useShopStore((s) => s.status);
  const error = useShopStore((s) => s.error);
  const loadShop = useShopStore((s) => s.loadShop);
  const updateShop = useShopStore((s) => s.updateShop);
  const addContact = useShopStore((s) => s.addContact);
  const removeContact = useShopStore((s) => s.removeContact);
  const canEdit = useShopStore(selectCan('edit_shop_profile'));

  const [backInterceptor, setBackInterceptor] = useState<(() => boolean) | null>(null);

  // Load shop on mount
  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  const handleScreenBack = () => {
    if (backInterceptor && backInterceptor()) {
      return;
    }
    router.back();
  };

  return (
    <Screen title={t('shop.profileTitle')} onBack={handleScreenBack}>
      <OfflineBanner />

      <ScreenState
        status={status}
        errorActionLabel={error?.code === 'CONCURRENT_MODIFICATION' ? 'Reload Profile' : undefined}
        onRetry={() => {
          void loadShop();
        }}
        data={
          shop ? (
            <ShopProfileForm
              key={shop.id}
              shop={shop}
              contacts={contacts}
              canEdit={canEdit}
              isOnline={isOnline}
              onUpdate={updateShop}
              onAddContact={addContact}
              onRemoveContact={removeContact}
              registerBackInterceptor={setBackInterceptor}
            />
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.md,
    paddingBottom: 90,
  },
  topCard: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  successBanner: {
    padding: spacing.sm,
    borderRadius: radius.xs,
  },
  offlineNotice: {
    padding: spacing.sm,
    borderRadius: radius.xs,
  },
  sectionCard: {
    gap: spacing.md,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  col: {
    flex: 1,
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
  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactDetails: {
    flex: 1,
    gap: spacing.xxs,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
