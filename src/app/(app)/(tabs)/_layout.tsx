import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Dynamic safe-area bottom calculation so labels never get cut off on any device size
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 0);
  const bottomPadding = Platform.select({
    ios: bottomInset > 0 ? bottomInset : 12,
    android: bottomInset > 0 ? bottomInset + 4 : 10,
    web: 8,
    default: 10,
  });

  const tabBarHeight = Platform.select({
    ios: 62 + (bottomInset > 0 ? bottomInset : 12),
    android: 68 + (bottomInset > 0 ? bottomInset + 4 : 10),
    web: 70,
    default: 72,
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: bottomPadding,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 1,
          marginBottom: 1,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarAccessibilityLabel: 'Dashboard',
          tabBarIcon: ({ color }) => <Ionicons name="speedometer-outline" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'New Sale',
          tabBarLabel: 'New Sale',
          tabBarAccessibilityLabel: 'New Sale',
          tabBarIcon: ({ color }) => <Ionicons name="flash-outline" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Inventory',
          tabBarLabel: 'Inventory',
          tabBarAccessibilityLabel: 'Inventory',
          tabBarIcon: ({ color }) => <Ionicons name="cube-outline" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders & Slips',
          tabBarLabel: 'Orders & Slips',
          tabBarAccessibilityLabel: 'Orders & Slips',
          tabBarIcon: ({ color }) => <Ionicons name="receipt-outline" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen name="demo" options={{ href: null, title: t('demo.title') }} />
    </Tabs>
  );
}
