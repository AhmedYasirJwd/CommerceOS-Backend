import { z } from 'zod';
import { SLUG_PATTERN } from '../utils/slug.js';
import { nonEmpty } from './common.js';

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const updateStoreBody = nonEmpty(
  z
    .strictObject({
      name: z.string().trim().min(1).max(255),
      slug: z.string().trim().toLowerCase().min(1).max(255).regex(SLUG_PATTERN, 'Invalid slug'),
      currency: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO 4217 code'),
      timezone: z.string().trim().min(1).max(100).refine(isValidTimeZone, 'Unknown IANA timezone'),
    })
    .partial(),
);

export const updateStoreSettingsBody = nonEmpty(
  z
    .strictObject({
      aiInsightsEnabled: z.boolean(),
      lowStockDefaultThreshold: z.number().int().min(0).max(1_000_000),
    })
    .partial(),
);

export type UpdateStoreInput = z.infer<typeof updateStoreBody>;
export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsBody>;
