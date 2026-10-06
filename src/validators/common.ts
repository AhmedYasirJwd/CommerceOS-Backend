import { z } from 'zod';
import { INTERVALS, RANGE_PRESETS } from '../utils/dateRange.js';

export const uuid = z.guid({ message: 'Must be a valid UUID' });

export const idParams = z.object({ id: uuid });

export const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const sortOrder = z.enum(['asc', 'desc']).default('desc');

export const searchField = z.string().trim().max(100).optional();

/** "true" / "false" query strings. (z.coerce.boolean would treat "false" as true.) */
export const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Comma-separated list of enum values, e.g. `?status=pending,processing`. */
export function csvEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));
}

/** ISO date (YYYY-MM-DD) or full ISO-8601 timestamp. */
export const isoDateOrDateTime = z
  .string()
  .trim()
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) || z.iso.datetime({ offset: true }).safeParse(value).success, {
    message: 'Must be YYYY-MM-DD or an ISO-8601 timestamp',
  });

export const dateRangeFields = {
  range: z.enum(RANGE_PRESETS).optional(),
  from: isoDateOrDateTime.optional(),
  to: isoDateOrDateTime.optional(),
  interval: z.enum(INTERVALS).optional(),
};

export const dateRangeQuery = z.object(dateRangeFields);

export const money = z.coerce.number().min(0).max(9_999_999_999.99).multipleOf(0.01, 'At most 2 decimal places');

/** Optional text that turns "" into null. */
export const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

/** Reject PATCH bodies that contain no fields. */
export function nonEmpty<T extends z.ZodType<object>>(schema: T) {
  return schema.refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });
}
