import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
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

/**
 * Checks for published EAS OTA updates on startup and foreground resume
 * so users can immediately apply new updates instead of waiting for two restarts.
 */
function OtaUpdateController() {
  const lastCheckAtRef = useRef(0);
  const checkingRef = useRef(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) {
      return;
    }

    const checkAndFetch = async () => {
      const now = Date.now();
      if (checkingRef.current || promptedRef.current || now - lastCheckAtRef.current < 60000) {
        return;
      }
      checkingRef.current = true;
      lastCheckAtRef.current = now;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          const fetched = await Updates.fetchUpdateAsync();
          if (fetched.isNew && !promptedRef.current) {
            promptedRef.current = true;
            Alert.alert(
              'Update Ready',
              'A new update has been downloaded. Restart now to see the latest changes.',
              [
                { text: 'Later', style: 'cancel' },
                {
                  text: 'Restart Now',
                  onPress: () => {
                    void Updates.reloadAsync();
                  },
                },
              ]
            );
          }
        }
      } catch {
        // Ignore offline/Expo Go/rate-limit errors cleanly
      } finally {
        checkingRef.current = false;
      }
    };

    void checkAndFetch();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkAndFetch();
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

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
            <OtaUpdateController />
            <RootNavigator />
          </SessionProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
