import { z } from 'zod';
import { booleanQuery, csvEnum, paginationFields, sortOrder, uuid } from './common.js';

export const INSIGHT_TYPES = ['revenue', 'sales', 'inventory', 'customer', 'product', 'marketing', 'general'] as const;
export const INSIGHT_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const INSIGHT_STATUSES = ['new', 'viewed', 'dismissed', 'actioned'] as const;
export const ACTION_STATUSES = ['pending', 'approved', 'rejected', 'executing', 'completed', 'failed', 'cancelled'] as const;
export const RUN_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;

export const listInsightsQuery = z.object({
  ...paginationFields,
  type: csvEnum(INSIGHT_TYPES).optional(),
  priority: csvEnum(INSIGHT_PRIORITIES).optional(),
  status: csvEnum(INSIGHT_STATUSES).optional(),
  /** Include insights whose expires_at has passed. Default false. */
  includeExpired: booleanQuery.optional(),
  sortOrder,
});

export const updateInsightBody = z.strictObject({
  status: z.enum(INSIGHT_STATUSES),
});

export const listActionsQuery = z.object({
  ...paginationFields,
  status: csvEnum(ACTION_STATUSES).optional(),
  insightId: uuid.optional(),
  type: z.string().trim().min(1).max(100).optional(),
  sortOrder,
});

export const listRunsQuery = z.object({
  ...paginationFields,
  status: csvEnum(RUN_STATUSES).optional(),
  analysisType: z.string().trim().min(1).max(100).optional(),
  sortOrder,
});

export type ListInsightsQuery = z.infer<typeof listInsightsQuery>;
export type ListActionsQuery = z.infer<typeof listActionsQuery>;
export type ListRunsQuery = z.infer<typeof listRunsQuery>;
