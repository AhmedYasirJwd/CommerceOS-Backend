import { z } from 'zod';
import { booleanQuery, nonEmpty, nullableText, paginationFields, searchField, sortOrder } from './common.js';

export const CUSTOMER_STATUSES = ['active', 'inactive'] as const;

export const CUSTOMER_SORT_COLUMNS = {
  name: 'full_name',
  email: 'email',
  orders: 'orders_count',
  totalSpent: 'total_spent',
  lastOrderAt: 'last_order_at',
  createdAt: 'created_at',
} as const;

export const listCustomersQuery = z.object({
  ...paginationFields,
  search: searchField,
  status: z.enum(CUSTOMER_STATUSES).optional(),
  sortBy: z.enum(Object.keys(CUSTOMER_SORT_COLUMNS) as [keyof typeof CUSTOMER_SORT_COLUMNS]).default('createdAt'),
  sortOrder,
});

const customerFields = {
  firstName: z.string().trim().min(1).max(150),
  lastName: nullableText(150).optional(),
  email: z
    .email()
    .max(255)
    .transform((value) => value.toLowerCase()),
  phone: nullableText(50).optional(),
  status: z.enum(CUSTOMER_STATUSES),
};

export const createCustomerBody = z.strictObject({
  ...customerFields,
  status: customerFields.status.default('active'),
});

export const updateCustomerBody = nonEmpty(z.strictObject(customerFields).partial());

export const deleteCustomerQuery = z.object({
  force: booleanQuery.optional(),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuery>;
export type CreateCustomerInput = z.infer<typeof createCustomerBody>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerBody>;
