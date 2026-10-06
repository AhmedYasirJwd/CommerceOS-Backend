import { ordersRepository } from '../repositories/orders.repository.js';
import { parseDateBoundary } from '../utils/dateRange.js';
import { notFound } from '../utils/errors.js';
import {
  ORDER_SORT_COLUMNS,
  type CreateOrderInput,
  type ListOrdersQuery,
  type UpdateOrderInput,
} from '../validators/orders.validator.js';
import { toOrder, toOrderItem } from './mappers.js';

const orderNotFound = () => notFound('ORDER_NOT_FOUND', 'Order not found');

export const ordersService = {
  async list(storeId: string, query: ListOrdersQuery) {
    const result = await ordersRepository.list(
      storeId,
      {
        search: query.search,
        status: query.status,
        customerId: query.customerId,
        from: query.from ? parseDateBoundary(query.from, false) : undefined,
        to: query.to ? parseDateBoundary(query.to, true) : undefined,
        minTotal: query.minTotal,
        maxTotal: query.maxTotal,
      },
      { column: ORDER_SORT_COLUMNS[query.sortBy], ascending: query.sortOrder === 'asc' },
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toOrder), pagination: result.pagination };
  },

  async get(storeId: string, id: string) {
    const row = await ordersRepository.findById(storeId, id);
    if (!row) throw orderNotFound();
    const items = await ordersRepository.items(row.id);
    return { ...toOrder(row), items: items.map(toOrderItem) };
  },

  /**
   * Creates the order atomically in PostgreSQL (create_order_with_items):
   * validates customer/products/stock, snapshots product name and price
   * into order_items, computes totals, decrements inventory and writes
   * 'sale' movements. Any failure rolls everything back.
   */
  async create(storeId: string, input: CreateOrderInput) {
    const id = await ordersRepository.create(storeId, {
      customerId: input.customerId ?? null,
      items: input.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        ...(item.unitPrice !== undefined && { unit_price: item.unitPrice }),
      })),
      status: input.status,
      orderNumber: input.orderNumber ?? null,
      discount: input.discount,
      tax: input.tax,
      shipping: input.shipping,
      orderedAt: input.orderedAt ?? null,
    });
    return this.get(storeId, id);
  },

  /** Status / customer changes; cancelling returns stock to inventory (update_order). */
  async update(storeId: string, id: string, input: UpdateOrderInput) {
    await ordersRepository.update(storeId, id, { status: input.status, customerId: input.customerId });
    return this.get(storeId, id);
  },
};
