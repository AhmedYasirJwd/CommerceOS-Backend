import { z } from 'zod';
import { dateRangeFields } from './common.js';

export const analyticsRangeQuery = z.object(dateRangeFields);

export const topProductsQuery = z.object({
  ...dateRangeFields,
  limit: z.coerce.number().int().min(1).max(50).default(5),
  sortBy: z.enum(['units', 'revenue']).default('units'),
});

export const recentOrdersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

export const productPerformanceQuery = z.object({
  ...dateRangeFields,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sortBy: z.enum(['revenue', 'units', 'profit', 'rating', 'name']).default('revenue'),
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuery>;
export type TopProductsQuery = z.infer<typeof topProductsQuery>;
export type ProductPerformanceQuery = z.infer<typeof productPerformanceQuery>;
