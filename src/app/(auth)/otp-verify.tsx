import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { radius, spacing } from '@/theme/tokens';
import { formatPhoneDisplay } from '@/utils/phone';

export default function OtpVerifyScreen() {
  const theme = useTheme();
  const searchParams = useLocalSearchParams<{ redirect?: string }>();
  const redirectIntent = useAuthStore((s) => s.redirectIntent);
  const targetRedirect = searchParams.redirect || redirectIntent;

  const phone = useAuthStore((s) => s.otp.phone);
  const resendAvailableAt = useAuthStore((s) => s.otp.resendAvailableAt);
  const attempts = useAuthStore((s) => s.otp.attempts);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const signInWithOtp = useAuthStore((s) => s.signInWithOtp);

  // 6 boxes digits
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(() => {
    if (!resendAvailableAt) return 0;
    return Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
  });

  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Compute countdown seconds remaining from resendAvailableAt timestamp (app kill safe)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!resendAvailableAt) {
        setResendSeconds(0);
        return;
      }
      const remaining = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
      setResendSeconds(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [resendAvailableAt]);

  const handleDigitChange = (text: string, index: number) => {
    setError(undefined);

    // Handle paste of 6 digits
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 6) {
      const newDigits = cleaned.slice(0, 6).split('');
      setDigits(newDigits);
      inputRefs.current[5]?.focus();
      triggerSubmit(newDigits.join(''));
      return;
    }

    const singleDigit = cleaned.slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = singleDigit;
    setDigits(nextDigits);

    // Auto advance
    if (singleDigit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto submit on complete 6 digits
    if (index === 5 && singleDigit && nextDigits.every((d) => d !== '')) {
      triggerSubmit(nextDigits.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const triggerSubmit = async (token: string) => {
    if (isSubmitting || token.length !== 6) return;
    setIsSubmitting(true);
    setError(undefined);
    Keyboard.dismiss();

    try {
      await verifyOtp(token);
      const status = useAuthStore.getState().accountStatus;

      if (status && status !== 'active') {
        router.replace('/(auth)/account-status');
      } else if (targetRedirect) {
        useAuthStore.getState().setRedirectIntent(null);
        router.replace(targetRedirect as any);
      } else {
        router.replace('/(app)/(tabs)');
      }
    } catch (err: any) {
      setError(err.message || 'Incorrect verification code.');
      // Refocus first empty box or last
      inputRefs.current[0]?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendSeconds > 0 || isSubmitting || !phone) return;
    setError(undefined);
    try {
      await signInWithOtp(phone);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Unable to resend code.');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to phone number input"
            onPress={() => router.back()}
            style={styles.backButton}>
            <AppText variant="caption" color={theme.colors.primary}>
              ← Change Phone Number
            </AppText>
          </Pressable>

          <View style={styles.header}>
            <AppText variant="title">{t('auth.otpTitle')}</AppText>
            <AppText muted>
              {t('auth.otpSubtitle', { phone: formatPhoneDisplay(phone) })}
            </AppText>
          </View>

          {error ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={[styles.errorBox, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.error }]}>
              <AppText variant="caption" color={theme.colors.error}>
                {error}
              </AppText>
            </View>
          ) : null}

          <Card style={styles.card}>
            {/* 6 Digit Input Boxes */}
            <View style={styles.boxesRow}>
              {digits.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={(ref) => {
                    inputRefs.current[idx] = ref;
                  }}
                  value={digit}
                  onChangeText={(val) => handleDigitChange(val, idx)}
                  onKeyPress={(e) => handleKeyPress(e, idx)}
                  keyboardType="number-pad"
                  maxLength={6}
                  selectTextOnFocus
                  autoFocus={idx === 0}
                  accessibilityLabel={`Verification code digit ${idx + 1} of 6`}
                  style={[
                    styles.digitBox,
                    {
                      color: theme.colors.text,
                      backgroundColor: theme.colors.surface,
                      borderColor: digit ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                />
              ))}
            </View>

            <Button
              label={t('auth.otpVerify')}
              variant="primary"
              onPress={() => triggerSubmit(digits.join(''))}
              loading={isSubmitting}
              disabled={digits.some((d) => d === '') || isSubmitting}
            />

            <View style={styles.resendRow}>
              {resendSeconds > 0 ? (
                <AppText variant="caption" muted>
                  {t('auth.resendIn', { seconds: resendSeconds })}
                </AppText>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.resendOtp')}
                  disabled={attempts >= 5}
                  onPress={handleResend}>
                  <AppText
                    variant="caption"
                    color={attempts >= 5 ? theme.colors.textMuted : theme.colors.primary}
                    style={styles.resendText}>
                    {t('auth.resendOtp')}
                  </AppText>
                </Pressable>
              )}
            </View>
          </Card>
        </View>
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
    justifyContent: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxs,
  },
  header: {
    gap: spacing.xs,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  card: {
    gap: spacing.lg,
    padding: spacing.lg,
    alignItems: 'stretch',
  },
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  digitBox: {
    flex: 1,
    minHeight: 56,
    borderWidth: 1.5,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
  },
  resendRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendText: {
    fontWeight: '600',
  },
});
