import { z } from 'zod';
import { csvEnum, nonEmpty, nullableText, paginationFields, searchField, sortOrder, uuid } from './common.js';

export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;

export const REVIEW_SORT_COLUMNS = {
  createdAt: 'created_at',
  rating: 'rating',
} as const;

export const listReviewsQuery = z.object({
  ...paginationFields,
  search: searchField,
  productId: uuid.optional(),
  customerId: uuid.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
  /** positive | neutral | negative | unanalyzed (sentiment not set yet). Comma-separated. */
  sentiment: csvEnum([...SENTIMENTS, 'unanalyzed'] as const).optional(),
  sortBy: z.enum(Object.keys(REVIEW_SORT_COLUMNS) as [keyof typeof REVIEW_SORT_COLUMNS]).default('createdAt'),
  sortOrder,
});

const reviewFields = {
  rating: z.number().int().min(1).max(5),
  title: nullableText(255),
  reviewText: nullableText(10_000),
  sentiment: z.enum(SENTIMENTS).nullable(),
  customerId: uuid.nullable(),
};

export const createReviewBody = z.strictObject({
  productId: uuid,
  customerId: reviewFields.customerId.optional(),
  rating: reviewFields.rating,
  title: reviewFields.title.optional(),
  reviewText: reviewFields.reviewText.optional(),
  sentiment: reviewFields.sentiment.optional(),
});

export const updateReviewBody = nonEmpty(z.strictObject(reviewFields).partial());

export type ListReviewsQuery = z.infer<typeof listReviewsQuery>;
export type CreateReviewInput = z.infer<typeof createReviewBody>;
export type UpdateReviewInput = z.infer<typeof updateReviewBody>;
