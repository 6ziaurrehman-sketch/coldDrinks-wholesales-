import React, { useEffect } from 'react';
import { View, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { formatDate } from '@/utils/formatDate';
import {
  ORDER_LIFECYCLE_STEPS,
  STEP_LABELS,
  formatStepA11yLabel,
} from '@/utils/orders';
import type { TimelineEntry, OrderStatus } from '@/types/orders.types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface OrderTimelineProps {
  timeline: TimelineEntry[];
  currentOrderStatus: OrderStatus | string;
  cancellationReason?: string | null;
}

export function OrderTimeline({
  timeline,
  currentOrderStatus,
  cancellationReason,
}: OrderTimelineProps) {
  const theme = useTheme();

  // Smooth layout animation when a step advances or timeline updates
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [currentOrderStatus, timeline.length]);

  const isTerminalCancelled =
    currentOrderStatus === 'cancelled' || currentOrderStatus === 'rejected';

  // Group events by status for fast lookup of timestamp / notes
  const eventsByStatus = new Map<string, TimelineEntry>();
  timeline.forEach((entry) => {
    eventsByStatus.set(entry.status, entry);
  });

  const currentStepIdx = ORDER_LIFECYCLE_STEPS.indexOf(currentOrderStatus as OrderStatus);

  // If order was cancelled or rejected, find the terminal event
  const terminalEvent = timeline.find(
    (e) => e.status === 'cancelled' || e.status === 'rejected',
  );
  const resolvedReason =
    cancellationReason ||
    terminalEvent?.notes ||
    (currentOrderStatus === 'rejected' ? 'Rejected by supplier' : 'Cancelled by customer');

  // If cancelled/rejected, determine how many lifecycle steps had completed before cancellation
  let maxCompletedBeforeCancel = -1;
  if (isTerminalCancelled) {
    ORDER_LIFECYCLE_STEPS.forEach((step, idx) => {
      if (eventsByStatus.has(step)) {
        maxCompletedBeforeCancel = Math.max(maxCompletedBeforeCancel, idx);
      }
    });
    // Default to at least Placed (step 0)
    if (maxCompletedBeforeCancel === -1) maxCompletedBeforeCancel = 0;
  }

  // Determine steps to render:
  // If cancelled/rejected, render only steps up to cancellation, then the terminal cancelled step!
  const renderedSteps = isTerminalCancelled
    ? ORDER_LIFECYCLE_STEPS.slice(0, maxCompletedBeforeCancel + 1)
    : ORDER_LIFECYCLE_STEPS;

  const totalSteps = isTerminalCancelled
    ? renderedSteps.length + 1
    : ORDER_LIFECYCLE_STEPS.length;

  return (
    <View style={styles.container}>
      {renderedSteps.map((stepKey, idx) => {
        const matchingEvent = eventsByStatus.get(stepKey);
        const stepLabel = STEP_LABELS[stepKey] || stepKey;

        // Skip resilience: Even if intermediate status was skipped,
        // earlier steps in the lifecycle are marked as completed!
        const isCompleted =
          !isTerminalCancelled &&
          (matchingEvent != null || (currentStepIdx !== -1 && idx <= currentStepIdx));
        const isCurrent = !isTerminalCancelled && currentStepIdx === idx;
        const stepState: 'current' | 'completed' | 'pending' = isCurrent
          ? 'current'
          : isCompleted
            ? 'completed'
            : 'pending';

        const a11yLabel = formatStepA11yLabel(
          idx + 1,
          totalSteps,
          stepLabel,
          stepState,
        );

        let dotBg: string = theme.colors.border;
        if (isCurrent) dotBg = theme.colors.primary;
        else if (isCompleted) dotBg = theme.colors.success;

        return (
          <View
            key={stepKey}
            style={styles.stepRow}
            accessible
            accessibilityRole="text"
            accessibilityLabel={a11yLabel}
          >
            {/* Indicator Column */}
            <View style={styles.indicatorCol}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: dotBg,
                    borderColor: isCurrent ? theme.colors.primary : dotBg,
                  },
                  isCurrent && styles.currentDotRing,
                ]}
              >
                {isCompleted && !isCurrent ? (
                  <AppText variant="caption" style={styles.checkmark}>
                    ✓
                  </AppText>
                ) : isCurrent ? (
                  <View style={[styles.innerCurrentDot, { backgroundColor: theme.colors.surface }]} />
                ) : null}
              </View>

              {/* Vertical Connector Line */}
              <View
                style={[
                  styles.line,
                  {
                    backgroundColor:
                      isCompleted && !isCurrent
                        ? theme.colors.success
                        : theme.colors.border,
                  },
                ]}
              />
            </View>

            {/* Step Content */}
            <View style={styles.contentCol}>
              <View style={styles.titleRow}>
                <AppText
                  variant={isCurrent ? 'subtitle' : 'body'}
                  color={
                    isCurrent
                      ? theme.colors.primary
                      : isCompleted
                        ? theme.colors.text
                        : theme.colors.textMuted
                  }
                  style={isCurrent ? styles.currentText : undefined}
                >
                  {stepLabel}
                </AppText>

                {matchingEvent && (
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    {formatDate(matchingEvent.createdAt, { style: 'time' })}
                  </AppText>
                )}
              </View>

              {matchingEvent?.notes ? (
                <AppText
                  variant="caption"
                  color={theme.colors.textMuted}
                  style={styles.notes}
                >
                  {matchingEvent.notes}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}

      {/* Terminal Cancelled / Rejected Step (Edge Case) */}
      {isTerminalCancelled && (
        <View
          style={styles.stepRow}
          accessible
          accessibilityRole="text"
          accessibilityLabel={formatStepA11yLabel(
            totalSteps,
            totalSteps,
            currentOrderStatus === 'rejected' ? 'Rejected' : 'Cancelled',
            'current',
          )}
        >
          <View style={styles.indicatorCol}>
            <View
              style={[
                styles.dot,
                styles.currentDotRing,
                {
                  backgroundColor: theme.colors.error,
                  borderColor: theme.colors.error,
                },
              ]}
            >
              <AppText variant="caption" style={styles.crossMark}>
                ✕
              </AppText>
            </View>
          </View>

          <View style={styles.contentCol}>
            <View style={styles.titleRow}>
              <AppText
                variant="subtitle"
                color={theme.colors.error}
                style={styles.currentText}
              >
                {currentOrderStatus === 'rejected' ? 'Order Rejected' : 'Order Cancelled'}
              </AppText>
              {terminalEvent && (
                <AppText variant="caption" color={theme.colors.error}>
                  {formatDate(terminalEvent.createdAt, { style: 'time' })}
                </AppText>
              )}
            </View>

            {resolvedReason ? (
              <View style={[styles.reasonBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                <AppText variant="caption" color={theme.colors.error}>
                  Reason: {resolvedReason}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  stepRow: {
    flexDirection: 'row',
    minHeight: 56,
  },
  indicatorCol: {
    alignItems: 'center',
    width: 28,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentDotRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
  },
  innerCurrentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 13,
  },
  crossMark: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 13,
  },
  line: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  contentCol: {
    flex: 1,
    paddingStart: 12,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentText: {
    fontWeight: '700',
  },
  notes: {
    marginTop: 2,
  },
  reasonBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: 6,
  },
});
