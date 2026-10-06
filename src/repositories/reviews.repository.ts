import { supabase } from '../config/supabase.js';
import type { ReviewRow } from '../types/rows.js';
import { unwrap } from '../utils/db.js';
import { selectPage, type FilterBuilder, type PageRequest, type SortRequest } from '../utils/pagination.js';
import { buildSearchFilter, combineOrGroups } from '../utils/search.js';

const SELECT = '*, product:products(id, name), customer:customers(id, first_name, last_name, email)';

export interface ReviewFilters {
  search?: string | undefined;
  productId?: string | undefined;
  customerId?: string | undefined;
  rating?: number | undefined;
  minRating?: number | undefined;
  maxRating?: number | undefined;
  sentiment?: ('positive' | 'neutral' | 'negative' | 'unanalyzed')[] | undefined;
}

export interface ReviewWrite {
  product_id?: string;
  customer_id?: string | null;
  rating?: number;
  title?: string | null;
  review_text?: string | null;
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
}

export const reviewsRepository = {
  list(storeId: string, filters: ReviewFilters, sort: SortRequest, page: PageRequest) {
    return selectPage<ReviewRow>({
      table: 'product_reviews',
      select: SELECT,
      sort,
      page,
      applyFilters: (query: FilterBuilder) => {
        let q = query.eq('store_id', storeId);
        if (filters.productId) q = q.eq('product_id', filters.productId);
        if (filters.customerId) q = q.eq('customer_id', filters.customerId);
        if (filters.rating !== undefined) q = q.eq('rating', filters.rating);
        if (filters.minRating !== undefined) q = q.gte('rating', filters.minRating);
        if (filters.maxRating !== undefined) q = q.lte('rating', filters.maxRating);

        const orGroups: string[] = [];
        if (filters.sentiment?.length) {
          const labelled = filters.sentiment.filter((s) => s !== 'unanalyzed');
          const parts = [
            ...(labelled.length ? [`sentiment.in.(${labelled.join(',')})`] : []),
            ...(filters.sentiment.includes('unanalyzed') ? ['sentiment.is.null'] : []),
          ];
          orGroups.push(parts.join(','));
        }
        const search = filters.search ? buildSearchFilter(['title', 'review_text'], filters.search) : null;
        if (search) orGroups.push(search);

        const combined = combineOrGroups(orGroups);
        if (combined) q = q.or(combined);
        return q;
      },
    });
  },

  async findById(storeId: string, id: string): Promise<ReviewRow | null> {
    return unwrap(
      await supabase.from('product_reviews').select(SELECT).eq('store_id', storeId).eq('id', id).maybeSingle(),
    );
  },

  async insert(storeId: string, values: ReviewWrite): Promise<string> {
    const row = unwrap<{ id: string }>(
      await supabase
        .from('product_reviews')
        .insert({ ...values, store_id: storeId })
        .select('id')
        .single(),
    );
    return row.id;
  },

  async update(storeId: string, id: string, values: ReviewWrite): Promise<boolean> {
    const row = unwrap<{ id: string } | null>(
      await supabase
        .from('product_reviews')
        .update(values)
        .eq('store_id', storeId)
        .eq('id', id)
        .select('id')
        .maybeSingle(),
    );
    return row !== null;
  },

  async delete(storeId: string, id: string): Promise<boolean> {
    const rows = unwrap<{ id: string }[]>(
      await supabase.from('product_reviews').delete().eq('store_id', storeId).eq('id', id).select('id'),
    );
    return rows.length > 0;
  },
};
