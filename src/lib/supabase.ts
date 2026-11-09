import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/types/database.types';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qtzkuonkcfgdhxuvazha.supabase.co';
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_4z58y86_ox2WNFfgHrjJWw_CaMYk7F9';

/**
 * Expo SecureStore adapter with web fallback.
 * Provides encrypted persistent storage for session tokens on iOS and Android.
 */
export const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to retrieve key:', key, error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, value);
        }
      } catch {}
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.warn('[SecureStore] Failed to persist key:', key, error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(key);
        }
      } catch {}
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to remove key:', key, error);
    }
  },
};

/**
 * Strongly typed Supabase Client
 */
export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * AppState listener: starts token auto-refresh when app is foregrounded,
 * and pauses it when app moves to background/inactive.
 */
AppState.addEventListener('change', (nextState) => {
  if (nextState === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// Cache clock drift offset in ms (serverTime - clientTime)
let serverTimeDriftMs = 0;
let isClockDriftCalibrated = false;

/**
 * Calibrates client clock with server timestamp to prevent clock skew
 * issues during token validation and idempotency expiry.
 */
export async function calibrateClockSkew(): Promise<number> {
  try {
    const start = Date.now();
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: supabasePublishableKey },
    });
    const roundTrip = (Date.now() - start) / 2;
    const dateHeader = response.headers.get('date');

    if (dateHeader) {
      const serverDate = new Date(dateHeader).getTime();
      serverTimeDriftMs = serverDate + roundTrip - Date.now();
      isClockDriftCalibrated = true;
    }
  } catch {
    // If request fails, fallback to zero drift
  }
  return serverTimeDriftMs;
}

/**
 * Returns current estimated server time in epoch ms, accounting for clock skew.
 */
export function getEstimatedServerTime(): number {
  return Date.now() + (isClockDriftCalibrated ? serverTimeDriftMs : 0);
}

/**
 * Callback handler for auth redirects on unrecoverable session expiration
 */
type SessionExpirationHandler = (currentRoute?: string) => void;
let onSessionExpiredCallback: SessionExpirationHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpirationHandler) {
  onSessionExpiredCallback = handler;
}

/**
 * Refresh session once; if refresh fails, triggers redirect to login preserving intent.
 */
export async function refreshSessionOrRedirect(intentRoute?: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) {
      return true;
    }
  } catch {
    // Refresh attempt threw exception
  }

  // Session could not be refreshed. Clear tokens and trigger navigation callback
  try {
    await supabase.auth.signOut();
  } catch {}

  if (onSessionExpiredCallback) {
    onSessionExpiredCallback(intentRoute);
  }
  return false;
}
