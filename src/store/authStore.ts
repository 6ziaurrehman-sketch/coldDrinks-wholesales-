import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import {
  authService,
  type SignUpPayload,
  type UserProfile,
  type UserShop,
} from '@/lib/authService';
import { AppError, mapSupabaseError } from '@/lib/errors';
import { ExpoSecureStoreAdapter, supabase } from '@/lib/supabase';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { resetAllStores } from '@/store/resetAllStores';
import type { AccountStatus, ShopRole } from '@/types/database.types';
import { normalizePhone } from '@/utils/phone';

const SNAPSHOT_KEY = 'colddrinks.auth_snapshot.v1';

export interface UserSnapshot {
  userId: string;
  email: string;
  phone: string | null;
  fullName: string | null;
  activeShopId: string | null;
  accountStatus: AccountStatus;
}

export interface OtpState {
  phone: string | null;
  sentAt: number | null;
  resendAvailableAt: number | null;
  attempts: number;
}

export interface AuthState extends AsyncSlice {
  session: Session | null;
  profile: UserProfile | null;
  activeShopId: string | null;
  shops: UserShop[];
  accountStatus: AccountStatus | null;
  otp: OtpState;
  redirectIntent: string | null;
  isBootstrapped: boolean;

  // Actions
  signInWithOtp: (phone: string) => Promise<void>;
  verifyOtp: (token: string) => Promise<void>;
  signInWithPassword: (emailOrPhone: string, password: string) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  requestAccountDeletion: (reason?: string) => Promise<void>;
  bootstrap: () => Promise<void>;
  setRedirectIntent: (intent: string | null) => void;
  setActiveShopId: (shopId: string) => void;
  setOtpState: (partial: Partial<OtpState>) => void;
}

const initialOtpState: OtpState = {
  phone: null,
  sentAt: null,
  resendAvailableAt: null,
  attempts: 0,
};

let realtimeChannel: RealtimeChannel | null = null;

