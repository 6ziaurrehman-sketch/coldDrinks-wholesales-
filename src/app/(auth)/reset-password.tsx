import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { radius, spacing } from '@/theme/tokens';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const showToast = useUiStore((s) => s.showToast);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    let hasError = false;

    if (!password || password.length < 6) {
      setPasswordError('Password must contain at least 6 characters.');
      hasError = true;
    }

    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      hasError = true;
    }

    if (hasError) return;

    setIsSubmitting(true);
    setGeneralError(undefined);

    try {
      await updatePassword(password);
      showToast('Password updated successfully. Please sign in.', 'success');
      router.replace('/(auth)/login');
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <View style={styles.header}>
              <AppText variant="title">Set New Password</AppText>
              <AppText muted>Create a strong password to secure your wholesale ordering account.</AppText>
            </View>

            {generalError ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={[styles.errorBanner, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.error }]}>
                <AppText variant="caption" color={theme.colors.error}>
                  {generalError}
                </AppText>
              </View>
            ) : null}

            <Card style={styles.card}>
              <Input
                label={t('auth.newPassword')}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  setPasswordError(undefined);
                }}
                error={passwordError}
                secureTextEntry
              />

              <Input
                label={t('auth.confirmPassword')}
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChangeText={(val) => {
                  setConfirmPassword(val);
                  setConfirmError(undefined);
                }}
                error={confirmError}
                secureTextEntry
              />

              <Button
                label="Update Password"
                variant="primary"
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={isSubmitting}
              />
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
  },
});
