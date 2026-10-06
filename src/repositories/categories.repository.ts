import { supabase } from '../config/supabase.js';
import type { CategoryRow } from '../types/rows.js';
import { unwrap } from '../utils/db.js';
import { selectPage, type FilterBuilder, type PageRequest, type SortRequest } from '../utils/pagination.js';
import { buildSearchFilter } from '../utils/search.js';

const SELECT = 'id, store_id, name, slug, description, created_at, updated_at, products(count)';

export interface CategoryWrite {
  name?: string;
  slug?: string;
  description?: string | null;
}

export const categoriesRepository = {
  list(storeId: string, search: string | undefined, sort: SortRequest, page: PageRequest) {
    return selectPage<CategoryRow>({
      table: 'categories',
      select: SELECT,
      sort,
      page,
      applyFilters: (query: FilterBuilder) => {
        let q = query.eq('store_id', storeId);
        const filter = search ? buildSearchFilter(['name', 'slug'], search) : null;
        if (filter) q = q.or(filter);
        return q;
      },
    });
  },

  async findById(storeId: string, id: string): Promise<CategoryRow | null> {
    return unwrap(await supabase.from('categories').select(SELECT).eq('store_id', storeId).eq('id', id).maybeSingle());
  },

  async exists(storeId: string, id: string): Promise<boolean> {
    const row = unwrap<{ id: string } | null>(
      await supabase.from('categories').select('id').eq('store_id', storeId).eq('id', id).maybeSingle(),
    );
    return row !== null;
  },

  async findIdBySlug(storeId: string, slug: string): Promise<string | null> {
    const row = unwrap<{ id: string } | null>(
      await supabase.from('categories').select('id').eq('store_id', storeId).eq('slug', slug).maybeSingle(),
    );
    return row?.id ?? null;
  },

  async insert(storeId: string, values: Required<Pick<CategoryWrite, 'name' | 'slug'>> & CategoryWrite): Promise<string> {
    const row = unwrap<{ id: string }>(
      await supabase
        .from('categories')
        .insert({ ...values, store_id: storeId })
        .select('id')
        .single(),
    );
    return row.id;
  },

  async update(storeId: string, id: string, values: CategoryWrite): Promise<boolean> {
    const row = unwrap<{ id: string } | null>(
      await supabase.from('categories').update(values).eq('store_id', storeId).eq('id', id).select('id').maybeSingle(),
    );
    return row !== null;
  },

  async delete(storeId: string, id: string): Promise<boolean> {
    const rows = unwrap<{ id: string }[]>(
      await supabase.from('categories').delete().eq('store_id', storeId).eq('id', id).select('id'),
    );
    return rows.length > 0;
  },
};
