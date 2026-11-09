import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/auth/SessionProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ForceUpdateGate } from '@/components/ForceUpdateGate';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { ToastViewport } from '@/components/ui/Toast';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTheme } from '@/hooks/useTheme';

SplashScreen.preventAutoHideAsync();

export { ErrorBoundary };

function SplashController() {
  const { isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  return null;
}

function RootNavigator() {
  const { session, accountStatus } = useSession();
  const theme = useTheme();
  useNetworkStatus();

  const isAppAllowed = !!session && accountStatus === 'active';
  const isAuthAllowed = !session || accountStatus !== 'active';

  return (
    <ForceUpdateGate>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}>
        <Stack.Protected guard={isAppAllowed}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthAllowed}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Screen name="force-update" />
      </Stack>
      <ToastViewport />
    </ForceUpdateGate>
  );
}


export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <SessionProvider>
            <SplashController />
            <RootNavigator />
          </SessionProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
