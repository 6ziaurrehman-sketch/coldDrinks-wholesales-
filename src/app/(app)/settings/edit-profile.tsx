import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText, Button, Card } from '@/components/ui';
import { useShopStore } from '@/store/shopStore';
import { useSession } from '@/auth/SessionProvider';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';

export default function EditProfileScreen() {
  const theme = useTheme();
  const shop = useShopStore((s) => s.shop);
  const updateShop = useShopStore((s) => s.updateShop);
  const { profile } = useSession();

  const [shopName, setShopName] = useState(shop?.name || '');
  const [businessType, setBusinessType] = useState(shop?.business_type || 'Retail Grocery');
  const [city, setCity] = useState(shop?.city || 'Karachi');
  const [area, setArea] = useState(shop?.area || '');
  const [ownerName, setOwnerName] = useState(shop?.owner_name || profile?.full_name || '');
  const [phone, setPhone] = useState(shop?.phone || profile?.phone || '');
  const [altPhone, setAltPhone] = useState(shop?.alt_phone || '');
  const [email, setEmail] = useState(shop?.email || profile?.email || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!shop) return;
    if (!shopName.trim()) {
      Alert.alert('Validation Error', 'Shop name cannot be empty.');
      return;
    }

    setSubmitting(true);
    try {
      await updateShop({
        name: shopName.trim(),
        businessType: businessType.trim(),
        city: city.trim(),
        area: area.trim(),
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        altPhone: altPhone.trim(),
        email: email.trim(),
      });

      Alert.alert('Profile Saved', 'Your shop profile has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not update profile.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title="Edit Shop & Owner Profile" onBack={router.back}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Shop Info Card */}
        <Card style={styles.card}>
          <AppText variant="subtitle">Shop Information</AppText>

          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.label}>Shop Name</AppText>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
              value={shopName}
              onChangeText={setShopName}
            />
          </View>

          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.label}>Business Type</AppText>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
              value={businessType}
              onChangeText={setBusinessType}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <AppText variant="caption" style={styles.label}>City</AppText>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
                value={city}
                onChangeText={setCity}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <AppText variant="caption" style={styles.label}>Area / Market</AppText>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
                value={area}
                onChangeText={setArea}
              />
            </View>
          </View>
        </Card>

        {/* Owner Info Card */}
        <Card style={styles.card}>
          <AppText variant="subtitle">Owner & Contact Details</AppText>

          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.label}>Owner Full Name</AppText>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
              value={ownerName}
              onChangeText={setOwnerName}
            />
          </View>

          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.label}>Primary Phone (Registered)</AppText>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.label}>Alternative Phone</AppText>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
              value={altPhone}
              onChangeText={setAltPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.label}>Email Address</AppText>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </Card>

        <Button
          label={submitting ? 'Saving...' : 'Save Profile Changes'}
          variant="primary"
          onPress={handleSave}
          disabled={submitting}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    padding: spacing.md,
    gap: spacing.md,
  },
  inputGroup: {
    gap: spacing.xxs,
  },
  label: {
    fontWeight: '700',
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
