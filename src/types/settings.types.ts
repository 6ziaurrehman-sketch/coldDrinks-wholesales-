import type { ShopRole } from '@/types/database.types';

export type AppLanguage = 'en' | 'ur';

export interface AppPreferences {
  biometricAuth: boolean;
  autoReorderReminder: boolean;
  pushEnabled: boolean;
  orderStatusSms: boolean;
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4; // 0=Very Weak, 1=Weak, 2=Fair, 3=Good, 4=Strong
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  feedback: string[];
}

export interface AccountDeletionCheck {
  canDelete: boolean;
  reason?: 'ACTIVE_ORDERS' | 'OUTSTANDING_BALANCE' | null;
  message: string;
}

export interface SettingsMenuItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  route?: string;
  onPress?: () => void;
  allowedRoles?: ShopRole[];
  badge?: string;
  destructive?: boolean;
}
