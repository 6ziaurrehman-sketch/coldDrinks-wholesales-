import type { Session } from '@supabase/supabase-js';

import { AppError, mapSupabaseError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { AccountStatus, ShopRole, Tables } from '@/types/database.types';
import { normalizePhone } from '@/utils/phone';

export type UserProfile = Tables<'profiles'>;
export type ShopRow = Tables<'shops'>;

export interface UserShop {
  shopId: string;
  shopName: string;
  role: ShopRole;
  isActive: boolean;
  businessId: string;
}

export interface SelfRegisterPayload {
  isInvited: false;
  email: string;
  phone: string;
  password?: string;
  fullName: string;
  businessName: string;
  shopName: string;
  shopAddress: string;
}

export interface InvitedRegisterPayload {
  isInvited: true;
  inviteCode: string;
  email: string;
  phone: string;
  password?: string;
  fullName: string;
}

export type SignUpPayload = SelfRegisterPayload | InvitedRegisterPayload;

export interface OtpRateLimitResult {
  allowed: boolean;
  waitSeconds: number;
  attemptsLeft?: number;
  cooldownMessage?: string;
  resendAvailableAt?: string;
}

export class AuthService {
  /**
   * Request an SMS OTP with server-side rate limit validation
   */
  async requestOtp(rawPhone: string): Promise<{ resendAvailableAt: number; attemptsLeft: number }> {
    const normalized = normalizePhone(rawPhone);
    if (!normalized) {
      throw new AppError({
        code: 'INVALID_PHONE',
        message: 'Please enter a valid Pakistani phone number (e.g. 0300 1234567).',
      });
    }

    // 1. Check server-side rate limit
    const { data: limitData, error: limitError } = await supabase.rpc('check_otp_rate_limit', {
      p_phone: normalized,
    });

    if (limitError) {
      console.warn('[AuthService] Rate limit RPC failed, proceeding to Auth:', limitError);
    } else if (limitData) {
      const res = limitData as any;
      if (!res.allowed) {
        throw new AppError({
          code: 'OTP_RATE_LIMITED',
          message: res.cooldown_message || 'Too many attempts. Try again in 10 minutes.',
          details: { waitSeconds: res.wait_seconds },
        });
      }
    }

    // 2. Call Supabase Auth signInWithOtp
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
    });

    if (error) {
      const mapped = mapSupabaseError(error);
      if (mapped.message.toLowerCase().includes('rate limit')) {
        throw new AppError({
          code: 'OTP_RATE_LIMITED',
          message: 'Too many attempts. Try again in 10 minutes.',
        });
      }
      throw mapped;
    }

    const resendAt = Date.now() + 60 * 1000;
    return {
      resendAvailableAt: resendAt,
      attemptsLeft: (limitData as any)?.attempts_left ?? 4,
    };
  }

  /**
   * Verifies the 6-digit OTP token
   */
  async verifyOtp(rawPhone: string, token: string): Promise<{ session: Session | null }> {
    const normalized = normalizePhone(rawPhone);
    if (!normalized) {
      throw new AppError({
        code: 'INVALID_PHONE',
        message: 'Invalid phone number format.',
      });
    }

    if (token.trim().length !== 6) {
      throw new AppError({
        code: 'INVALID_OTP_LENGTH',
        message: 'Please enter the complete 6-digit verification code.',
      });
    }

    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: token.trim(),
      type: 'sms',
    });

    if (error) {
      // Record failure attempt on server
      const { data: failData } = await supabase.rpc('record_otp_verification_failure', {
        p_phone: normalized,
      });

      const failRes = failData as any;
      if (failRes?.is_locked) {
        throw new AppError({
          code: 'OTP_MAX_ATTEMPTS',
          message: 'Too many attempts. Try again in 10 minutes.',
        });
      }

      const attemptsLeft = failRes?.attempts_left;
      const message =
        attemptsLeft !== undefined && attemptsLeft > 0
          ? `That code is incorrect. ${attemptsLeft} attempts left.`
          : 'That code is incorrect or has expired. Please request a new code.';

      throw new AppError({
        code: 'INVALID_OTP',
        message,
        details: { attemptsLeft },
        rawError: error,
      });
    }

    // Reset rate limits on success
    try {
      await supabase.rpc('reset_otp_rate_limit', { p_phone: normalized });
    } catch {}

    return { session: data.session };
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  /**
   * Password sign in (Email or Phone + Password)
   */
  async signInWithPassword(emailOrPhone: string, password: string): Promise<{ session: Session | null }> {
    const trimmed = emailOrPhone.trim();
    let credentials: { email?: string; phone?: string; password: string };

    if (trimmed.includes('@')) {
      credentials = { email: trimmed.toLowerCase(), password };
    } else {
      const normalizedPhone = normalizePhone(trimmed);
      if (!normalizedPhone) {
        throw new AppError({
          code: 'INVALID_CREDENTIALS',
          message: 'Please enter a valid email address or Pakistani mobile number.',
        });
      }
      credentials = { phone: normalizedPhone, password };
    }

    const { data, error } = await supabase.auth.signInWithPassword(credentials as any);
    if (error) {
      const mapped = mapSupabaseError(error);
      if (mapped.message.toLowerCase().includes('invalid login credentials')) {
        throw new AppError({
          code: 'INVALID_CREDENTIALS',
          message: 'Incorrect email/phone or password. Please verify and try again.',
          rawError: error,
        });
      }
      throw mapped;
    }

    return { session: data.session };
  }

  /**
   * Signup for invited or self-registered business users
   */
  async signUp(payload: SignUpPayload): Promise<{ user: any; accountStatus: AccountStatus }> {
    const normalizedPhone = normalizePhone(payload.phone);
    if (!normalizedPhone) {
      throw new AppError({
        code: 'INVALID_PHONE',
        message: 'Please provide a valid Pakistani mobile number.',
      });
    }

    const cleanEmail = payload.email.trim().toLowerCase();

    // 1. Create auth user in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      phone: normalizedPhone,
      password: payload.password || `Temp!${Math.random().toString(36).slice(2, 10)}Aa1`,
      options: {
        data: {
          full_name: payload.fullName.trim(),
        },
      },
    });

    if (authError) {
      const mapped = mapSupabaseError(authError);
      if (mapped.message.toLowerCase().includes('already registered')) {
        throw new AppError({
          code: 'CONFLICT_UNIQUE',
          message: 'An account with this email or phone is already registered. Please sign in instead.',
        });
      }
      throw mapped;
    }

    const userId = authData.user?.id;
    if (!userId) {
      throw new AppError({
        code: 'SIGNUP_FAILED',
        message: 'Failed to create user account. Please try again.',
      });
    }

    // 2. Perform business self-registration or invitation linking
    if (payload.isInvited) {
      const { data: inviteRes, error: inviteError } = await supabase.rpc('accept_invitation', {
        p_code: payload.inviteCode,
        p_user_id: userId,
        p_email: cleanEmail,
        p_phone: normalizedPhone,
        p_full_name: payload.fullName.trim(),
      });

      if (inviteError) {
        throw mapSupabaseError(inviteError);
      }

      return {
        user: authData.user,
        accountStatus: (inviteRes as any)?.account_status || 'active',
      };
    } else {
      const { data: regRes, error: regError } = await supabase.rpc('register_self_with_business', {
        p_user_id: userId,
        p_email: cleanEmail,
        p_phone: normalizedPhone,
        p_full_name: payload.fullName.trim(),
        p_business_name: payload.businessName.trim(),
        p_shop_name: payload.shopName.trim(),
        p_shop_address: payload.shopAddress.trim(),
      });

      if (regError) {
        throw mapSupabaseError(regError);
      }

      return {
        user: authData.user,
        accountStatus: (regRes as any)?.account_status || 'pending_approval',
      };
    }
  }

  /**
   * Request password reset link / email
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: 'colddrinks://reset-password',
    });

    if (error) {
      throw mapSupabaseError(error);
    }
  }

  /**
   * Update account password
   */
  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      throw mapSupabaseError(error);
    }
  }

  /**
   * Submit an account deletion request
   */
  async requestAccountDeletion(reason?: string): Promise<void> {
    const { error } = await supabase.rpc('submit_account_deletion_request', {
      p_reason: reason || 'User requested account deletion',
    });

    if (error) {
      throw mapSupabaseError(error);
    }
  }

  /**
   * Fetches profile and list of associated shops for user
   */
  async fetchUserProfileAndShops(userId: string): Promise<{ profile: UserProfile | null; shops: UserShop[] }> {
    // 1. Fetch Profile
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profError) {
      throw mapSupabaseError(profError);
    }

    // 2. Fetch Shop Memberships
    const { data: memberships, error: memberError } = await supabase
      .from('shop_users')
      .select(`
        shop_id,
        role,
        shops:shop_id (
          id,
          name,
          is_active,
          business_id
        )
      `)
      .eq('user_id', userId);

    if (memberError) {
      throw mapSupabaseError(memberError);
    }

    const shops: UserShop[] = (memberships || [])
      .filter((m: any) => m.shops)
      .map((m: any) => ({
        shopId: m.shop_id,
        shopName: m.shops.name,
        role: m.role,
        isActive: m.shops.is_active,
        businessId: m.shops.business_id,
      }));

    return { profile, shops };
  }
}

export const authService = new AuthService();
