import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText, Button, Card } from '@/components/ui';
import { PasswordStrengthMeter } from '@/components/settings/PasswordStrengthMeter';
import { calculatePasswordStrength } from '@/lib/settingsService';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';

export default function ChangePasswordScreen() {
  const theme = useTheme();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [logoutOtherSessions, setLogoutOtherSessions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!currentPassword) {
      setErrorMsg('Current password is required.');
      return;
    }

    const strength = calculatePasswordStrength(newPassword);
    if (strength.score < 2) {
      setErrorMsg('New password is too weak. Please meet more security requirements.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation do not match.');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg('New password cannot be the same as your current password.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      // Re-authenticate / verify current password with supabase
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        throw new Error('User session not found.');
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error('Current password is incorrect.');
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      Alert.alert(
        'Password Updated',
        logoutOtherSessions
          ? 'Your password has been changed and all other active sessions have been signed out.'
          : 'Your password has been changed successfully.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title={t('settings.changePassword')} onBack={router.back}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <AppText variant="subtitle">Update Password</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>
            Ensure your account is protected with a strong, unique password.
          </AppText>

          {/* Current Password */}
          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.label}>
              Current Password
            </AppText>
            <View
              style={[
                styles.passwordRow,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted },
              ]}
            >
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                secureTextEntry={!showCurrent}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                placeholderTextColor={theme.colors.textMuted}
              />
              <Pressable onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>
                <AppText variant="caption">{showCurrent ? '🙈' : '👁️'}</AppText>
              </Pressable>
            </View>
          </View>

          {/* New Password */}
          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.label}>
              New Password
            </AppText>
            <View
              style={[
                styles.passwordRow,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted },
              ]}
            >
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                secureTextEntry={!showNew}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new password"
                placeholderTextColor={theme.colors.textMuted}
              />
              <Pressable onPress={() => setShowNew(!showNew)} style={styles.eyeBtn}>
                <AppText variant="caption">{showNew ? '🙈' : '👁️'}</AppText>
              </Pressable>
            </View>
            <PasswordStrengthMeter password={newPassword} />
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.label}>
              Confirm New Password
            </AppText>
            <View
              style={[
                styles.passwordRow,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted },
              ]}
            >
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                secureTextEntry={!showConfirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter new password"
                placeholderTextColor={theme.colors.textMuted}
              />
              <Pressable onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                <AppText variant="caption">{showConfirm ? '🙈' : '👁️'}</AppText>
              </Pressable>
            </View>
          </View>

          {/* Logout other sessions checkbox */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setLogoutOtherSessions(!logoutOtherSessions)}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: theme.colors.primary,
                  backgroundColor: logoutOtherSessions ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              {logoutOtherSessions && <AppText color="#FFFFFF" style={{ fontSize: 11 }}>✓</AppText>}
            </View>
            <AppText variant="caption" color={theme.colors.textMuted} style={{ flex: 1 }}>
              Log out of all other active sessions and devices
            </AppText>
          </Pressable>

          {errorMsg && (
            <AppText variant="caption" color={theme.colors.error}>
              ⚠️ {errorMsg}
            </AppText>
          )}

          <View style={{ marginTop: spacing.xs }}>
            <Button
              label={submitting ? 'Updating...' : 'Change Password'}
              variant="primary"
              onPress={handleSubmit}
              disabled={submitting}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  eyeBtn: {
    padding: 6,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
