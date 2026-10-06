import { supabase } from '../config/supabase.js';
import type { InventoryMovementRow, ProductStatsRow } from '../types/rows.js';
import { unwrap } from '../utils/db.js';
import { selectPage, type FilterBuilder, type PageRequest, type SortRequest } from '../utils/pagination.js';
import { applyProductFilters, type ProductFilters } from './products.repository.js';

export interface MovementFilters {
  productId?: string | undefined;
  type?: InventoryMovementRow['type'][] | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface InventoryChangeResult {
  movement_id: string;
  product_id: string;
  type: string;
  quantity_change: number;
  previous_quantity: number;
  new_quantity: number;
}

export const inventoryRepository = {
  list(storeId: string, filters: ProductFilters, sort: SortRequest, page: PageRequest) {
    return selectPage<ProductStatsRow>({
      table: 'v_product_stats',
      select: '*',
      sort,
      page,
      applyFilters: (query: FilterBuilder) => applyProductFilters(query, storeId, filters),
    });
  },

  movements(storeId: string, filters: MovementFilters, ascending: boolean, page: PageRequest) {
    return selectPage<InventoryMovementRow>({
      table: 'v_inventory_movements',
      select: '*',
      sort: { column: 'created_at', ascending },
      page,
      applyFilters: (query: FilterBuilder) => {
        let q = query.eq('store_id', storeId);
        if (filters.productId) q = q.eq('product_id', filters.productId);
        if (filters.type?.length) q = q.in('type', filters.type);
        if (filters.from) q = q.gte('created_at', filters.from.toISOString());
        if (filters.to) q = q.lt('created_at', filters.to.toISOString());
        return q;
      },
    });
  },

  /** Restock / adjust / return in one transaction (inventory + movement) via RPC. */
  async applyChange(
    storeId: string,
    params: {
      productId: string;
      type: 'restock' | 'adjustment' | 'return';
      quantityChange?: number | undefined;
      newQuantity?: number | undefined;
      note?: string | undefined;
    },
  ): Promise<InventoryChangeResult> {
    return unwrap<InventoryChangeResult>(
      await supabase.rpc('apply_inventory_change', {
        p_store_id: storeId,
        p_product_id: params.productId,
        p_type: params.type,
        p_quantity_change: params.quantityChange ?? null,
        p_new_quantity: params.newQuantity ?? null,
        p_note: params.note ?? null,
      }),
    );
  },

  /** Set the low-stock threshold, creating the inventory row if it does not exist yet. */
  async setThreshold(productId: string, lowStockThreshold: number): Promise<void> {
    unwrap(
      await supabase
        .from('inventory')
        .upsert({ product_id: productId, low_stock_threshold: lowStockThreshold }, { onConflict: 'product_id' })
        .select('id'),
    );
  },
};
