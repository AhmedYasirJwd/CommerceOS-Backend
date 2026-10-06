import { z } from 'zod';
import { csvEnum, isoDateOrDateTime, money, nonEmpty, paginationFields, searchField, sortOrder, uuid } from './common.js';

export const ORDER_STATUSES = ['pending', 'processing', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SORT_COLUMNS = {
  orderedAt: 'ordered_at',
  total: 'total',
  orderNumber: 'order_number',
  status: 'status',
  customer: 'customer_name',
} as const;

export const listOrdersQuery = z.object({
  ...paginationFields,
  /** Matches order number, customer name or customer email. */
  search: searchField,
  status: csvEnum(ORDER_STATUSES).optional(),
  customerId: uuid.optional(),
  from: isoDateOrDateTime.optional(),
  to: isoDateOrDateTime.optional(),
  minTotal: z.coerce.number().min(0).optional(),
  maxTotal: z.coerce.number().min(0).optional(),
  sortBy: z.enum(Object.keys(ORDER_SORT_COLUMNS) as [keyof typeof ORDER_SORT_COLUMNS]).default('orderedAt'),
  sortOrder,
});

export const createOrderBody = z.strictObject({
  customerId: uuid.nullable().optional(),
  items: z
    .array(
      z.strictObject({
        productId: uuid,
        quantity: z.number().int().min(1).max(100_000),
        /** Historical/override price. Defaults to the product's current price. */
        unitPrice: money.optional(),
      }),
    )
    .min(1, 'An order needs at least one item')
    .max(200),
  status: z.enum(['pending', 'processing', 'completed']).default('pending'),
  orderNumber: z.string().trim().min(1).max(100).optional(),
  discount: money.default(0),
  tax: money.default(0),
  shipping: money.default(0),
  orderedAt: z.iso.datetime({ offset: true }).optional(),
});

export const updateOrderBody = nonEmpty(
  z.strictObject({
    status: z.enum(ORDER_STATUSES).optional(),
    customerId: uuid.nullable().optional(),
  }),
);

export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;
export type CreateOrderInput = z.infer<typeof createOrderBody>;
export type UpdateOrderInput = z.infer<typeof updateOrderBody>;
