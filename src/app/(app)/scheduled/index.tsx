import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Modal, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useScheduledOrdersStore } from '@/store/scheduledOrdersStore';
import { useActiveShopStore } from '@/store/activeShopStore';
import { useTheme } from '@/hooks/useTheme';
import { formatDate } from '@/utils/formatDate';
import { spacing } from '@/theme/tokens';
import type { ScheduledOrder } from '@/types/advancedModules.types';

export default function ScheduledOrdersScreen() {
  const theme = useTheme();

  // Atomic Zustand Selectors
  const activeShopId = useActiveShopStore((s) => s.activeShopId);
  const scheduledOrders = useScheduledOrdersStore((s) => s.scheduledOrders);
  const status = useScheduledOrdersStore((s) => s.status);
  const loadScheduledOrders = useScheduledOrdersStore((s) => s.loadScheduledOrders);
  const createSchedule = useScheduledOrdersStore((s) => s.createSchedule);
  const toggleStatus = useScheduledOrdersStore((s) => s.toggleStatus);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1); // 1 = Mon
  const [ruleType, setRuleType] = useState<'weekly' | 'monthly'>('weekly');

  useEffect(() => {
    if (activeShopId) {
      void loadScheduledOrders(activeShopId);
    }
  }, [activeShopId, loadScheduledOrders]);

  const handleToggle = async (schedule: ScheduledOrder) => {
    const nextStatus = schedule.status === 'active' ? 'paused' : 'active';
    try {
      await toggleStatus(schedule.id, nextStatus);
    } catch {
      Alert.alert('Update Failed', 'Unable to update schedule status. Please try again.');
    }
  };

  const handleCancel = (schedule: ScheduledOrder) => {
    Alert.alert('Cancel Scheduled Order', 'Are you sure you want to cancel this recurring order?', [
      { text: 'Keep Active', style: 'cancel' },
      {
        text: 'Cancel Order',
        style: 'destructive',
        onPress: async () => {
          try {
            await toggleStatus(schedule.id, 'cancelled');
          } catch {
            Alert.alert('Cancel Failed', 'Unable to cancel scheduled order.');
          }
        },
      },
    ]);
  };

  const handleCreateNew = async () => {
    if (!activeShopId) return;

    try {
      await createSchedule({
        shopId: activeShopId,
        paymentMethod: 'cash',
        ruleType,
        ruleDay: selectedDay,
        deliveryTimeSlot: 'morning',
        items: [],
      });
      setModalVisible(false);
      Alert.alert('Scheduled', 'Recurring order created successfully.');
    } catch {
      Alert.alert('Schedule Creation Failed', 'Unable to schedule recurring order. Please try again.');
    }
  };

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const getHumanScheduleText = (s: ScheduledOrder) => {
    if (s.ruleType === 'weekly') {
      const dayName = dayNames[(s.ruleDay || 1) - 1] || 'Monday';
      return `Every ${dayName}, delivered in Morning (by 12 PM)`;
    }
    if (s.ruleType === 'monthly') {
      return `Day ${s.ruleDay || 1} of every month`;
    }
    return `One-time on ${formatDate(s.nextRunAt, { timeZone: 'Asia/Karachi' })}`;
  };

  return (
    <Screen
      title="Scheduled Orders"
      onBack={() => router.back()}
      rightAction={
        <Button
          label="+ Schedule"
          variant="secondary"
          onPress={() => setModalVisible(true)}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenState
          status={
            status === 'loading'
              ? 'loading'
              : status === 'error'
              ? 'error'
              : scheduledOrders.length === 0
              ? 'empty'
              : 'data'
          }
          errorMessage="Failed to load scheduled orders. Please check your internet connection."
          onRetry={() => activeShopId && loadScheduledOrders(activeShopId)}
          data={
            <View>
              {scheduledOrders.map((schedule) => {
                const isPaused = schedule.status === 'paused';
                const isCancelled = schedule.status === 'cancelled';

                return (
                  <Card key={schedule.id} style={styles.scheduleCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.titleInfo}>
                        <AppText variant="subtitle" style={styles.ruleSummary}>
                          {getHumanScheduleText(schedule)}
                        </AppText>
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          Next run: {formatDate(schedule.nextRunAt, { timeZone: 'Asia/Karachi' })} (Asia/Karachi)
                        </AppText>
                      </View>

                      <Badge
                        label={schedule.status.toUpperCase()}
                        tone={
                          schedule.status === 'active'
                            ? 'success'
                            : isPaused
                            ? 'warning'
                            : 'error'
                        }
                      />
                    </View>

                    {!isCancelled && (
                      <View style={styles.cardActions}>
                        <View style={styles.actionBtn}>
                          <Button
                            label={isPaused ? 'Resume' : 'Pause'}
                            variant="secondary"
                            onPress={() => handleToggle(schedule)}
                          />
                        </View>
                        <View style={styles.actionBtn}>
                          <Button
                            label="Cancel"
                            variant="destructive"
                            onPress={() => handleCancel(schedule)}
                          />
                        </View>
                      </View>
                    )}
                  </Card>
                );
              })}
            </View>
          }
        />
      </ScrollView>

      {/* Create Schedule Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <AppText variant="title" style={styles.modalTitle}>
              Create Recurring Schedule
            </AppText>
            <AppText variant="caption" color={theme.colors.textMuted} style={styles.modalSubtitle}>
              Orders place automatically before cutoff with deterministic idempotency.
            </AppText>

            <View style={styles.tabRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select weekly delivery day"
                style={[styles.tab, ruleType === 'weekly' && styles.tabActive]}
                onPress={() => setRuleType('weekly')}
              >
                <AppText variant="caption" style={ruleType === 'weekly' ? styles.tabTextActive : undefined}>
                  Weekly Day
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select monthly delivery day"
                style={[styles.tab, ruleType === 'monthly' && styles.tabActive]}
                onPress={() => setRuleType('monthly')}
              >
                <AppText variant="caption" style={ruleType === 'monthly' ? styles.tabTextActive : undefined}>
                  Monthly Day
                </AppText>
              </Pressable>
            </View>

            {ruleType === 'weekly' && (
              <View style={styles.dayPicker}>
                {dayNames.map((name, idx) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={`Delivery on ${name}`}
                    style={[
                      styles.dayChip,
                      selectedDay === idx + 1 && { backgroundColor: theme.colors.primary },
                    ]}
                    onPress={() => setSelectedDay(idx + 1)}
                  >
                    <AppText
                      variant="caption"
                      color={selectedDay === idx + 1 ? '#FFF' : theme.colors.text}
                    >
                      {name.slice(0, 3)}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.modalButtons}>
              <View style={styles.btnFlex}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setModalVisible(false)}
                />
              </View>
              <View style={styles.btnFlex}>
                <Button
                  label="Create Schedule"
                  variant="primary"
                  onPress={handleCreateNew}
                />
              </View>
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  scheduleCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  titleInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  ruleSummary: {
    fontWeight: '700',
    marginBottom: 4,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    padding: spacing.lg,
    borderRadius: 16,
  },
  modalTitle: {
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#0B6E99',
  },
  tabTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  dayPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
    justifyContent: 'center',
  },
  dayChip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btnFlex: {
    flex: 1,
  },
});
