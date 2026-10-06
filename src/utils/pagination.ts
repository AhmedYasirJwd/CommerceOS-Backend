import { supabase } from '../config/supabase.js';
import { toAppError } from './db.js';

export interface PageRequest {
  page: number;
  limit: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SortRequest {
  column: string;
  ascending: boolean;
}

export interface PageResult<T> {
  rows: T[];
  pagination: Pagination;
}

// supabase-js builders are deeply generic; without generated database types
// the filter builder is handled structurally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FilterBuilder = any;

export function buildPagination(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) };
}

/**
 * Run a paginated, sorted query against a table or view.
 * `applyFilters` must add the store_id scope and any other filters.
 */
export async function selectPage<T>(options: {
  table: string;
  select: string;
  applyFilters: (query: FilterBuilder) => FilterBuilder;
  sort: SortRequest;
  page: PageRequest;
}): Promise<PageResult<T>> {
  const { table, select, applyFilters, sort, page } = options;
  const from = (page.page - 1) * page.limit;
  const to = from + page.limit - 1;

  const query = applyFilters(supabase.from(table).select(select, { count: 'exact' }))
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    // PostgREST answers 416 (PGRST103) when the requested page is past the end.
    if (error.code === 'PGRST103') {
      const countResult = await applyFilters(supabase.from(table).select('id', { count: 'exact', head: true }));
      if (countResult.error) throw toAppError(countResult.error);
      return { rows: [], pagination: buildPagination(page.page, page.limit, countResult.count ?? 0) };
    }
    throw toAppError(error);
  }

  return { rows: (data ?? []) as T[], pagination: buildPagination(page.page, page.limit, count ?? 0) };
}
