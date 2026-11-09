import React from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';

export default function TermsAndPrivacyScreen() {
  const theme = useTheme();

  return (
    <Screen title={t('settings.termsAndPrivacy')} onBack={router.back}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Terms of Service */}
        <Card style={styles.card}>
          <AppText variant="subtitle">1. Wholesale B2B Trade Agreement</AppText>
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.paragraph}>
            This application is exclusively intended for licensed retail grocery stores, restaurants,
            canteens, and institutional wholesale buyers. By placing orders, your shop agrees to abide
            by bulk minimum order quantities, crate multiplier constraints, and distributor pricing terms.
          </AppText>

          <AppText variant="subtitle">2. Deliveries, Unloading & Empties Deposit</AppText>
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.paragraph}>
            All beverage deliveries require authorized shop personnel to verify crate counts upon arrival.
            Glass bottle orders require a 1:1 return of empty crates and bottles or an active security deposit.
            Claims regarding breakage or short delivery must be noted on the delivery receipt or reported via
            the app within 24 hours of dispatch.
          </AppText>

          <AppText variant="subtitle">3. Credit & Payment Policies</AppText>
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.paragraph}>
            Credit purchases are subject to distributor approval and defined credit thresholds.
            Invoices must be cleared within agreed billing cycles (e.g. 14 days). Overdue accounts may
            have their ordering privileges suspended until outstanding ledger balances are settled.
          </AppText>

          <AppText variant="subtitle">4. Order Cancellations & Cutoffs</AppText>
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.paragraph}>
            Orders in &quot;Placed&quot; or &quot;Confirmed&quot; status may be cancelled immediately. Once orders reach
            &quot;Processing&quot; or &quot;Out for Delivery&quot;, cancellation requires distributor confirmation and may
            incur nominal restocking or handling fees.
          </AppText>
        </Card>

        {/* Privacy Policy */}
        <Card style={styles.card}>
          <AppText variant="subtitle">5. Privacy & Data Handling</AppText>
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.paragraph}>
            We collect shop business details (business name, NTN, STRN, delivery coordinates, and owner contact)
            solely to facilitate order fulfillment, route logistics, invoice generation, and tax compliance.
          </AppText>

          <AppText variant="subtitle">6. Staff Access & Role Governance</AppText>
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.paragraph}>
            Shop owners retain full authority to invite, assign, or revoke staff roles. Staff logins are
            restricted from viewing shop credit lines, financial ledgers, or payment receipts, preserving
            commercial confidentiality.
          </AppText>

          <AppText variant="subtitle">7. Contact & Dispute Resolution</AppText>
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.paragraph}>
            In the event of trade disputes, pricing discrepancies, or service queries, shops may reach our
            customer resolution desk via the in-app Seller Contact or WhatsApp support channels.
          </AppText>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  paragraph: {
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
});
