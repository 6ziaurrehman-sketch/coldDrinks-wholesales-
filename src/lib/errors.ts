/**
 * Application Error Architecture & Supabase Error Mapping
 * Handles network offline, timeouts, JWT expiration, Postgres error codes (RLS 42501, Unique 23505, FK 23503),
 * custom RPC exception prefixes, 5xx server errors, and unknown exceptions.
 */

export enum ErrorCode {
  NETWORK_OFFLINE = 'NETWORK_OFFLINE',
  TIMEOUT = 'TIMEOUT',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  RLS_VIOLATION = 'RLS_VIOLATION',
  CONFLICT_UNIQUE = 'CONFLICT_UNIQUE',
  FOREIGN_KEY_VIOLATION = 'FOREIGN_KEY_VIOLATION',
  CUSTOM_RPC_ERROR = 'CUSTOM_RPC_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  OFFLINE_WRITE_BLOCKED = 'OFFLINE_WRITE_BLOCKED',
  UNKNOWN = 'UNKNOWN',
}

export interface AppErrorOptions {
  code: ErrorCode | string;
  message: string;
  status?: number;
  details?: unknown;
  isRetryable?: boolean;
  rawError?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode | string;
  readonly status?: number;
  readonly details?: unknown;
  readonly isRetryable: boolean;
  readonly rawError?: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.isRetryable = options.isRetryable ?? false;
    this.rawError = options.rawError;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
      isRetryable: this.isRetryable,
    };
  }
}

/**
 * Contextual hints passed to error mapper
 */
export interface ErrorMappingContext {
  isWrite?: boolean;
  isIdempotent?: boolean;
  isOffline?: boolean;
  actionName?: string;
}

interface SupabaseLikeError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | number;
  status?: number;
  statusCode?: number;
  name?: string;
}

/**
 * Helper to extract code prefix from RPC errors like "CREDIT_EXCEEDED: Credit limit exceeded"
 */
function parseCustomRpcPrefix(message: string): { code: string; cleanMessage: string } | null {
  // Matches "CODE_NAME: Human readable message"
  const match = /^([A-Z0-9_]{3,40}):\s*(.+)$/i.exec(message.trim());
  if (match) {
    return {
      code: match[1].toUpperCase(),
      cleanMessage: match[2].trim(),
    };
  }
  return null;
}

/**
 * Maps Supabase, PostgREST, network, and unexpected errors to strongly typed AppError.
 */
