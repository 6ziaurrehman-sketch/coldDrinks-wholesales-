import { compareSemver } from '@/lib/appSettings';
import { AppError, ErrorCode, mapSupabaseError } from '@/lib/errors';
import { withRetry } from '@/lib/withRetry';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';

describe('Data Foundation Tests', () => {
  describe('mapSupabaseError', () => {
    it('maps network offline errors', () => {
      const fetchError = new TypeError('Network request failed');
      const mappedRead = mapSupabaseError(fetchError, { isWrite: false });
      expect(mappedRead.code).toBe(ErrorCode.NETWORK_OFFLINE);
      expect(mappedRead.isRetryable).toBe(true);

      const mappedWrite = mapSupabaseError(fetchError, { isWrite: true });
      expect(mappedWrite.code).toBe(ErrorCode.OFFLINE_WRITE_BLOCKED);
      expect(mappedWrite.isRetryable).toBe(false);
    });

    it('maps timeout errors', () => {
      const abortError = new Error('The operation was timed out');
      abortError.name = 'AbortError';
      const mapped = mapSupabaseError(abortError);
      expect(mapped.code).toBe(ErrorCode.TIMEOUT);
      expect(mapped.isRetryable).toBe(true);
    });

    it('maps JWT expired errors', () => {
      const jwtError = {
        code: 'PGRST301',
        message: 'JWT expired',
        status: 401,
      };
      const mapped = mapSupabaseError(jwtError);
      expect(mapped.code).toBe(ErrorCode.AUTH_EXPIRED);
      expect(mapped.status).toBe(401);
      expect(mapped.isRetryable).toBe(false);
    });

    it('maps Postgres RLS violation (42501)', () => {
      const rlsError = {
        code: '42501',
        message: 'new row violates row-level security policy for table "shops"',
      };
      const mapped = mapSupabaseError(rlsError);
      expect(mapped.code).toBe(ErrorCode.RLS_VIOLATION);
      expect(mapped.status).toBe(403);
      expect(mapped.isRetryable).toBe(false);
    });

    it('maps unique constraint violation (23505)', () => {
      const uniqueError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "uq_shop_user"',
      };
      const mapped = mapSupabaseError(uniqueError);
      expect(mapped.code).toBe(ErrorCode.CONFLICT_UNIQUE);
      expect(mapped.status).toBe(409);
      expect(mapped.isRetryable).toBe(false);
    });

    it('maps foreign key constraint violation (23503)', () => {
      const fkError = {
        code: '23503',
        message: 'insert or update on table violates foreign key constraint',
      };
      const mapped = mapSupabaseError(fkError);
      expect(mapped.code).toBe(ErrorCode.FOREIGN_KEY_VIOLATION);
      expect(mapped.status).toBe(400);
      expect(mapped.isRetryable).toBe(false);
    });

    it('extracts custom RPC exception code prefixes like CREDIT_EXCEEDED', () => {
      const customRpcError = {
        code: 'P0001',
        message: 'CREDIT_EXCEEDED: Customer credit limit exceeded for current billing period',
      };
      const mapped = mapSupabaseError(customRpcError);
      expect(mapped.code).toBe('CREDIT_EXCEEDED');
      expect(mapped.message).toBe('Customer credit limit exceeded for current billing period');
      expect(mapped.isRetryable).toBe(false);
    });

    it('maps 5xx server errors', () => {
      const serverError = {
        status: 503,
        message: 'Service Unavailable',
      };
      const mapped = mapSupabaseError(serverError);
      expect(mapped.code).toBe(ErrorCode.SERVER_ERROR);
      expect(mapped.status).toBe(503);
      expect(mapped.isRetryable).toBe(true);
    });

    it('maps unknown errors with fallback', () => {
      const unknownError = new Error('Something completely random failed');
      const mapped = mapSupabaseError(unknownError);
      expect(mapped.code).toBe(ErrorCode.UNKNOWN);
      expect(mapped.message).toBe('Something completely random failed');
      expect(mapped.isRetryable).toBe(false);
    });
  });

  describe('withRetry', () => {
    it('strictly forbids retrying non-idempotent operations without an idempotency key', async () => {
      const nonIdempotentAction = jest.fn().mockResolvedValue('ok');

      await expect(
        withRetry(nonIdempotentAction, { isIdempotent: false, idempotencyKey: undefined }),
      ).rejects.toThrow('withRetry can ONLY be used for idempotent reads or writes');

      expect(nonIdempotentAction).not.toHaveBeenCalled();
    });

    it('retries retryable errors and succeeds when transient failure clears', async () => {
      let callCount = 0;
      const transientAction = jest.fn(async () => {
        callCount++;
        if (callCount < 3) {
          throw new AppError({
            code: ErrorCode.TIMEOUT,
            message: 'Timeout',
            isRetryable: true,
          });
        }
        return 'success_result';
      });

      const result = await withRetry(transientAction, {
        isIdempotent: true,
        retries: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
      });

      expect(result).toBe('success_result');
      expect(callCount).toBe(3);
    });

    it('does NOT retry non-retryable errors like RLS violations', async () => {
      const rlsAction = jest.fn().mockRejectedValue({
        code: '42501',
        message: 'violates row-level security policy',
      });

      await expect(
        withRetry(rlsAction, {
          isIdempotent: true,
          retries: 3,
          initialDelayMs: 10,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.RLS_VIOLATION,
      });

      expect(rlsAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('createAsyncSlice for Zustand', () => {
    it('manages loading, error, and success states identically', async () => {
      let state: AsyncSlice = {
        status: 'idle',
        error: null,
        isLoading: false,
        isSuccess: false,
        isError: false,
        resetAsync: () => {},
        run: async () => null,
      };

      const set = (updater: any) => {
        const partial = typeof updater === 'function' ? updater(state) : updater;
        state = { ...state, ...partial };
      };

      const slice = createAsyncSlice(set as any);
      state = { ...state, ...slice };

      expect(state.status).toBe('idle');
      expect(state.isLoading).toBe(false);

      // Successful run
      const data = await state.run(async () => {
        return { id: '123', name: 'Product' };
      });

      expect(data).toEqual({ id: '123', name: 'Product' });
      expect(state.status).toBe('success');
      expect(state.isSuccess).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();

      // Error run
      const failed = await state.run(async () => {
        throw { code: '23505', message: 'duplicate key' };
      });

      expect(failed).toBeNull();
      expect(state.status).toBe('error');
      expect(state.isError).toBe(true);
      expect(state.error?.code).toBe(ErrorCode.CONFLICT_UNIQUE);

      // Reset
      state.resetAsync();
      expect(state.status).toBe('idle');
      expect(state.error).toBeNull();
    });
  });

  describe('compareSemver version gate', () => {
    it('compares version numbers accurately', () => {
      expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
      expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
      expect(compareSemver('1.1.0', '1.0.9')).toBe(1);
      expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
      expect(compareSemver('0.9.5', '1.0.0')).toBe(-1);
    });
  });
});
