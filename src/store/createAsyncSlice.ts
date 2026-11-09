import { AppError, mapSupabaseError } from '@/lib/errors';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncSliceState<TError = AppError> {
  status: AsyncStatus;
  error: TError | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

export interface RunOptions<T, TError = AppError> {
  /** Optional callback invoked on successful resolution */
  onSuccess?: (data: T) => void;
  /** Optional callback invoked on error */
  onError?: (error: TError) => void;
  /** Whether this action is a write (for offline write blocking) */
  isWrite?: boolean;
  /** Whether to re-throw the mapped AppError after setting store state (default: false) */
  rethrow?: boolean;
}

export interface AsyncSliceActions<TError = AppError> {
  /** Resets status to 'idle' and clears errors */
  resetAsync: () => void;
  /** Executes an asynchronous action with unified loading and error lifecycle */
  run: <T>(action: () => Promise<T>, options?: RunOptions<T, TError>) => Promise<T | null>;
}

export type AsyncSlice<TError = AppError> = AsyncSliceState<TError> & AsyncSliceActions<TError>;

export const initialAsyncState: AsyncSliceState = {
  status: 'idle',
  error: null,
  isLoading: false,
  isSuccess: false,
  isError: false,
};

/**
 * Creates an AsyncSlice for Zustand stores providing uniform { status, error, isLoading, run } handling.
 *
 * Usage:
 * ```ts
 * export const useMyStore = create<MyState & AsyncSlice>((set, get) => ({
 *   ...createAsyncSlice(set, get),
 *   myData: [],
 *   fetchData: () => get().run(async () => {
 *     const data = await api.get();
 *     set({ myData: data });
 *     return data;
 *   })
 * }));
 * ```
 */
export function createAsyncSlice<TState extends AsyncSlice>(
  set: (partial: Partial<TState> | ((state: TState) => Partial<TState>)) => void,
  _get?: () => TState,
): AsyncSlice {
  return {
    ...initialAsyncState,

    resetAsync: () => {
      set({
        status: 'idle',
        error: null,
        isLoading: false,
        isSuccess: false,
        isError: false,
      } as unknown as Partial<TState>);
    },

    run: async <T>(action: () => Promise<T>, options?: RunOptions<T>): Promise<T | null> => {
      set({
        status: 'loading',
        error: null,
        isLoading: true,
        isSuccess: false,
        isError: false,
      } as unknown as Partial<TState>);

      try {
        const result = await action();

        set({
          status: 'success',
          error: null,
          isLoading: false,
          isSuccess: true,
          isError: false,
        } as unknown as Partial<TState>);

        options?.onSuccess?.(result);
        return result;
      } catch (rawError) {
        const appError = mapSupabaseError(rawError, { isWrite: options?.isWrite });

        set({
          status: 'error',
          error: appError,
          isLoading: false,
          isSuccess: false,
          isError: true,
        } as unknown as Partial<TState>);

        options?.onError?.(appError);

        if (options?.rethrow) {
          throw appError;
        }

        return null;
      }
    },
  };
}
