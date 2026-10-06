import { supabase } from '../config/supabase.js';
import type { CustomerStatsRow } from '../types/rows.js';
import { unwrap } from '../utils/db.js';
import { selectPage, type FilterBuilder, type PageRequest, type SortRequest } from '../utils/pagination.js';
import { buildSearchFilter } from '../utils/search.js';

export interface CustomerFilters {
  search?: string | undefined;
  status?: 'active' | 'inactive' | undefined;
}

export interface CustomerWrite {
  first_name?: string;
  last_name?: string | null;
  email?: string;
  phone?: string | null;
  status?: 'active' | 'inactive';
}

export const customersRepository = {
  list(storeId: string, filters: CustomerFilters, sort: SortRequest, page: PageRequest) {
    return selectPage<CustomerStatsRow>({
      table: 'v_customer_stats',
      select: '*',
      sort,
      page,
      applyFilters: (query: FilterBuilder) => {
        let q = query.eq('store_id', storeId);
        if (filters.status) q = q.eq('status', filters.status);
        const search = filters.search ? buildSearchFilter(['full_name', 'email', 'phone'], filters.search) : null;
        if (search) q = q.or(search);
        return q;
      },
    });
  },

  async findById(storeId: string, id: string): Promise<CustomerStatsRow | null> {
    return unwrap(
      await supabase.from('v_customer_stats').select('*').eq('store_id', storeId).eq('id', id).maybeSingle(),
    );
  },

  async exists(storeId: string, id: string): Promise<boolean> {
    const row = unwrap<{ id: string } | null>(
      await supabase.from('customers').select('id').eq('store_id', storeId).eq('id', id).maybeSingle(),
    );
    return row !== null;
  },

  async findIdByEmail(storeId: string, email: string): Promise<string | null> {
    const row = unwrap<{ id: string } | null>(
      await supabase.from('customers').select('id').eq('store_id', storeId).eq('email', email).maybeSingle(),
    );
    return row?.id ?? null;
  },

  async insert(storeId: string, values: CustomerWrite): Promise<string> {
    const row = unwrap<{ id: string }>(
      await supabase
        .from('customers')
        .insert({ ...values, store_id: storeId })
        .select('id')
        .single(),
    );
    return row.id;
  },

  /** Returns false when no customer with this id exists in the store. */
  async update(storeId: string, id: string, values: CustomerWrite): Promise<boolean> {
    const row = unwrap<{ id: string } | null>(
      await supabase.from('customers').update(values).eq('store_id', storeId).eq('id', id).select('id').maybeSingle(),
    );
    return row !== null;
  },

  async delete(storeId: string, id: string): Promise<boolean> {
    const rows = unwrap<{ id: string }[]>(
      await supabase.from('customers').delete().eq('store_id', storeId).eq('id', id).select('id'),
    );
    return rows.length > 0;
  },

  async countOrders(storeId: string, customerId: string): Promise<number> {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('customer_id', customerId);
    unwrap({ data: null, error });
    return count ?? 0;
  },
};
