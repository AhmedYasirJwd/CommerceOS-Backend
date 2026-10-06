import { supabase } from '../config/supabase.js';
import type { ProductStatsRow } from '../types/rows.js';
import { unwrap } from '../utils/db.js';
import { selectPage, type FilterBuilder, type PageRequest, type SortRequest } from '../utils/pagination.js';
import { buildSearchFilter } from '../utils/search.js';
import type { StockFilter } from '../validators/products.validator.js';
import { uuid } from '../validators/common.js';

const STOCK_STATUS: Record<StockFilter, ProductStatsRow['stock_status']> = {
  in: 'in_stock',
  low: 'low_stock',
  out: 'out_of_stock',
};

export interface ProductFilters {
  search?: string | undefined;
  /** Category id or slug. */
  category?: string | undefined;
  stock?: StockFilter[] | undefined;
  active?: boolean | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
}

export interface ProductWrite {
  name?: string;
  slug?: string | null;
  description?: string | null;
  sku?: string | null;
  price?: number;
  cost_price?: number | null;
  category_id?: string | null;
  active?: boolean;
}

export interface CreateProductParams {
  name: string;
  price: number;
  categoryId: string | null;
  slug: string | null;
  description: string | null;
  sku: string | null;
  costPrice: number | null;
  active: boolean;
  initialQuantity: number;
  lowStockThreshold: number | null;
}

/** Filters shared by the product and inventory listings (both read v_product_stats). */
export function applyProductFilters(query: FilterBuilder, storeId: string, filters: ProductFilters): FilterBuilder {
  let q = query.eq('store_id', storeId);

  if (filters.category) {
    q = uuid.safeParse(filters.category).success
      ? q.eq('category_id', filters.category)
      : q.eq('category_slug', filters.category.toLowerCase());
  }
  if (filters.stock?.length) q = q.in('stock_status', filters.stock.map((s) => STOCK_STATUS[s]));
  if (filters.active !== undefined) q = q.eq('active', filters.active);
  if (filters.minPrice !== undefined) q = q.gte('price', filters.minPrice);
  if (filters.maxPrice !== undefined) q = q.lte('price', filters.maxPrice);

  const search = filters.search ? buildSearchFilter(['name', 'sku', 'category_name'], filters.search) : null;
  if (search) q = q.or(search);

  return q;
}

export const productsRepository = {
  list(storeId: string, filters: ProductFilters, sort: SortRequest, page: PageRequest) {
    return selectPage<ProductStatsRow>({
      table: 'v_product_stats',
      select: '*',
      sort,
      page,
      applyFilters: (query: FilterBuilder) => applyProductFilters(query, storeId, filters),
    });
  },

  async findById(storeId: string, id: string): Promise<ProductStatsRow | null> {
    return unwrap(
      await supabase.from('v_product_stats').select('*').eq('store_id', storeId).eq('id', id).maybeSingle(),
    );
  },

  async exists(storeId: string, id: string): Promise<boolean> {
    const row = unwrap<{ id: string } | null>(
      await supabase.from('products').select('id').eq('store_id', storeId).eq('id', id).maybeSingle(),
    );
    return row !== null;
  },

  /** Inserts product + inventory (+ initial movement) atomically via RPC. */
  async create(storeId: string, params: CreateProductParams): Promise<string> {
    return unwrap<string>(
      await supabase.rpc('create_product_with_inventory', {
        p_store_id: storeId,
        p_name: params.name,
        p_price: params.price,
        p_category_id: params.categoryId,
        p_slug: params.slug,
        p_description: params.description,
        p_sku: params.sku,
        p_cost_price: params.costPrice,
        p_active: params.active,
        p_initial_quantity: params.initialQuantity,
        p_low_stock_threshold: params.lowStockThreshold,
      }),
    );
  },

  async update(storeId: string, id: string, values: ProductWrite): Promise<boolean> {
    const row = unwrap<{ id: string } | null>(
      await supabase.from('products').update(values).eq('store_id', storeId).eq('id', id).select('id').maybeSingle(),
    );
    return row !== null;
  },

  async delete(storeId: string, id: string): Promise<boolean> {
    const rows = unwrap<{ id: string }[]>(
      await supabase.from('products').delete().eq('store_id', storeId).eq('id', id).select('id'),
    );
    return rows.length > 0;
  },
};
