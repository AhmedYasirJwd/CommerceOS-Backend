import { supabase } from '../config/supabase.js';
import type { StoreRow, StoreSettingsRow } from '../types/rows.js';
import { unwrap } from '../utils/db.js';

export interface StoreWrite {
  name?: string;
  slug?: string;
  currency?: string;
  timezone?: string;
}

export interface StoreSettingsWrite {
  ai_insights_enabled?: boolean;
  low_stock_default_threshold?: number;
}

export const storeRepository = {
  async findById(storeId: string): Promise<StoreRow | null> {
    return unwrap(await supabase.from('stores').select('*').eq('id', storeId).maybeSingle());
  },

  async update(storeId: string, values: StoreWrite): Promise<StoreRow | null> {
    return unwrap(await supabase.from('stores').update(values).eq('id', storeId).select('*').maybeSingle());
  },

  async findSettings(storeId: string): Promise<StoreSettingsRow | null> {
    return unwrap(await supabase.from('store_settings').select('*').eq('store_id', storeId).maybeSingle());
  },

  /** Create-or-update the store's single settings row. */
  async upsertSettings(storeId: string, values: StoreSettingsWrite): Promise<StoreSettingsRow> {
    return unwrap(
      await supabase
        .from('store_settings')
        .upsert({ ...values, store_id: storeId }, { onConflict: 'store_id' })
        .select('*')
        .single(),
    );
  },

  /** Lightweight connectivity probe for the health check. */
  async ping(storeId: string | undefined): Promise<{ storeFound: boolean | null }> {
    if (!storeId) {
      unwrap(await supabase.from('stores').select('id').limit(1));
      return { storeFound: null };
    }
    const row = unwrap<{ id: string } | null>(await supabase.from('stores').select('id').eq('id', storeId).maybeSingle());
    return { storeFound: row !== null };
  },
};
