import NetInfo from '@react-native-community/netinfo';

import { AppError, ErrorCode, mapSupabaseError } from '@/lib/errors';
import { refreshSessionOrRedirect } from '@/lib/supabase';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  retries?: number;
  /** Initial delay in ms before first retry (default: 300ms) */
  initialDelayMs?: number;
  /** Max cap for exponential backoff in ms (default: 3000ms) */
  maxDelayMs?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffFactor?: number;
  /** Whether the operation is an idempotent read */
  isIdempotent?: boolean;
  /** Idempotency key for write operations */
  idempotencyKey?: string;
  /** Whether this is a write / state-mutating operation */
  isWrite?: boolean;
  /** Current route / intent to preserve if session expires */
  intentRoute?: string;
}

/**
 * Calculates exponential backoff delay with random jitter to prevent thundering herd.
 */
function calculateBackoffDelay(attempt: number, initialMs: number, maxMs: number, factor: number): number {
  const baseDelay = initialMs * Math.pow(factor, attempt);
  const cappedDelay = Math.min(baseDelay, maxMs);
  // Add 10-25% random jitter
  const jitter = cappedDelay * (0.1 + Math.random() * 0.15);
  return Math.floor(cappedDelay + jitter);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generic retry service helper.
 * Strictly enforced: Used ONLY for idempotent reads or writes carrying an idempotency key.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    initialDelayMs = 300,
    maxDelayMs = 3000,
    backoffFactor = 2,
    isIdempotent = false,
    idempotencyKey,
    isWrite = Boolean(idempotencyKey),
    intentRoute,
  } = options;

  // STRICT INVARIANT: Must be an idempotent read OR a write with an idempotency key
  if (!isIdempotent && !idempotencyKey) {
    throw new AppError({
      code: 'NON_IDEMPOTENT_RETRY_FORBIDDEN',
      message: 'withRetry can ONLY be used for idempotent reads or writes carrying an idempotency key.',
      isRetryable: false,
    });
  }

  let attempt = 0;
  let hasRefreshedSession = false;

  while (true) {
    // 1. Proactive offline verification for write operations
    if (isWrite) {
      try {
        const netState = await NetInfo.fetch();
        if (netState.isConnected === false) {
          throw new AppError({
            code: ErrorCode.OFFLINE_WRITE_BLOCKED,
            message: 'Network offline. Financial and data-altering actions cannot be executed or queued offline.',
            isRetryable: false,
          });
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
      }
    }

    try {
      return await fn();
    } catch (rawError) {
      const appError = mapSupabaseError(rawError, {
        isWrite,
        isIdempotent: isIdempotent || Boolean(idempotencyKey),
      });

      // 2. Edge Case: Expired JWT session during request
      if (appError.code === ErrorCode.AUTH_EXPIRED && !hasRefreshedSession) {
        hasRefreshedSession = true;
        const refreshed = await refreshSessionOrRedirect(intentRoute);
        if (refreshed) {
          // Retry the action once with the freshly minted token
          continue;
        }
        // If refresh failed, reject immediately (redirect is already triggered)
        throw appError;
      }

      // 3. Do NOT retry non-retryable errors (RLS 42501, Unique 23505, FK 23503, RPC validation, offline writes)
      if (!appError.isRetryable) {
        throw appError;
      }

      // 4. Exhausted retry limit
      if (attempt >= retries) {
        throw appError;
      }

      // 5. Exponential backoff delay with jitter
      const delay = calculateBackoffDelay(attempt, initialDelayMs, maxDelayMs, backoffFactor);
      await sleep(delay);
      attempt++;
    }
  }
}
