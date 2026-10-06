import type { PostgrestError } from '@supabase/supabase-js';
import { AppError } from './errors.js';

/** HTTP status for domain error codes raised by the SQL functions (HINT field). */
const DOMAIN_ERROR_STATUS: Record<string, number> = {
  CUSTOMER_NOT_FOUND: 404,
  PRODUCT_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  ORDER_NUMBER_EXISTS: 409,
  INSUFFICIENT_STOCK: 409,
  INVALID_STATUS_TRANSITION: 409,
  PRODUCT_INACTIVE: 422,
  NEGATIVE_INVENTORY: 422,
  INVALID_INVENTORY_CHANGE: 422,
  INVALID_DISCOUNT: 422,
};

/** Convert a Supabase/PostgREST error into an AppError with a safe message. */
export function toAppError(error: PostgrestError): AppError {
  // Domain errors raised by our SQL functions: SQLSTATE P0001 + code in HINT.
  if (error.code === 'P0001' && error.hint && /^[A-Z][A-Z_]+$/.test(error.hint)) {
    return new AppError(DOMAIN_ERROR_STATUS[error.hint] ?? 400, error.hint, error.message);
  }

  switch (error.code) {
    case '23505':
      return new AppError(409, 'DUPLICATE_RESOURCE', 'A record with the same unique value already exists');
    case '23503':
      return new AppError(409, 'RELATED_RESOURCE_CONFLICT', 'The operation conflicts with related records');
    case '23514':
    case '23502':
      return new AppError(400, 'CONSTRAINT_VIOLATION', 'The data violates a database constraint');
    case '22P02':
    case '22003':
    case '22007':
    case '22008':
      return new AppError(400, 'INVALID_INPUT', 'Invalid input value');
    case 'PGRST116':
      return new AppError(404, 'NOT_FOUND', 'Resource not found');
    case 'PGRST202':
    case 'PGRST205':
    case '42883':
    case '42P01':
      return new AppError(
        500,
        'DATABASE_NOT_MIGRATED',
        'Database objects are missing. Run supabase/migrations/001_commerceos_api.sql',
      );
    default:
      break;
  }

  if (!error.code && /fetch failed|network|ECONNREFUSED|ENOTFOUND/i.test(error.message ?? '')) {
    return new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is currently unreachable');
  }

  return new AppError(500, 'DATABASE_ERROR', 'Unexpected database error', {
    dbCode: error.code,
    dbMessage: error.message,
  });
}

/** Throw if a Supabase call returned an error. */
export function check(error: PostgrestError | null): void {
  if (error) throw toAppError(error);
}

/** Unwrap `{ data, error }` from a Supabase call, throwing on error. */
export function unwrap<T>(result: { data: unknown; error: PostgrestError | null }): T {
  check(result.error);
  return result.data as T;
}

/** Postgres numeric/bigint values can arrive as strings; normalise to number. */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return num(value);
}
