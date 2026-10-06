import { z } from 'zod';
import { csvEnum, isoDateOrDateTime, paginationFields, searchField, sortOrder, uuid } from './common.js';
import { STOCK_FILTERS } from './products.validator.js';

export const MOVEMENT_TYPES = ['sale', 'restock', 'adjustment', 'return', 'cancellation'] as const;

export const INVENTORY_SORT_COLUMNS = {
  name: 'name',
  quantity: 'quantity',
  threshold: 'low_stock_threshold',
  status: 'stock_status',
  updatedAt: 'inventory_updated_at',
} as const;

export const listInventoryQuery = z.object({
  ...paginationFields,
  search: searchField,
  category: z.string().trim().min(1).max(255).optional(),
  stock: csvEnum(STOCK_FILTERS).optional(),
  sortBy: z.enum(Object.keys(INVENTORY_SORT_COLUMNS) as [keyof typeof INVENTORY_SORT_COLUMNS]).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const inventoryAlertsQuery = z.object({
  ...paginationFields,
});

export const inventoryHistoryQuery = z.object({
  ...paginationFields,
  productId: uuid.optional(),
  type: csvEnum(MOVEMENT_TYPES).optional(),
  from: isoDateOrDateTime.optional(),
  to: isoDateOrDateTime.optional(),
  sortOrder,
});

export const productIdParams = z.object({ productId: uuid });

const quantity = z.number().int().min(-1_000_000_000).max(1_000_000_000);
const note = z.string().trim().max(1_000).optional();

export const adjustInventoryBody = z
  .strictObject({
    productId: uuid,
    /** Signed change, e.g. -3 to write off three damaged units. */
    quantityChange: quantity.refine((value) => value !== 0, 'quantityChange cannot be 0').optional(),
    /** Absolute stock level after a stock count. */
    newQuantity: z.number().int().min(0).max(1_000_000_000).optional(),
    type: z.enum(['adjustment', 'return']).default('adjustment'),
    note,
  })
  .refine((value) => (value.quantityChange === undefined) !== (value.newQuantity === undefined), {
    message: 'Provide exactly one of quantityChange or newQuantity',
    path: ['quantityChange'],
  });

export const restockInventoryBody = z.strictObject({
  productId: uuid,
  quantity: z.number().int().min(1).max(1_000_000_000),
  note,
});

export const updateInventoryBody = z.strictObject({
  lowStockThreshold: z.number().int().min(0).max(1_000_000_000),
});

export type ListInventoryQuery = z.infer<typeof listInventoryQuery>;
export type InventoryHistoryQuery = z.infer<typeof inventoryHistoryQuery>;
export type AdjustInventoryInput = z.infer<typeof adjustInventoryBody>;
export type RestockInventoryInput = z.infer<typeof restockInventoryBody>;