export function mapSupabaseError(error: unknown, context: ErrorMappingContext = {}): AppError {
  if (error instanceof AppError) {
    return error;
  }

  // 1. Explicit offline check or offline write prevention
  if (context.isOffline) {
    if (context.isWrite) {
      return new AppError({
        code: ErrorCode.OFFLINE_WRITE_BLOCKED,
        message: 'Cannot perform operation while offline. Financial and data-altering actions are not queued offline.',
        status: 0,
        isRetryable: false,
        rawError: error,
      });
    }
    return new AppError({
      code: ErrorCode.NETWORK_OFFLINE,
      message: 'Network offline. Please check your internet connection.',
      status: 0,
      isRetryable: true,
      rawError: error,
    });
  }

  const err = (error && typeof error === 'object' ? error : {}) as SupabaseLikeError;
  const rawMsg = typeof err.message === 'string' ? err.message : '';
  const errCode = String(err.code ?? '');
  const httpStatus = err.status ?? err.statusCode;

  // 2. Network Offline Errors (Fetch / NetInfo)
  const isNetworkFailure =
    (error instanceof TypeError &&
      (rawMsg.includes('Network request failed') ||
        rawMsg.includes('Failed to fetch') ||
        rawMsg.includes('fetch failed'))) ||
    rawMsg.toLowerCase().includes('network error') ||
    rawMsg.toLowerCase().includes('failed to connect') ||
    errCode === 'ENOTFOUND' ||
    errCode === 'ECONNREFUSED';

  if (isNetworkFailure) {
    if (context.isWrite) {
      return new AppError({
        code: ErrorCode.OFFLINE_WRITE_BLOCKED,
        message: 'Network connection lost. Financial and write actions cannot be executed offline.',
        status: 0,
        isRetryable: false,
        rawError: error,
      });
    }
    return new AppError({
      code: ErrorCode.NETWORK_OFFLINE,
      message: 'Network offline. Please reconnect and try again.',
      status: 0,
      isRetryable: true,
      rawError: error,
    });
  }

  // 3. Timeout Errors
  const isTimeout =
    err.name === 'AbortError' ||
    rawMsg.toLowerCase().includes('timeout') ||
    rawMsg.toLowerCase().includes('timed out') ||
    errCode === 'ETIMEDOUT';

  if (isTimeout) {
    return new AppError({
      code: ErrorCode.TIMEOUT,
      message: 'The request timed out. Please check your connection and try again.',
      status: 408,
      isRetryable: true,
      rawError: error,
    });
  }

  // 4. JWT Expired / Invalid Token
  const isJwtExpired =
    errCode === 'PGRST301' ||
    rawMsg.toLowerCase().includes('jwt expired') ||
    rawMsg.toLowerCase().includes('token has expired') ||
    rawMsg.toLowerCase().includes('token is expired') ||
    rawMsg.toLowerCase().includes('invalid claim: token is expired') ||
    (httpStatus === 401 && rawMsg.toLowerCase().includes('jwt'));

  if (isJwtExpired) {
    return new AppError({
      code: ErrorCode.AUTH_EXPIRED,
      message: 'Your session has expired. Please sign in again.',
      status: 401,
      isRetryable: false,
      rawError: error,
    });
  }

  // 5. RLS Violation (Postgres 42501)
  const isRlsViolation =
    errCode === '42501' ||
    rawMsg.toLowerCase().includes('violates row-level security policy') ||
    rawMsg.toLowerCase().includes('permission denied for table') ||
    rawMsg.toLowerCase().includes('rls_violation');

  if (isRlsViolation) {
    return new AppError({
      code: ErrorCode.RLS_VIOLATION,
      message: 'Access denied: You do not have permission to view or modify this resource.',
      status: 403,
      details: err.details,
      isRetryable: false,
      rawError: error,
    });
  }

  // 6. Unique Constraint Violation (Postgres 23505)
  const isUniqueViolation =
    errCode === '23505' ||
    rawMsg.toLowerCase().includes('duplicate key value violates unique constraint');

  if (isUniqueViolation) {
    return new AppError({
      code: ErrorCode.CONFLICT_UNIQUE,
      message: 'A conflicting record with this identifier or key already exists.',
      status: 409,
      details: err.details,
      isRetryable: false,
      rawError: error,
    });
  }

  // 7. Foreign Key Constraint Violation (Postgres 23503)
  const isFkViolation =
    errCode === '23503' ||
    rawMsg.toLowerCase().includes('violates foreign key constraint');

  if (isFkViolation) {
    return new AppError({
      code: ErrorCode.FOREIGN_KEY_VIOLATION,
      message: 'Referenced entity does not exist or has been deleted.',
      status: 400,
      details: err.details,
      isRetryable: false,
      rawError: error,
    });
  }

  // 8. Custom RPC Exceptions (e.g. Postgres raise exception 'CREDIT_EXCEEDED: Credit limit reached')
  const customRpc = parseCustomRpcPrefix(rawMsg);
  if (customRpc || errCode === 'P0001') {
    const code = customRpc ? customRpc.code : ErrorCode.CUSTOM_RPC_ERROR;
    const message = customRpc ? customRpc.cleanMessage : rawMsg;
    return new AppError({
      code,
      message,
      status: 400,
      details: err.details,
      isRetryable: false,
      rawError: error,
    });
  }

  // 9. Server 5xx Errors
  const is5xx =
    (typeof httpStatus === 'number' && httpStatus >= 500 && httpStatus <= 599) ||
    errCode.startsWith('58') ||
    errCode.startsWith('XX');

  if (is5xx) {
    return new AppError({
      code: ErrorCode.SERVER_ERROR,
      message: 'Server error encountered. Please try again shortly.',
      status: httpStatus ?? 500,
      details: err.details,
      isRetryable: true,
      rawError: error,
    });
  }

  // 10. Fallback Unknown Error
  return new AppError({
    code: ErrorCode.UNKNOWN,
    message: rawMsg || 'An unexpected error occurred.',
    status: httpStatus,
    details: err.details,
    isRetryable: false,
    rawError: error,
  });
}
