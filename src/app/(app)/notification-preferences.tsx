import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  TextInput,
  Linking,
} from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Button, Card } from '@/components/ui';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore, selectRole } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import type { NotificationPreferences } from '@/types/notifications.types';

const DEFAULT_PREFS: NotificationPreferences = {
  ordersEnabled: true,
  deliveryEnabled: true,
  paymentsEnabled: true,
  offersEnabled: true,
  messagesEnabled: true,
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  timezone: 'Asia/Karachi',
};

export default function NotificationPreferencesScreen() {
  const theme = useTheme();
  const { activeShopId } = useAuthStore();
  const role = useAuthStore(selectRole);
  const {
    preferences,
    loading,
    permissionStatus,
    updatePreferences,
  } = useNotificationStore();

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  const currentPrefs = preferences ?? DEFAULT_PREFS;
  const quietHoursStart = customStart ?? currentPrefs.quietHoursStart;
  const quietHoursEnd = customEnd ?? currentPrefs.quietHoursEnd;

  const handleToggle = useCallback(
    async (key: keyof NotificationPreferences, value: boolean) => {
      if (!activeShopId) return;
      setSaveSuccess(false);
      try {
        await updatePreferences(activeShopId, { [key]: value });
        setSaveSuccess(true);
      } catch (err) {
        console.warn('[NotificationPreferences] Save error:', err);
      }
    },
    [activeShopId, updatePreferences],
  );

  const handleTimeBlur = useCallback(
    async (key: 'quietHoursStart' | 'quietHoursEnd', val: string) => {
      if (!activeShopId) return;
      const cleanTime = val.trim();
      try {
        await updatePreferences(activeShopId, { [key]: cleanTime });
        setSaveSuccess(true);
      } catch (err) {
        console.warn('[NotificationPreferences] Time save error:', err);
      }
    },
    [activeShopId, updatePreferences],
  );

  const handleOpenSettings = () => {
    void Linking.openSettings();
  };

  const isStaff = role === 'staff';

  return (
    <Screen title={t('notificationPreferences.title')} onBack={router.back}>
      <ScreenState
        status={loading ? 'loading' : 'data'}
        data={
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Permission Denied Banner */}
            {permissionStatus === 'denied' && (
              <Card
                style={[
                  styles.card,
                  { backgroundColor: theme.colors.warning + '12', borderColor: theme.colors.warning },
                ]}
              >
                <AppText variant="subtitle" color={theme.colors.warning}>
                  🔔 Push Notifications Disabled
                </AppText>
                <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
                  Enable notifications in your device settings to receive real-time order and delivery alerts.
                </AppText>
                <View style={{ marginTop: 10 }}>
                  <Button
                    label={t('notifications.openSettings')}
                    variant="primary"
                    onPress={handleOpenSettings}
                  />
                </View>
              </Card>
            )}

            {/* Notification Categories Section */}
            <AppText variant="title" style={styles.sectionTitle}>
              {t('notificationPreferences.categoriesSection')}
            </AppText>

            {/* 1. Orders */}
            <Card style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, marginEnd: 12 }}>
                  <AppText variant="subtitle">📦 {t('notificationPreferences.ordersTitle')}</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                    {t('notificationPreferences.ordersDesc')}
                  </AppText>
                </View>
                <Switch
                  value={currentPrefs.ordersEnabled}
                  onValueChange={(val) => handleToggle('ordersEnabled', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>
            </Card>

            {/* 2. Delivery */}
            <Card style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, marginEnd: 12 }}>
                  <AppText variant="subtitle">🚚 {t('notificationPreferences.deliveryTitle')}</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                    {t('notificationPreferences.deliveryDesc')}
                  </AppText>
                </View>
                <Switch
                  value={currentPrefs.deliveryEnabled}
                  onValueChange={(val) => handleToggle('deliveryEnabled', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>
            </Card>

            {/* 3. Payments (Hidden for staff) */}
            {!isStaff && (
              <Card style={styles.card}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, marginEnd: 12 }}>
                    <AppText variant="subtitle">💳 {t('notificationPreferences.paymentsTitle')}</AppText>
                    <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                      {t('notificationPreferences.paymentsDesc')}
                    </AppText>
                  </View>
                  <Switch
                    value={currentPrefs.paymentsEnabled}
                    onValueChange={(val) => handleToggle('paymentsEnabled', val)}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  />
                </View>
              </Card>
            )}

            {/* 4. Special Offers */}
            <Card style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, marginEnd: 12 }}>
                  <AppText variant="subtitle">🎉 {t('notificationPreferences.offersTitle')}</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                    {t('notificationPreferences.offersDesc')}
                  </AppText>
                </View>
                <Switch
                  value={currentPrefs.offersEnabled}
                  onValueChange={(val) => handleToggle('offersEnabled', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>
            </Card>

            {/* 5. Messages */}
            <Card style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, marginEnd: 12 }}>
                  <AppText variant="subtitle">💬 {t('notificationPreferences.messagesTitle')}</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                    {t('notificationPreferences.messagesDesc')}
                  </AppText>
                </View>
                <Switch
                  value={currentPrefs.messagesEnabled}
                  onValueChange={(val) => handleToggle('messagesEnabled', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>
            </Card>

            {/* Quiet Hours Section */}
            <AppText variant="title" style={styles.sectionTitle}>
              {t('notificationPreferences.quietHoursSection')}
            </AppText>

            <Card style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, marginEnd: 12 }}>
                  <AppText variant="subtitle">🌙 {t('notificationPreferences.quietHoursTitle')}</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                    {t('notificationPreferences.quietHoursDesc')}
                  </AppText>
                </View>
                <Switch
                  value={currentPrefs.quietHoursEnabled}
                  onValueChange={(val) => handleToggle('quietHoursEnabled', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>

              {currentPrefs.quietHoursEnabled && (
                <View style={[styles.quietHoursInputsRow, { borderTopColor: theme.colors.border }]}>
                  <View style={styles.timeInputCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('notificationPreferences.startTime')}
                    </AppText>
                    <TextInput
                      style={[
                        styles.timeInput,
                        { borderColor: theme.colors.border, color: theme.colors.text },
                      ]}
                      value={quietHoursStart}
                      onChangeText={(val) => setCustomStart(val)}
                      onBlur={() => handleTimeBlur('quietHoursStart', quietHoursStart)}
                      placeholder="22:00"
                      placeholderTextColor={theme.colors.textMuted}
                      maxLength={5}
                    />
                  </View>

                  <View style={styles.timeInputCol}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('notificationPreferences.endTime')}
                    </AppText>
                    <TextInput
                      style={[
                        styles.timeInput,
                        { borderColor: theme.colors.border, color: theme.colors.text },
                      ]}
                      value={quietHoursEnd}
                      onChangeText={(val) => setCustomEnd(val)}
                      onBlur={() => handleTimeBlur('quietHoursEnd', quietHoursEnd)}
                      placeholder="08:00"
                      placeholderTextColor={theme.colors.textMuted}
                      maxLength={5}
                    />
                  </View>
                </View>
              )}
            </Card>

            {saveSuccess && (
              <AppText
                variant="caption"
                color={theme.colors.success}
                style={{ textAlign: 'center', marginTop: 12, fontWeight: '600' }}
              >
                ✅ {t('notificationPreferences.saveSuccess')}
              </AppText>
            )}
          </ScrollView>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quietHoursInputsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  timeInputCol: {
    flex: 1,
  },
  timeInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
