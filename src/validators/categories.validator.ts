import { z } from 'zod';
import { SLUG_PATTERN } from '../utils/slug.js';
import { nonEmpty, nullableText, paginationFields, searchField } from './common.js';

export const CATEGORY_SORT_COLUMNS = {
  name: 'name',
  slug: 'slug',
  createdAt: 'created_at',
} as const;

export const listCategoriesQuery = z.object({
  ...paginationFields,
  limit: z.coerce.number().int().min(1).max(100).default(100),
  search: searchField,
  sortBy: z.enum(Object.keys(CATEGORY_SORT_COLUMNS) as [keyof typeof CATEGORY_SORT_COLUMNS]).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const categoryFields = {
  name: z.string().trim().min(1, 'Name is required').max(255),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(255)
    .regex(SLUG_PATTERN, 'Slug may contain lowercase letters, numbers and single hyphens'),
  description: nullableText(5_000),
};

export const createCategoryBody = z.strictObject({
  name: categoryFields.name,
  slug: categoryFields.slug.optional(),
  description: categoryFields.description.optional(),
});

export const updateCategoryBody = nonEmpty(z.strictObject(categoryFields).partial());

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuery>;
export type CreateCategoryInput = z.infer<typeof createCategoryBody>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryBody>;
