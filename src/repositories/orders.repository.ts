import { supabase } from '../config/supabase.js';
import type { OrderItemRow, OrderListRow } from '../types/rows.js';
import { unwrap } from '../utils/db.js';
import { selectPage, type FilterBuilder, type PageRequest, type SortRequest } from '../utils/pagination.js';
import { buildSearchFilter } from '../utils/search.js';
import type { OrderStatus } from '../validators/orders.validator.js';

export interface OrderFilters {
  search?: string | undefined;
  status?: OrderStatus[] | undefined;
  customerId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  minTotal?: number | undefined;
  maxTotal?: number | undefined;
}

export interface CreateOrderParams {
  customerId: string | null;
  items: { product_id: string; quantity: number; unit_price?: number }[];
  status: 'pending' | 'processing' | 'completed';
  orderNumber: string | null;
  discount: number;
  tax: number;
  shipping: number;
  orderedAt: string | null;
}

export const ordersRepository = {
  list(storeId: string, filters: OrderFilters, sort: SortRequest, page: PageRequest) {
    return selectPage<OrderListRow>({
      table: 'v_order_list',
      select: '*',
      sort,
      page,
      applyFilters: (query: FilterBuilder) => {
        let q = query.eq('store_id', storeId);
        if (filters.status?.length) q = q.in('status', filters.status);
        if (filters.customerId) q = q.eq('customer_id', filters.customerId);
        if (filters.from) q = q.gte('ordered_at', filters.from.toISOString());
        if (filters.to) q = q.lt('ordered_at', filters.to.toISOString());
        if (filters.minTotal !== undefined) q = q.gte('total', filters.minTotal);
        if (filters.maxTotal !== undefined) q = q.lte('total', filters.maxTotal);
        const search = filters.search
          ? buildSearchFilter(['order_number', 'customer_name', 'customer_email'], filters.search)
          : null;
        if (search) q = q.or(search);
        return q;
      },
    });
  },

  async recent(storeId: string, limit: number): Promise<OrderListRow[]> {
    return unwrap(
      await supabase
        .from('v_order_list')
        .select('*')
        .eq('store_id', storeId)
        .order('ordered_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(limit),
    );
  },

  async listForCustomer(storeId: string, customerId: string, limit: number): Promise<OrderListRow[]> {
    return unwrap(
      await supabase
        .from('v_order_list')
        .select('*')
        .eq('store_id', storeId)
        .eq('customer_id', customerId)
        .order('ordered_at', { ascending: false })
        .limit(limit),
    );
  },

  async findById(storeId: string, id: string): Promise<OrderListRow | null> {
    return unwrap(await supabase.from('v_order_list').select('*').eq('store_id', storeId).eq('id', id).maybeSingle());
  },

  /** Items of an order. Callers must first confirm the order belongs to the store. */
  async items(orderId: string): Promise<OrderItemRow[]> {
    return unwrap(
      await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    );
  },

  /** Transactional order creation via RPC (orders + order_items + inventory + movements). */
  async create(storeId: string, params: CreateOrderParams): Promise<string> {
    return unwrap<string>(
      await supabase.rpc('create_order_with_items', {
        p_store_id: storeId,
        p_items: params.items,
        p_customer_id: params.customerId,
        p_status: params.status,
        p_order_number: params.orderNumber,
        p_discount: params.discount,
        p_tax: params.tax,
        p_shipping: params.shipping,
        p_ordered_at: params.orderedAt,
      }),
    );
  },

  /** Transactional status/customer update via RPC (restores stock on cancellation). */
  async update(
    storeId: string,
    id: string,
    changes: { status?: OrderStatus | undefined; customerId?: string | null | undefined },
  ): Promise<void> {
    unwrap(
      await supabase.rpc('update_order', {
        p_store_id: storeId,
        p_order_id: id,
        p_status: changes.status ?? null,
        p_customer_id: changes.customerId ?? null,
        p_update_customer: changes.customerId !== undefined,
      }),
    );
  },
};
