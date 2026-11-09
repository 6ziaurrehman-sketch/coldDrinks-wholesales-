import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme/tokens';
import type { ShopMember, ShopRole } from '@/types/database.types';

export interface ChangeRoleModalProps {
  visible: boolean;
  member: ShopMember | null;
  onClose: () => void;
  onSaveRole: (targetUserId: string, newRole: ShopRole) => Promise<void>;
}

export function ChangeRoleModal({
  visible,
  member,
  onClose,
  onSaveRole,
}: ChangeRoleModalProps) {
  const theme = useTheme();
  const [selectedRole, setSelectedRole] = useState<ShopRole>(member?.role ?? 'staff');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!member) return null;

  const handleConfirm = async () => {
    if (selectedRole === member.role) {
      onClose();
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      await onSaveRole(member.userId, selectedRole);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change role.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          onPress={(e) => e.stopPropagation()}>
          <AppText variant="subtitle">
            {t('staff.changeRoleTitle', { name: member.fullName || member.phone || 'Member' })}
          </AppText>
          <AppText muted>Current Role: {member.role.toUpperCase()}</AppText>

          {errorMsg ? (
            <View style={[styles.errorBox, { backgroundColor: theme.colors.surfaceMuted }]}>
              <AppText variant="caption" color={theme.colors.error}>
                {errorMsg}
              </AppText>
            </View>
          ) : null}

          <View style={styles.roleOptions}>
            {/* Manager */}
            <Card
              style={[
                styles.option,
                selectedRole === 'manager' && {
                  borderColor: theme.colors.primary,
                  borderWidth: 2,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
              onPress={() => setSelectedRole('manager')}>
              <AppText variant="subtitle">{t('staff.roleManager')}</AppText>
              <AppText variant="caption" muted>
                {t('staff.managerDesc')}
              </AppText>
            </Card>

            {/* Staff */}
            <Card
              style={[
                styles.option,
                selectedRole === 'staff' && {
                  borderColor: theme.colors.primary,
                  borderWidth: 2,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
              onPress={() => setSelectedRole('staff')}>
              <AppText variant="subtitle">{t('staff.roleStaff')}</AppText>
              <AppText variant="caption" muted>
                {t('staff.staffDesc')}
              </AppText>
            </Card>
          </View>

          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label={t('common.cancel')} variant="ghost" onPress={onClose} disabled={loading} />
            </View>
            <View style={styles.action}>
              <Button
                label={t('staff.changeRoleConfirm')}
                variant="primary"
                loading={loading}
                disabled={loading}
                onPress={() => {
                  void handleConfirm();
                }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  errorBox: {
    padding: spacing.sm,
    borderRadius: spacing.xs,
  },
  roleOptions: {
    gap: spacing.xs,
  },
  option: {
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  action: {
    flex: 1,
  },
});
