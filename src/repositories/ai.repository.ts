import { supabase } from '../config/supabase.js';
import type { AiActionRow, AiAnalysisRunRow, AiInsightRow } from '../types/rows.js';
import { unwrap } from '../utils/db.js';
import { selectPage, type FilterBuilder, type PageRequest } from '../utils/pagination.js';

export interface InsightFilters {
  type?: string[] | undefined;
  priority?: string[] | undefined;
  status?: string[] | undefined;
  includeExpired?: boolean | undefined;
}

export interface ActionFilters {
  status?: string[] | undefined;
  insightId?: string | undefined;
  type?: string | undefined;
}

export interface RunFilters {
  status?: string[] | undefined;
  analysisType?: string | undefined;
}

export const aiRepository = {
  listInsights(storeId: string, filters: InsightFilters, ascending: boolean, page: PageRequest) {
    return selectPage<AiInsightRow>({
      table: 'ai_insights',
      select: '*',
      sort: { column: 'generated_at', ascending },
      page,
      applyFilters: (query: FilterBuilder) => {
        let q = query.eq('store_id', storeId);
        if (filters.type?.length) q = q.in('type', filters.type);
        if (filters.priority?.length) q = q.in('priority', filters.priority);
        if (filters.status?.length) q = q.in('status', filters.status);
        if (!filters.includeExpired) q = q.or(`expires_at.is.null,expires_at.gt."${new Date().toISOString()}"`);
        return q;
      },
    });
  },

  async findInsight(storeId: string, id: string): Promise<AiInsightRow | null> {
    return unwrap(await supabase.from('ai_insights').select('*').eq('store_id', storeId).eq('id', id).maybeSingle());
  },

  async updateInsightStatus(storeId: string, id: string, status: string): Promise<boolean> {
    const row = unwrap<{ id: string } | null>(
      await supabase.from('ai_insights').update({ status }).eq('store_id', storeId).eq('id', id).select('id').maybeSingle(),
    );
    return row !== null;
  },

  async actionsForInsight(storeId: string, insightId: string): Promise<AiActionRow[]> {
    return unwrap(
      await supabase
        .from('ai_actions')
        .select('*')
        .eq('store_id', storeId)
        .eq('insight_id', insightId)
        .order('created_at', { ascending: true }),
    );
  },

  listActions(storeId: string, filters: ActionFilters, ascending: boolean, page: PageRequest) {
    return selectPage<AiActionRow>({
      table: 'ai_actions',
      select: '*',
      sort: { column: 'created_at', ascending },
      page,
      applyFilters: (query: FilterBuilder) => {
        let q = query.eq('store_id', storeId);
        if (filters.status?.length) q = q.in('status', filters.status);
        if (filters.insightId) q = q.eq('insight_id', filters.insightId);
        if (filters.type) q = q.eq('type', filters.type);
        return q;
      },
    });
  },

  async findAction(storeId: string, id: string): Promise<AiActionRow | null> {
    return unwrap(await supabase.from('ai_actions').select('*').eq('store_id', storeId).eq('id', id).maybeSingle());
  },

  /**
   * Move a pending action to approved/rejected. The `status = 'pending'`
   * condition makes this a compare-and-set, so two concurrent decisions
   * cannot both succeed. Returns null when the action was not pending.
   */
  async decideAction(storeId: string, id: string, status: 'approved' | 'rejected'): Promise<AiActionRow | null> {
    return unwrap(
      await supabase
        .from('ai_actions')
        .update({ status, approved_at: status === 'approved' ? new Date().toISOString() : null })
        .eq('store_id', storeId)
        .eq('id', id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle(),
    );
  },

  listRuns(storeId: string, filters: RunFilters, ascending: boolean, page: PageRequest) {
    return selectPage<AiAnalysisRunRow>({
      table: 'ai_analysis_runs',
      select: '*',
      sort: { column: 'created_at', ascending },
      page,
      applyFilters: (query: FilterBuilder) => {
        let q = query.eq('store_id', storeId);
        if (filters.status?.length) q = q.in('status', filters.status);
        if (filters.analysisType) q = q.eq('analysis_type', filters.analysisType);
        return q;
      },
    });
  },

  async findRun(storeId: string, id: string): Promise<AiAnalysisRunRow | null> {
    return unwrap(
      await supabase.from('ai_analysis_runs').select('*').eq('store_id', storeId).eq('id', id).maybeSingle(),
    );
  },
};
