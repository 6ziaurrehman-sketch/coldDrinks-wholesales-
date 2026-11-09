import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChangeRoleModal } from '@/components/shop/ChangeRoleModal';
import { InviteStaffBottomSheet } from '@/components/shop/InviteStaffBottomSheet';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import {
  AppText,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  OfflineBanner,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import {
  selectCan,
  selectMembers,
  selectShop,
  useShopStore,
} from '@/store/shopStore';
import { spacing } from '@/theme/tokens';
import type { ShopMember, ShopRole } from '@/types/database.types';
import { formatDate } from '@/utils/formatDate';
import { formatPhoneDisplay } from '@/utils/phone';

export default function ShopStaffScreen() {
  const theme = useTheme();

  // Store bindings
  const shop = useShopStore(selectShop);
  const members = useShopStore(selectMembers);
  const status = useShopStore((s) => s.status);
  const loadShop = useShopStore((s) => s.loadShop);
  const inviteStaff = useShopStore((s) => s.inviteStaff);
  const changeRole = useShopStore((s) => s.changeRole);
  const removeStaff = useShopStore((s) => s.removeStaff);
  const canManageStaff = useShopStore(selectCan('manage_staff'));

  // Current logged in user ID
  const currentUserId = useAuthStore((s) => s.session?.user?.id);

  // Modals & Dialogs state
  const [isInviteSheetOpen, setIsInviteSheetOpen] = useState(false);
  const [roleModalMember, setRoleModalMember] = useState<ShopMember | null>(null);
  const [removeDialogMember, setRemoveDialogMember] = useState<ShopMember | null>(null);

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  const handleRemoveMember = async () => {
    if (!removeDialogMember) return;
    try {
      await removeStaff(removeDialogMember.userId);
      setRemoveDialogMember(null);
    } catch {
      // Handled via store error state
    }
  };

  const getRoleTone = (role: ShopRole) => {
    switch (role) {
      case 'owner':
        return 'primary';
      case 'manager':
        return 'info';
      case 'staff':
      default:
        return 'neutral';
    }
  };

  return (
    <Screen
      title={t('staff.title')}
      onBack={() => router.back()}>
      <OfflineBanner />

      <ScreenState
        status={status}
        onRetry={() => {
          void loadShop();
        }}
        data={
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Header / Summary Card */}
            <Card style={styles.headerCard}>
              <View style={styles.headerRow}>
                <View style={styles.headerInfo}>
                  <AppText variant="subtitle">{shop?.name || 'Shop Team'}</AppText>
                  <AppText muted>{t('staff.subtitle')}</AppText>
                </View>
                {canManageStaff ? (
                  <Button
                    label={t('staff.inviteStaff')}
                    variant="primary"
                    onPress={() => setIsInviteSheetOpen(true)}
                  />
                ) : null}
              </View>
            </Card>

            {/* Empty State */}
            {members.length === 0 ? (
              <EmptyState
                title={t('staff.emptyTitle')}
                body={t('staff.emptyBody')}
                actionLabel={canManageStaff ? t('staff.inviteStaff') : undefined}
                onAction={canManageStaff ? () => setIsInviteSheetOpen(true) : undefined}
              />
            ) : (
              members.map((m) => {
                const isSelf = m.userId === currentUserId;
                const isOwner = m.role === 'owner';

                return (
                  <Card key={m.userId} style={styles.memberCard}>
                    <View style={styles.memberTop}>
                      {/* Avatar Circle with initials */}
                      <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <AppText variant="subtitle">
                          {((m.fullName || m.email || 'M').charAt(0)).toUpperCase()}
                        </AppText>
                      </View>

                      {/* Member Info */}
                      <View style={styles.memberInfo}>
                        <View style={styles.nameRow}>
                          <AppText variant="subtitle">{m.fullName || 'Team Member'}</AppText>
                          {isSelf ? (
                            <Badge label={t('staff.youBadge')} tone="info" />
                          ) : null}
                        </View>
                        <AppText muted>{m.email}</AppText>
                        {m.phone ? (
                          <AppText variant="caption" muted>
                            {formatPhoneDisplay(m.phone)}
                          </AppText>
                        ) : null}
                        <AppText variant="caption" muted>
                          Joined: {formatDate(m.joinedAt)}
                        </AppText>
                      </View>

                      {/* Role & Status Badges */}
                      <View style={styles.badgesCol}>
                        <Badge
                          label={m.role.toUpperCase()}
                          tone={getRoleTone(m.role)}
                        />
                        {m.status === 'invited' ? (
                          <Badge label={t('staff.statusInvited')} tone="warning" />
                        ) : null}
                      </View>
                    </View>

                    {/* Owner Management Controls (Hidden for non-owners and for self row) */}
                    {canManageStaff && !isSelf ? (
                      <View style={[styles.actionRow, { borderTopColor: theme.colors.border }]}>
                        <Button
                          label="Change Role"
                          variant="ghost"
                          onPress={() => setRoleModalMember(m)}
                        />
                        <Button
                          label="Remove"
                          variant="destructive"
                          disabled={isOwner && members.filter((x) => x.role === 'owner').length <= 1}
                          onPress={() => setRemoveDialogMember(m)}
                        />
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </ScrollView>
        }
      />

      {/* Invite Staff Bottom Sheet */}
      <InviteStaffBottomSheet
        visible={isInviteSheetOpen}
        onClose={() => setIsInviteSheetOpen(false)}
        onInvite={async (phone: string, role: ShopRole) => {
          return await inviteStaff(phone, role);
        }}
      />

      {/* Change Role Modal */}
      <ChangeRoleModal
        visible={Boolean(roleModalMember)}
        member={roleModalMember}
        onClose={() => setRoleModalMember(null)}
        onSaveRole={async (targetId: string, newRole: ShopRole) => {
          await changeRole(targetId, newRole);
        }}
      />

      {/* Remove Staff Confirmation Dialog */}
      <ConfirmDialog
        visible={Boolean(removeDialogMember)}
        title={t('staff.removeTitle')}
        message={t('staff.removeMessage', {
          name: removeDialogMember?.fullName || removeDialogMember?.phone || 'This member',
          shop: shop?.name || 'this shop',
        })}
        confirmLabel={t('staff.removeConfirm', {
          name: removeDialogMember?.fullName?.split(' ')[0] || 'Member',
        })}
        destructive
        onConfirm={() => {
          void handleRemoveMember();
        }}
        onCancel={() => setRemoveDialogMember(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerCard: {
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  memberCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  memberTop: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badgesCol: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
