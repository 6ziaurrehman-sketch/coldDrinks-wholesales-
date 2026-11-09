import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SectionList,
  RefreshControl,
  Linking,
  Modal,
} from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Button, Card, EmptyState } from '@/components/ui';
import { NotificationItemRow } from '@/components/notifications/NotificationItemRow';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import type { NotificationItem } from '@/types/notifications.types';

export default function NotificationsInboxScreen() {
  const theme = useTheme();
  const { activeShopId } = useAuthStore();
  const {
    items,
    unreadCount,
    loading,
    loadingMore,
    permissionStatus,
    load,
    loadMore,
    markRead,
    markAllRead,
    handleTap,
  } = useNotificationStore();

  const [todayDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [yesterdayDateStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });

  const [fallbackModalVisible, setFallbackModalVisible] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState('');

  const fetchInbox = useCallback(() => {
    if (activeShopId) {
      void load(activeShopId);
    }
  }, [activeShopId, load]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const handleNotificationPress = (item: NotificationItem) => {
    try {
      handleTap(item);
    } catch {
      setFallbackMessage(t('notifications.itemUnavailable'));
      setFallbackModalVisible(true);
    }
  };

  const handleMarkAllRead = () => {
    if (activeShopId) {
      void markAllRead(activeShopId);
    }
  };

  const handleOpenSettings = () => {
    void Linking.openSettings();
  };

  // Group notifications into Today, Yesterday, Earlier
  const sections = useMemo(() => {
    const todayItems: NotificationItem[] = [];
    const yesterdayItems: NotificationItem[] = [];
    const earlierItems: NotificationItem[] = [];

    items.forEach((item) => {
      const itemDateStr = item.createdAt ? item.createdAt.slice(0, 10) : '';
      if (itemDateStr === todayDateStr) {
        todayItems.push(item);
      } else if (itemDateStr === yesterdayDateStr) {
        yesterdayItems.push(item);
      } else {
        earlierItems.push(item);
      }
    });

    const result = [];
    if (todayItems.length > 0) {
      result.push({ title: t('notifications.today'), data: todayItems });
    }
    if (yesterdayItems.length > 0) {
      result.push({ title: t('notifications.yesterday'), data: yesterdayItems });
    }
    if (earlierItems.length > 0) {
      result.push({ title: t('notifications.earlier'), data: earlierItems });
    }
    return result;
  }, [items, todayDateStr, yesterdayDateStr]);

  return (
    <Screen
      title={t('notifications.title')}
      scroll={false}
      onBack={router.back}
      rightAction={
        unreadCount > 0 ? (
          <Button
            label={t('notifications.markAllRead')}
            variant="ghost"
            onPress={handleMarkAllRead}
          />
        ) : undefined
      }
    >
      <ScreenState
        status={loading && items.length === 0 ? 'loading' : 'data'}
        onRetry={fetchInbox}
        data={
          <View style={styles.container}>
            {/* Permission Denied Gentle Banner */}
            {permissionStatus === 'denied' && (
              <Card
                style={[
                  styles.permissionCard,
                  { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary },
                ]}
              >
                <View style={styles.permissionRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="subtitle" color={theme.colors.primary}>
                      🔔 {t('notifications.permissionBannerTitle')}
                    </AppText>
                    <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                      {t('notifications.permissionBannerDesc')}
                    </AppText>
                  </View>
                  <Button
                    label={t('notifications.openSettings')}
                    variant="primary"
                    onPress={handleOpenSettings}
                  />
                </View>
              </Card>
            )}

            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={fetchInbox}
                  colors={[theme.colors.primary]}
                  tintColor={theme.colors.primary}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <EmptyState
                    title={t('notifications.emptyTitle')}
                    message={t('notifications.emptyMessage')}
                  />
                </View>
              }
                renderSectionHeader={({ section: { title } }) => (
                  <View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
                    <AppText variant="caption" color={theme.colors.textMuted} style={{ fontWeight: '700' }}>
                      {title.toUpperCase()}
                    </AppText>
                  </View>
                )}
                renderItem={({ item }) => (
                  <NotificationItemRow
                    item={item}
                    onPress={handleNotificationPress}
                    onMarkRead={markRead}
                  />
                )}
                onEndReached={loadMore}
                onEndReachedThreshold={0.3}
                ListFooterComponent={
                  loadingMore ? (
                    <View style={styles.footerLoader}>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        Loading more...
                      </AppText>
                    </View>
                  ) : null
                }
              />
          </View>
        }
      />

      {/* Fallback modal if target item was deleted or unavailable */}
      <Modal
        visible={fallbackModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFallbackModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <AppText variant="title">ℹ️ Notice</AppText>
            <AppText variant="body" color={theme.colors.textMuted} style={{ marginVertical: 12 }}>
              {fallbackMessage || t('notifications.itemUnavailable')}
            </AppText>
            <Button
              label="OK"
              variant="primary"
              onPress={() => setFallbackModalVisible(false)}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  permissionCard: {
    margin: 16,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerLoader: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
});
