import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const memoryStore = new Map<string, string>();

export const appStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : memoryStore.get(key) || null;
      } catch {
        return memoryStore.get(key) || null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return memoryStore.get(key) || null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryStore.set(key, value);
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      } catch {
        // Ignore web storage quota error
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Handled in memory fallback
    }
  },

  async removeItem(key: string): Promise<void> {
    memoryStore.delete(key);
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      } catch {
        // Ignore
      }
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Handled in memory fallback
    }
  },
};
