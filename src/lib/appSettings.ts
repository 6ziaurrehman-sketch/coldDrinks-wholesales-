import Constants from 'expo-constants';

import { AppError, ErrorCode, mapSupabaseError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database.types';

export type AppSettings = Tables<'app_settings'>;

export interface VersionCheckResult {
  isUpdateRequired: boolean;
  currentVersion: string;
  minimumVersion: string;
  forceUpdateMessage: string;
  storeUrl: string;
}

/**
 * Compares two semantic version strings (e.g., "1.2.3" vs "1.2.4").
 * Returns:
 *  -1 if v1 < v2
 *   0 if v1 === v2
 *   1 if v1 > v2
 */
export function compareSemver(v1: string, v2: string): number {
  const cleanV1 = v1.replace(/[^0-9.]/g, '').split('.').map(Number);
  const cleanV2 = v2.replace(/[^0-9.]/g, '').split('.').map(Number);

  const length = Math.max(cleanV1.length, cleanV2.length);

  for (let i = 0; i < length; i++) {
    const num1 = cleanV1[i] ?? 0;
    const num2 = cleanV2[i] ?? 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

/**
 * Retrieves the current installed app version from Expo Constants or default '1.0.0'
 */
export function getCurrentAppVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

/**
 * Fetches app_settings from Supabase and performs the minimum app version check.
 */
export async function checkAppVersion(): Promise<VersionCheckResult> {
  const currentVersion = getCurrentAppVersion();

  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('key', 'global_config')
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    const minimumVersion = data?.minimum_app_version ?? '1.0.0';
    const forceUpdateMessage =
      data?.force_update_message ??
      'A newer version of the application is required to continue. Please update now.';
    const storeUrl =
      data?.store_url ??
      'https://play.google.com/store/apps';

    const isUpdateRequired = compareSemver(currentVersion, minimumVersion) < 0;

    return {
      isUpdateRequired,
      currentVersion,
      minimumVersion,
      forceUpdateMessage,
      storeUrl,
    };
  } catch (err) {
    // If offline or unable to reach Supabase, fallback safely without blocking unless hard error
    if (err instanceof AppError && err.code === ErrorCode.NETWORK_OFFLINE) {
      return {
        isUpdateRequired: false,
        currentVersion,
        minimumVersion: currentVersion,
        forceUpdateMessage: '',
        storeUrl: '',
      };
    }
    throw mapSupabaseError(err);
  }
}
