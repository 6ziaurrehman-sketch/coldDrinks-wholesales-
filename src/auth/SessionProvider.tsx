import { router } from 'expo-router';
import { createContext, use, useEffect, useMemo, type PropsWithChildren } from 'react';

import { setSessionExpiredHandler, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { AccountStatus, Tables } from '@/types/database.types';

export type UserProfile = Tables<'profiles'>;

export type SessionContextValue = {
  session: string | null;
  isLoading: boolean;
  accountStatus: AccountStatus | null;
  profile: UserProfile | null;
  activeShopId: string | null;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const sessionObj = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const accountStatus = useAuthStore((s) => s.accountStatus);
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const authSignOut = useAuthStore((s) => s.signOut);
  const setRedirectIntent = useAuthStore((s) => s.setRedirectIntent);

  const sessionToken = sessionObj?.access_token ?? null;
  const isLoading = !isBootstrapped;

  useEffect(() => {
    // 1. Register session expiration intent handler
    setSessionExpiredHandler((intentRoute) => {
      if (intentRoute) {
        setRedirectIntent(intentRoute);
        router.replace({ pathname: '/(auth)/login', params: { redirect: intentRoute } } as any);
      } else {
        router.replace('/(auth)/login');
      }
    });

    // 2. Bootstrap auth state
    bootstrap();

    // 3. Listen to Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      useAuthStore.setState({ session: newSession });
      if (newSession?.user) {
        await useAuthStore.getState().refreshProfile();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [bootstrap, setRedirectIntent]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session: sessionToken,
      isLoading,
      accountStatus,
      profile,
      activeShopId,
      signOut: authSignOut,
    }),
    [sessionToken, isLoading, accountStatus, profile, activeShopId, authSignOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = use(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}
