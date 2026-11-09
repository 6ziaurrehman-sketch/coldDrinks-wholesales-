import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, BottomSheet, Button, Card, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import type { ShopRole } from '@/types/database.types';
import { formatPhoneAsYouType, isValidPakistanPhone, normalizePhone } from '@/utils/phone';

export interface InviteStaffBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onInvite: (phone: string, role: ShopRole) => Promise<{ inviteCode: string }>;
}

export function InviteStaffBottomSheet({
  visible,
  onClose,
  onInvite,
}: InviteStaffBottomSheetProps) {
  const theme = useTheme();
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<ShopRole>('staff');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);

  const handlePhoneChange = (text: string) => {
    setErrorMsg(null);
    setSuccessCode(null);
    setPhone(formatPhoneAsYouType(text));
  };

  const handleSendInvite = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized || !isValidPakistanPhone(phone)) {
      setErrorMsg('Please enter a valid 11-digit Pakistan mobile number (e.g. 0300 1234567).');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await onInvite(normalized, selectedRole);
      setSuccessCode(res.inviteCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invite.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setPhone('');
    setSelectedRole('staff');
    setErrorMsg(null);
    setSuccessCode(null);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title={t('staff.inviteStaff')} onClose={handleResetAndClose}>
      <View style={styles.container}>
        {successCode ? (
          <View style={styles.successBox}>
            <AppText variant="subtitle" color={theme.colors.success}>
              {t('staff.inviteSuccess', { code: successCode })}
            </AppText>
            <AppText muted>
              The staff member can enter this code in the Sign Up screen to join your shop immediately.
            </AppText>
            <Button label={t('common.ok')} onPress={handleResetAndClose} />
          </View>
        ) : (
          <>
            <Input
              label={t('staff.invitePhone')}
              placeholder={t('staff.invitePhoneHelper')}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={handlePhoneChange}
              error={errorMsg ?? undefined}
              autoFocus
            />

            <View style={styles.roleSection}>
              <AppText variant="caption" muted>
                {t('staff.selectRole')}
              </AppText>

              {/* Manager Option */}
              <Card
                style={[
                  styles.roleCard,
                  selectedRole === 'manager' && {
                    borderColor: theme.colors.primary,
                    borderWidth: 2,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
                onPress={() => setSelectedRole('manager')}>
                <View style={styles.roleRow}>
                  <AppText variant="subtitle">{t('staff.roleManager')}</AppText>
                </View>
                <AppText variant="caption" muted>
                  {t('staff.managerDesc')}
                </AppText>
              </Card>

              {/* Staff Option */}
              <Card
                style={[
                  styles.roleCard,
                  selectedRole === 'staff' && {
                    borderColor: theme.colors.primary,
                    borderWidth: 2,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
                onPress={() => setSelectedRole('staff')}>
                <View style={styles.roleRow}>
                  <AppText variant="subtitle">{t('staff.roleStaff')}</AppText>
                </View>
                <AppText variant="caption" muted>
                  {t('staff.staffDesc')}
                </AppText>
              </Card>
            </View>

            <View style={styles.actions}>
              <Button
                label={t('staff.sendInvite')}
                variant="primary"
                loading={loading}
                disabled={!phone.trim() || loading}
                onPress={() => {
                  void handleSendInvite();
                }}
              />
              <Button label={t('common.cancel')} variant="ghost" onPress={handleResetAndClose} />
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  roleSection: {
    gap: spacing.xs,
  },
  roleCard: {
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  successBox: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
});
