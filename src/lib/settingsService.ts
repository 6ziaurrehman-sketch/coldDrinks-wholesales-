import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import type {
  AccountDeletionCheck,
  PasswordStrengthResult,
  SettingsMenuItem,
} from '@/types/settings.types';
import type { ShopRole } from '@/types/database.types';

/**
 * Calculates password strength meter (score 0 to 4) with clear feedback.
 */
export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      score: 0,
      label: 'Very Weak',
      color: '#EF4444',
      feedback: ['Enter a password'],
    };
  }

  const feedback: string[] = [];
  let score = 0;

  // Length checks
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('At least 8 characters required');
  }

  // Lowercase & Uppercase
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include both uppercase and lowercase letters');
  }

  // Numbers
  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one number (0-9)');
  }

  // Special characters
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one special symbol (!@#$%...)');
  }

  // Normalize score
  const safeScore = Math.min(4, Math.max(0, score)) as 0 | 1 | 2 | 3 | 4;

  const scoreMap: Record<0 | 1 | 2 | 3 | 4, { label: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong'; color: string }> = {
    0: { label: 'Very Weak', color: '#EF4444' },
    1: { label: 'Weak', color: '#F97316' },
    2: { label: 'Fair', color: '#EAB308' },
    3: { label: 'Good', color: '#3B82F6' },
    4: { label: 'Strong', color: '#10B981' },
  };

  return {
    score: safeScore,
    label: scoreMap[safeScore].label,
    color: scoreMap[safeScore].color,
    feedback: feedback.length > 0 ? feedback : ['Strong and secure password'],
  };
}

/**
 * Filters settings menu items strictly by role permissions.
 * Staff cannot see credit or payment preferences.
 */
export function filterMenuByRole(
  items: SettingsMenuItem[],
  role: ShopRole | null,
): SettingsMenuItem[] {
  if (!role) return [];
  return items.filter((item) => {
    if (!item.allowedRoles) return true;
    return item.allowedRoles.includes(role);
  });
}

export const settingsService = {
  checkCanDeleteAccount: async (shopId: string): Promise<AccountDeletionCheck> => {
    try {
      const { data, error } = await (supabase.rpc as any)('check_can_delete_account', {
        p_shop_id: shopId,
      });

      if (error) {
        throw new Error(error.message);
      }

      const res = data as any;
      return {
        canDelete: !!res?.can_delete,
        reason: res?.reason || null,
        message: res?.message || '',
      };
    } catch (err: any) {
      return {
        canDelete: false,
        reason: null,
        message: err.message || 'Unable to check account deletion eligibility.',
      };
    }
  },

  checkAppVersion: async (): Promise<{
    isUpdateAvailable: boolean;
    currentVersion: string;
    minVersion?: string;
  }> => {
    const currentVersion = Constants.expoConfig?.version ?? '1.0.0';

    try {
      const { data, error } = await (supabase as any)
        .from('app_settings')
        .select('minimum_app_version')
        .eq('key', 'default')
        .single();

      if (!error && data?.minimum_app_version) {
        const minVersion = data.minimum_app_version;
        // Compare semantic version (e.g. 1.0.0 vs 1.1.0)
        const isOutdated = compareSemVer(currentVersion, minVersion) < 0;
        return {
          isUpdateAvailable: isOutdated,
          currentVersion,
          minVersion,
        };
      }
    } catch {
      // Fails silently per requirements
    }

    return {
      isUpdateAvailable: false,
      currentVersion,
    };
  },
};

function compareSemVer(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}
