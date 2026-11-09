import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Button, Card, Input, OfflineBanner } from '@/components/ui';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { selectCan, selectShop, useShopStore } from '@/store/shopStore';
import { spacing } from '@/theme/tokens';
import type { Shop } from '@/types/database.types';
import { formatMoney } from '@/utils/formatMoney';

interface ApprovalThresholdFormProps {
  shop: Shop | null;
  canSetThreshold: boolean;
  isOnline: boolean;
  onSave: (amount: number | null) => Promise<void>;
}

function ApprovalThresholdForm({
  shop,
  canSetThreshold,
  isOnline,
  onSave,
}: ApprovalThresholdFormProps) {
  const theme = useTheme();
  const [enabled, setEnabled] = useState(
    Boolean(shop?.approval_threshold !== null && shop?.approval_threshold !== undefined),
  );
  const [amount, setAmount] = useState(
    shop?.approval_threshold ? String(shop.approval_threshold) : '50000',
  );
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async () => {
    if (!canSetThreshold || !isOnline) return;
    setSaving(true);
    setSavedSuccess(false);

    try {
      const parsedAmount = enabled && amount.trim() ? parseFloat(amount) : null;
      await onSave(parsedAmount);
      setSavedSuccess(true);
    } finally {
      setSaving(false);
    }
  };

  const numericAmount = parseFloat(amount);

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <AppText variant="subtitle">{t('approvalThreshold.title')}</AppText>
          <AppText muted>{t('approvalThreshold.subtitle')}</AppText>
        </View>

        {/* Enable / Disable Switch */}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <AppText>{t('approvalThreshold.toggleLabel')}</AppText>
            <AppText variant="caption" muted>
              {enabled
                ? !isNaN(numericAmount)
                  ? t('approvalThreshold.thresholdActive', {
                      amount: formatMoney(numericAmount),
                    })
                  : 'Approval rule active'
                : t('approvalThreshold.noThreshold')}
            </AppText>
          </View>
          <Switch
            value={enabled}
            disabled={!canSetThreshold}
            onValueChange={setEnabled}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          />
        </View>

        {/* Threshold Amount Input */}
        {enabled ? (
          <View style={styles.inputSection}>
            <Input
              label={t('approvalThreshold.amountLabel')}
              placeholder="50000"
              keyboardType="numeric"
              value={amount}
              editable={canSetThreshold}
              onChangeText={setAmount}
              helper={t('approvalThreshold.amountHelper')}
            />
          </View>
        ) : null}

        {savedSuccess ? (
          <View style={[styles.successBanner, { backgroundColor: theme.colors.surfaceMuted }]}>
            <AppText color={theme.colors.success}>
              Order approval threshold saved successfully.
            </AppText>
          </View>
        ) : null}

        {canSetThreshold ? (
          <Button
            label={t('approvalThreshold.saveThreshold')}
            variant="primary"
            loading={saving}
            disabled={saving || !isOnline}
            onPress={() => {
              void handleSave();
            }}
          />
        ) : (
          <AppText variant="caption" muted>
            Only the shop owner can modify order approval thresholds.
          </AppText>
        )}
      </Card>
    </View>
  );
}

export default function ApprovalThresholdScreen() {
  const isOnline = useNetworkStatus();

  const shop = useShopStore(selectShop);
  const status = useShopStore((s) => s.status);
  const loadShop = useShopStore((s) => s.loadShop);
  const setApprovalThreshold = useShopStore((s) => s.setApprovalThreshold);
  const canSetThreshold = useShopStore(selectCan('set_approval_threshold'));

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  return (
    <Screen title={t('approvalThreshold.title')} onBack={() => router.back()}>
      <OfflineBanner />

      <ScreenState
        status={status}
        onRetry={() => {
          void loadShop();
        }}
        data={
          <ApprovalThresholdForm
            key={shop?.id ?? 'none'}
            shop={shop}
            canSetThreshold={canSetThreshold}
            isOnline={isOnline}
            onSave={setApprovalThreshold}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xxs,
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
  inputSection: {
    gap: spacing.xs,
  },
  successBanner: {
    padding: spacing.sm,
    borderRadius: spacing.xs,
  },
});
