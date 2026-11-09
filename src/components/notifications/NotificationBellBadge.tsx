import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { useNotificationStore } from '@/store/notificationStore';
import { useTheme } from '@/hooks/useTheme';

interface NotificationBellBadgeProps {
  tintColor?: string;
}

export function NotificationBellBadge({ tintColor }: NotificationBellBadgeProps) {
  const theme = useTheme();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Notifications, ${unreadCount} unread`}
      onPress={() => router.push('/notifications')}
      style={styles.container}
    >
      <AppText variant="title" color={tintColor || theme.colors.text}>
        🔔
      </AppText>
      {unreadCount > 0 && (
        <View style={[styles.badge, { backgroundColor: theme.colors.error }]}>
          <AppText variant="caption" color="#fff" style={styles.badgeText}>
            {badgeText}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 6,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
