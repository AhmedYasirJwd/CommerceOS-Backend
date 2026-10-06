import { z } from 'zod';
import { SLUG_PATTERN } from '../utils/slug.js';
import { booleanQuery, csvEnum, money, nonEmpty, nullableText, paginationFields, searchField, sortOrder, uuid } from './common.js';

export const STOCK_FILTERS = ['in', 'low', 'out'] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

export const PRODUCT_SORT_COLUMNS = {
  name: 'name',
  price: 'price',
  stock: 'quantity',
  unitsSold: 'units_sold',
  revenue: 'revenue',
  category: 'category_name',
  createdAt: 'created_at',
} as const;

export const listProductsQuery = z.object({
  ...paginationFields,
  search: searchField,
  /** Category slug or id. */
  category: z.string().trim().min(1).max(255).optional(),
  stock: csvEnum(STOCK_FILTERS).optional(),
  active: booleanQuery.optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sortBy: z.enum(Object.keys(PRODUCT_SORT_COLUMNS) as [keyof typeof PRODUCT_SORT_COLUMNS]).default('createdAt'),
  sortOrder,
});

const slug = z.string().trim().toLowerCase().max(255).regex(SLUG_PATTERN, 'Slug may contain lowercase letters, numbers and single hyphens');

const productFields = {
  name: z.string().trim().min(1).max(255),
  slug: slug.nullable(),
  description: nullableText(10_000),
  sku: nullableText(100),
  price: money,
  costPrice: money.nullable(),
  categoryId: uuid.nullable(),
  active: z.boolean(),
};

export const createProductBody = z.strictObject({
  name: productFields.name,
  slug: productFields.slug.optional(),
  description: productFields.description.optional(),
  sku: productFields.sku.optional(),
  price: productFields.price,
  costPrice: productFields.costPrice.optional(),
  categoryId: productFields.categoryId.optional(),
  active: productFields.active.default(true),
  initialQuantity: z.number().int().min(0).max(1_000_000_000).default(0),
  lowStockThreshold: z.number().int().min(0).max(1_000_000_000).optional(),
});

export const updateProductBody = nonEmpty(z.strictObject(productFields).partial());

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type CreateProductInput = z.infer<typeof createProductBody>;
export type UpdateProductInput = z.infer<typeof updateProductBody>;
