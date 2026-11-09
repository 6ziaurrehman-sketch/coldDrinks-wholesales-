import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useLoyaltyStore } from '@/store/loyaltyStore';
import { useActiveShopStore } from '@/store/activeShopStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { formatDate } from '@/utils/formatDate';
import { spacing } from '@/theme/tokens';

export default function LoyaltyScreen() {
  const theme = useTheme();

  // Atomic Zustand Selectors
  const activeShopId = useActiveShopStore((s) => s.activeShopId);
  const summary = useLoyaltyStore((s) => s.summary);
  const status = useLoyaltyStore((s) => s.status);
  const loadSummary = useLoyaltyStore((s) => s.loadSummary);

  useEffect(() => {
    if (activeShopId) {
      void loadSummary(activeShopId);
    }
  }, [activeShopId, loadSummary]);

  return (
    <Screen title="Loyalty & Rewards" onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenState
          status={
            status === 'loading'
              ? 'loading'
              : status === 'error'
              ? 'error'
              : 'data'
          }
          errorMessage="Failed to load loyalty rewards balance. Please check your internet connection."
          onRetry={() => activeShopId && loadSummary(activeShopId)}
          data={
            <View>
              {/* Points Balance Card */}
              <Card style={[styles.balanceCard, { backgroundColor: theme.colors.surface }]}>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  Available Loyalty Points
                </AppText>
                <AppText variant="title" style={styles.pointsText}>
                  {summary?.totalPoints || 0}
                </AppText>
                <AppText variant="body" color={theme.colors.primary} style={styles.rupeeEquiv}>
                  ≈ {formatMoney(summary?.rupeeValue || 0)} discount credit
                </AppText>

                {summary?.expiringPoints && summary.expiringPoints > 0 ? (
                  <View style={[styles.expiryWarning, { backgroundColor: '#FEF3C7' }]}>
                    <AppText variant="caption" color="#B45309" style={styles.warningText}>
                      ⚠️ {summary.expiringPoints} points expiring soon
                      {summary.nextExpiry ? ` on ${formatDate(summary.nextExpiry, { timeZone: 'Asia/Karachi' })}` : ''}.
                    </AppText>
                  </View>
                ) : null}
              </Card>

              {/* Program Rules Card */}
              <Card style={styles.rulesCard}>
                <AppText variant="subtitle" style={styles.rulesTitle}>
                  How Wholesale Rewards Work
                </AppText>
                <View style={styles.ruleItem}>
                  <Badge label="Earn" tone="primary" />
                  <AppText variant="caption" style={styles.ruleText}>
                    Earn 100 points for every Rs. 10,000 spent on delivered & paid orders.
                  </AppText>
                </View>

                <View style={styles.ruleItem}>
                  <Badge label="Redeem" tone="success" />
                  <AppText variant="caption" style={styles.ruleText}>
                    Use points at checkout (1 point = 1 PKR). Up to 20% of order total can be paid with points.
                  </AppText>
                </View>

                <View style={styles.ruleItem}>
                  <Badge label="Protection" tone="neutral" />
                  <AppText variant="caption" style={styles.ruleText}>
                    Points are credited once delivery is confirmed. Cancelled or returned items reverse points earned.
                  </AppText>
                </View>
              </Card>
            </View>
          }
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  balanceCard: {
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.md,
    borderRadius: 16,
  },
  pointsText: {
    fontSize: 48,
    fontWeight: '800',
    color: '#F59E0B',
    marginVertical: 4,
  },
  rupeeEquiv: {
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  expiryWarning: {
    padding: spacing.sm,
    borderRadius: 8,
    marginTop: spacing.xs,
    width: '100%',
    alignItems: 'center',
  },
  warningText: {
    fontWeight: '600',
  },
  rulesCard: {
    padding: spacing.md,
  },
  rulesTitle: {
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ruleText: {
    flex: 1,
  },
});
