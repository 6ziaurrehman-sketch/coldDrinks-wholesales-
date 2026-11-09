import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ExpoSecureStoreAdapter } from '@/lib/supabase';
import Constants from 'expo-constants';
import { settingsService } from '@/lib/settingsService';
import type { AppLanguage, AppPreferences } from '@/types/settings.types';

const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return await ExpoSecureStoreAdapter.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await ExpoSecureStoreAdapter.setItem(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await ExpoSecureStoreAdapter.removeItem(name);
  },
};

interface SettingsState {
  language: AppLanguage;
  preferences: AppPreferences;
  currentVersion: string;
  isUpdateAvailable: boolean;
  minVersion?: string;
  updateCheckStatus: 'idle' | 'checking' | 'up_to_date' | 'update_available';

  // Actions
  setLanguage: (lang: AppLanguage) => void;
  updatePreferences: (prefs: Partial<AppPreferences>) => void;
  checkAppUpdate: () => Promise<void>;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      language: 'en',
      preferences: {
        biometricAuth: false,
        autoReorderReminder: true,
        pushEnabled: true,
        orderStatusSms: true,
      },
      currentVersion: Constants.expoConfig?.version ?? '1.0.0',
      isUpdateAvailable: false,
      minVersion: undefined,
      updateCheckStatus: 'idle',

      setLanguage: (lang: AppLanguage) => {
        set({ language: lang });
      },

      updatePreferences: (prefs: Partial<AppPreferences>) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            ...prefs,
          },
        }));
      },

      checkAppUpdate: async () => {
        set({ updateCheckStatus: 'checking' });
        try {
          const res = await settingsService.checkAppVersion();
          set({
            currentVersion: res.currentVersion,
            isUpdateAvailable: res.isUpdateAvailable,
            minVersion: res.minVersion,
            updateCheckStatus: res.isUpdateAvailable ? 'update_available' : 'up_to_date',
          });
        } catch {
          // Silent failure per requirements
          set({ updateCheckStatus: 'idle' });
        }
      },

      reset: () => {
        set({
          language: 'en',
          preferences: {
            biometricAuth: false,
            autoReorderReminder: true,
            pushEnabled: true,
            orderStatusSms: true,
          },
          isUpdateAvailable: false,
          updateCheckStatus: 'idle',
        });
      },
    }),
    {
      name: 'colddrinks-settings-storage',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        language: state.language,
        preferences: state.preferences,
      }),
    },
  ),
);
