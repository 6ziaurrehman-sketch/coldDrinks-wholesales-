import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText, Card, Badge } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { CreditSummary } from '@/types/credit.types';

interface CreditSummaryCardProps {
  summary: CreditSummary;
}

export function CreditSummaryCard({ summary }: CreditSummaryCardProps) {
  const theme = useTheme();

  const { limit, used, available, outstanding, overdue, nextDue, status } = summary;

  // Percentage of credit limit used
  const usedRatio = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;
  const usedPercent = Math.round(usedRatio * 100);

  // Status tone for segmented bar
  let barColor: string = theme.colors.success;
  let barLabel = `${usedPercent}% Used • Safe`;
  if (usedRatio >= 0.9) {
    barColor = theme.colors.error;
    barLabel = `${usedPercent}% Used • Critical`;
  } else if (usedRatio >= 0.7) {
    barColor = theme.colors.warning;
    barLabel = `${usedPercent}% Used • Caution`;
  }

  const isCreditBalance = outstanding < 0;

  return (
    <Card style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('credit.limit').toUpperCase()}
          </AppText>
          <AppText variant="title" style={{ fontWeight: '800' }}>
            {formatMoney(limit)}
          </AppText>
        </View>

        <Badge
          label={status.toUpperCase()}
          tone={status === 'active' ? 'success' : 'warning'}
        />
      </View>

      {/* Segmented Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceMuted }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${usedPercent}%`,
                backgroundColor: barColor,
              },
            ]}
          />
        </View>
        <View style={styles.progressLabelRow}>
          <AppText variant="caption" color={barColor} style={{ fontWeight: '700' }}>
            {barLabel}
          </AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {formatMoney(available)} available
          </AppText>
        </View>
      </View>

      {/* Used & Available Column Row */}
      <View style={[styles.statsRow, { borderTopColor: theme.colors.border }]}>
        <View style={styles.statCol}>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('credit.used')}
          </AppText>
          <AppText variant="subtitle" color={theme.colors.text}>
            {formatMoney(used)}
          </AppText>
        </View>

        <View style={styles.statCol}>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('credit.available')}
          </AppText>
          <AppText variant="subtitle" color={theme.colors.success} style={{ fontWeight: '700' }}>
            {formatMoney(available)}
          </AppText>
        </View>
      </View>

      {/* Net Outstanding & Due Date Row */}
      <View style={[styles.bottomRow, { backgroundColor: theme.colors.surfaceMuted }]}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {isCreditBalance ? t('credit.creditBalance') : t('credit.outstanding')}
          </AppText>
          <AppText
            variant="subtitle"
            color={isCreditBalance ? theme.colors.success : theme.colors.text}
            style={{ fontWeight: '700' }}
          >
            {isCreditBalance ? `+${formatMoney(Math.abs(outstanding))}` : formatMoney(outstanding)}
          </AppText>
        </View>

        {overdue > 0 ? (
          <View style={styles.overdueBox}>
            <AppText variant="caption" color={theme.colors.error} style={{ fontWeight: '700' }}>
              ⚠️ {formatMoney(overdue)} Overdue
            </AppText>
          </View>
        ) : nextDue ? (
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="caption" color={theme.colors.textMuted}>
              {t('credit.nextDue')}
            </AppText>
            <AppText variant="caption" color={theme.colors.text} style={{ fontWeight: '600' }}>
              {new Date(nextDue).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </AppText>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  progressContainer: {
    gap: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  statCol: {
    flex: 1,
    gap: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: 8,
    gap: spacing.sm,
  },
  overdueBox: {
    alignItems: 'flex-end',
  },
});