function setupRealtimeProfileListener(userId: string, onUpdate: (profile: UserProfile) => void) {
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel(`public:profiles:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) {
          onUpdate(payload.new as UserProfile);
        }
      },
    )
    .subscribe();
}

async function saveUserSnapshot(snapshot: UserSnapshot | null) {
  try {
    if (snapshot) {
      await ExpoSecureStoreAdapter.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } else {
      await ExpoSecureStoreAdapter.removeItem(SNAPSHOT_KEY);
    }
  } catch (err) {
    console.warn('[authStore] Failed to persist user snapshot:', err);
  }
}

async function loadUserSnapshot(): Promise<UserSnapshot | null> {
  try {
    const raw = await ExpoSecureStoreAdapter.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...createAsyncSlice(set as any),

  session: null,
  profile: null,
  activeShopId: null,
  shops: [],
  accountStatus: null,
  otp: initialOtpState,
  redirectIntent: null,
  isBootstrapped: false,

  setRedirectIntent: (intent) => set({ redirectIntent: intent }),

  setActiveShopId: (shopId) => {
    set({ activeShopId: shopId });
    const { profile } = get();
    if (profile) {
      saveUserSnapshot({
        userId: profile.id,
        email: profile.email,
        phone: profile.phone,
        fullName: profile.full_name,
        activeShopId: shopId,
        accountStatus: profile.account_status,
      });
    }
  },

  setOtpState: (partial) => {
    set((state) => ({ otp: { ...state.otp, ...partial } }));
  },

  signInWithOtp: async (rawPhone) => {
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      throw new AppError({
        code: 'INVALID_PHONE',
        message: 'Please enter a valid Pakistani phone number (e.g. 0300 1234567).',
      });
    }

    await get().run(
      async () => {
        const { resendAvailableAt, attemptsLeft } = await authService.requestOtp(phone);
        set({
          otp: {
            phone,
            sentAt: Date.now(),
            resendAvailableAt,
            attempts: 5 - attemptsLeft,
          },
        });
      },
      { rethrow: true },
    );
  },

  verifyOtp: async (token) => {
    const phone = get().otp.phone;
    if (!phone) {
      throw new AppError({
        code: 'MISSING_PHONE',
        message: 'No phone number provided for OTP verification. Please request a new code.',
      });
    }

    await get().run(
      async () => {
        try {
          const { session } = await authService.verifyOtp(phone, token);
          set({ session });

          if (session?.user) {
            await get().refreshProfile();
          }

          // Clear OTP state on success
          set({ otp: initialOtpState });
        } catch (err) {
          // Increment attempts on failure
          set((state) => ({
            otp: { ...state.otp, attempts: state.otp.attempts + 1 },
          }));
          throw err;
        }
      },
      { rethrow: true },
    );
  },

  signInWithPassword: async (emailOrPhone, password) => {
    await get().run(
      async () => {
        const { session } = await authService.signInWithPassword(emailOrPhone, password);
        set({ session });
        if (session?.user) {
          await get().refreshProfile();
        }
      },
      { rethrow: true },
    );
  },

  signUp: async (payload) => {
    await get().run(
      async () => {
        const { accountStatus } = await authService.signUp(payload);
        set({ accountStatus });

        // If email confirmation is not required or session exists, refresh profile
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          set({ session: data.session });
          await get().refreshProfile();
        }
      },
      { rethrow: true },
    );
  },

  signOut: async () => {
    await get().run(
      async () => {
        if (realtimeChannel) {
          realtimeChannel.unsubscribe();
          realtimeChannel = null;
        }

        await authService.signOut().catch(() => undefined);
        await saveUserSnapshot(null);
        await resetAllStores();

        set({
          session: null,
          profile: null,
          activeShopId: null,
          shops: [],
          accountStatus: null,
          otp: initialOtpState,
        });
      },
      { rethrow: true },
    );
  },

  requestPasswordReset: async (email) => {
    await get().run(
      async () => {
        await authService.requestPasswordReset(email);
      },
      { rethrow: true },
    );
  },

  updatePassword: async (newPassword) => {
    await get().run(
      async () => {
        await authService.updatePassword(newPassword);
      },
      { rethrow: true },
    );
  },

  requestAccountDeletion: async (reason) => {
    await get().run(
      async () => {
        await authService.requestAccountDeletion(reason);
        set({ accountStatus: 'deactivated' });
      },
      { rethrow: true },
    );
  },

  refreshProfile: async () => {
    const session = get().session;
    const userId = session?.user?.id;
    if (!userId) return;

    try {
      const { profile, shops } = await authService.fetchUserProfileAndShops(userId);
      const activeShopId =
        get().activeShopId && shops.some((s) => s.shopId === get().activeShopId)
          ? get().activeShopId
          : profile?.active_shop_id ?? shops.find((s) => s.isActive)?.shopId ?? shops[0]?.shopId ?? null;

      const accountStatus = profile?.account_status ?? 'pending_approval';

      set({
        profile,
        shops,
        activeShopId,
        accountStatus,
      });

      if (profile) {
        await saveUserSnapshot({
          userId: profile.id,
          email: profile.email,
          phone: profile.phone,
          fullName: profile.full_name,
          activeShopId,
          accountStatus,
        });

        // Setup realtime status listener
        setupRealtimeProfileListener(profile.id, (updatedProfile) => {
          set({
            profile: updatedProfile,
            accountStatus: updatedProfile.account_status,
          });
        });
      }
    } catch (error) {
      console.warn('[authStore] Failed to refresh profile:', error);
    }
  },

  bootstrap: async () => {
    try {
      // 1. Check if snapshot exists to restore UI instantly
      const snapshot = await loadUserSnapshot();
      if (snapshot) {
        set({
          accountStatus: snapshot.accountStatus,
          activeShopId: snapshot.activeShopId,
        });
      }

      // 2. Fetch session from Supabase
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw mapSupabaseError(error);
      }

      const currentSession = data.session;
      set({ session: currentSession });

      if (currentSession?.user) {
        await get().refreshProfile();
      } else {
        await saveUserSnapshot(null);
        set({
          profile: null,
          shops: [],
          activeShopId: null,
          accountStatus: null,
        });
      }
    } catch (err) {
      console.warn('[authStore] Bootstrap error:', err);
    } finally {
      set({ isBootstrapped: true });
    }
  },
}));

// Selectors
export const selectIsAuthenticated = (state: AuthState): boolean =>
  Boolean(state.session && state.profile);

export const selectCanPlaceOrders = (state: AuthState): boolean =>
  state.accountStatus === 'active' && Boolean(state.activeShopId);

export const selectRole = (state: AuthState): ShopRole | null => {
  if (!state.activeShopId) return null;
  const shop = state.shops.find((s) => s.shopId === state.activeShopId);
  return shop ? shop.role : null;
};
