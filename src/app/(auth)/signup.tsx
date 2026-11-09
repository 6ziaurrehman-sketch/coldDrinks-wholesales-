import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { radius, spacing } from '@/theme/tokens';
import { formatPhoneAsYouType, isValidPakistanPhone } from '@/utils/phone';

type SignupMode = 'self' | 'invited';

export default function SignupScreen() {
  const theme = useTheme();
  const signUp = useAuthStore((s) => s.signUp);
  const redirectIntent = useAuthStore((s) => s.redirectIntent);

  const [mode, setMode] = useState<SignupMode>('self');

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Field Errors
  const [fullNameError, setFullNameError] = useState<string | undefined>();
  const [businessNameError, setBusinessNameError] = useState<string | undefined>();
  const [shopNameError, setShopNameError] = useState<string | undefined>();
  const [shopAddressError, setShopAddressError] = useState<string | undefined>();
  const [inviteCodeError, setInviteCodeError] = useState<string | undefined>();
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();

  const [generalError, setGeneralError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    let isValid = true;

    if (!fullName.trim()) {
      setFullNameError('Please enter your full name.');
      isValid = false;
    }

    if (mode === 'invited') {
      if (!inviteCode.trim()) {
        setInviteCodeError('Please enter your invitation code.');
        isValid = false;
      }
    } else {
      if (!businessName.trim()) {
        setBusinessNameError('Please enter your business or company name.');
        isValid = false;
      }
      if (!shopName.trim()) {
        setShopNameError('Please enter your shop or store name.');
        isValid = false;
      }
      if (!shopAddress.trim()) {
        setShopAddressError('Please enter your physical shop address.');
        isValid = false;
      }
    }

    if (!phone.trim() || !isValidPakistanPhone(phone)) {
      setPhoneError('Please enter a valid Pakistani mobile number (03xx).');
      isValid = false;
    }

    if (!email.trim() || !email.includes('@')) {
      setEmailError('Please enter a valid business email address.');
      isValid = false;
    }

    if (!password || password.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    setGeneralError(undefined);

    try {
      if (mode === 'invited') {
        await signUp({
          isInvited: true,
          inviteCode: inviteCode.trim().toUpperCase(),
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          password,
        });
      } else {
        await signUp({
          isInvited: false,
          fullName: fullName.trim(),
          businessName: businessName.trim(),
          shopName: shopName.trim(),
          shopAddress: shopAddress.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          password,
        });
      }

      const status = useAuthStore.getState().accountStatus;
      if (status && status !== 'active') {
        router.replace('/(auth)/account-status');
      } else if (redirectIntent) {
        useAuthStore.getState().setRedirectIntent(null);
        router.replace(redirectIntent as any);
      } else {
        router.replace('/(app)/(tabs)');
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Registration failed. Please check your details and try again.');
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
              <AppText variant="title">{t('auth.signupTitle')}</AppText>
              <AppText muted>Wholesale ordering registration for shop owners & distributors</AppText>
            </View>

            {/* Mode Selector */}
            <View style={[styles.tabContainer, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Register new shop tab"
                onPress={() => {
                  setMode('self');
                  setGeneralError(undefined);
                }}
                style={[
                  styles.tabButton,
                  mode === 'self' && [styles.activeTabButton, { backgroundColor: theme.colors.surface }],
                ]}>
                <AppText
                  variant="caption"
                  color={mode === 'self' ? theme.colors.primary : theme.colors.textMuted}>
                  {t('auth.registerShop')}
                </AppText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Have an invitation tab"
                onPress={() => {
                  setMode('invited');
                  setGeneralError(undefined);
                }}
                style={[
                  styles.tabButton,
                  mode === 'invited' && [styles.activeTabButton, { backgroundColor: theme.colors.surface }],
                ]}>
                <AppText
                  variant="caption"
                  color={mode === 'invited' ? theme.colors.primary : theme.colors.textMuted}>
                  {t('auth.haveInvite')}
                </AppText>
              </Pressable>
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

            <Card style={styles.formCard}>
              {mode === 'invited' ? (
                <Input
                  label={t('auth.inviteCode')}
                  placeholder={t('auth.invitePlaceholder')}
                  value={inviteCode}
                  onChangeText={(val) => {
                    setInviteCode(val.toUpperCase());
                    setInviteCodeError(undefined);
                  }}
                  error={inviteCodeError}
                  autoCapitalize="characters"
                />
              ) : (
                <>
                  <Input
                    label={t('auth.businessName')}
                    placeholder="e.g. Al-Madina Traders"
                    value={businessName}
                    onChangeText={(val) => {
                      setBusinessName(val);
                      setBusinessNameError(undefined);
                    }}
                    error={businessNameError}
                  />
                  <Input
                    label={t('auth.shopName')}
                    placeholder="e.g. Al-Madina Mart Clifton"
                    value={shopName}
                    onChangeText={(val) => {
                      setShopName(val);
                      setShopNameError(undefined);
                    }}
                    error={shopNameError}
                  />
                  <Input
                    label={t('auth.shopAddress')}
                    placeholder="e.g. Shop # 4, Main Commercial Area, Karachi"
                    value={shopAddress}
                    onChangeText={(val) => {
                      setShopAddress(val);
                      setShopAddressError(undefined);
                    }}
                    error={shopAddressError}
                  />
                </>
              )}

              <Input
                label={t('auth.fullName')}
                placeholder="e.g. Muhammad Ali"
                value={fullName}
                onChangeText={(val) => {
                  setFullName(val);
                  setFullNameError(undefined);
                }}
                error={fullNameError}
              />

              <Input
                label={t('auth.phone')}
                placeholder={t('auth.phonePlaceholder')}
                value={phone}
                onChangeText={(val) => {
                  setPhone(formatPhoneAsYouType(val));
                  setPhoneError(undefined);
                }}
                error={phoneError}
                helper={t('auth.phoneHelper')}
                keyboardType="phone-pad"
              />

              <Input
                label={t('auth.email')}
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  setEmailError(undefined);
                }}
                error={emailError}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Input
                label={t('auth.password')}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  setPasswordError(undefined);
                }}
                error={passwordError}
                secureTextEntry
              />

              <Button
                label={mode === 'invited' ? t('auth.joinButton') : t('auth.registerButton')}
                variant="primary"
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={isSubmitting}
              />
            </Card>

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('auth.alreadyHaveAccount')}
                onPress={() => router.push('/(auth)/login')}>
                <AppText variant="body" color={theme.colors.primary} style={styles.footerText}>
                  {t('auth.alreadyHaveAccount')}
                </AppText>
              </Pressable>
            </View>
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
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  container: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  tabContainer: {
    flexDirection: 'row',
    padding: spacing.xxs,
    borderRadius: radius.md,
    gap: spacing.xxs,
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  activeTabButton: {
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  formCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  footerText: {
    textAlign: 'center',
    fontWeight: '600',
  },
});
