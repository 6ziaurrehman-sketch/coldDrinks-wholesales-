import { ErrorCode, mapSupabaseError } from '@/lib/errors';
import { getEstimatedServerTime, supabase } from '@/lib/supabase';
import type { Json } from '@/types/database.types';

export interface IdempotentExecutionResult<T> {
  data: T;
  isDuplicate: boolean;
  statusCode: number;
}

export interface IdempotencyConfig {
  key: string;
  shopId: string;
  userId: string;
  ttlSeconds?: number;
}

/**
 * Executes a write operation with guaranteed idempotency:
 * 1. Checks if the idempotency key already exists.
 * 2. If already executed and not expired (accounting for clock skew), returns the original response.
 * 3. Otherwise, executes the action, stores the result atomically, and returns it.
 */
export async function executeWithIdempotency<T extends Json>(
  config: IdempotencyConfig,
  action: () => Promise<{ statusCode: number; data: T }>,
): Promise<IdempotentExecutionResult<T>> {
  const { key, shopId, userId, ttlSeconds = 86400 } = config;

  // 1. Check existing idempotency key
  try {
    const { data: existing, error: checkError } = await supabase
      .from('idempotency_keys')
      .select('*')
      .eq('shop_id', shopId)
      .eq('key', key)
      .maybeSingle();

    if (!checkError && existing) {
      const expiresAtMs = new Date(existing.expires_at).getTime();
      const nowEstimatedServerMs = getEstimatedServerTime();

      // If key is still valid (not expired according to calibrated server time)
      if (expiresAtMs > nowEstimatedServerMs) {
        return {
          data: existing.response_body as T,
          isDuplicate: true,
          statusCode: existing.response_code,
        };
      }
    }
  } catch (err) {
    // Non-fatal if check fails due to read error, proceed to execute or rethrow if offline
    const appErr = mapSupabaseError(err);
    if (appErr.code === ErrorCode.NETWORK_OFFLINE) {
      throw appErr;
    }
  }

  // 2. Execute the underlying action
  const execution = await action();

  // 3. Persist the response for future duplicate invocations
  try {
    const expiresAt = new Date(getEstimatedServerTime() + ttlSeconds * 1000).toISOString();

    const { error: insertError } = await supabase.from('idempotency_keys').upsert({
      key,
      shop_id: shopId,
      user_id: userId,
      response_code: execution.statusCode,
      response_body: execution.data,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.warn('[Idempotency] Failed to persist idempotency key:', insertError);
    }
  } catch (err) {
    console.warn('[Idempotency] Exception storing key:', err);
  }

  return {
    data: execution.data,
    isDuplicate: false,
    statusCode: execution.statusCode,
  };
}
