import { aiRepository } from '../repositories/ai.repository.js';
import { conflict, notFound } from '../utils/errors.js';
import type { ListActionsQuery, ListInsightsQuery, ListRunsQuery } from '../validators/ai.validator.js';
import { toAction, toAnalysisRun, toInsight } from './mappers.js';

/**
 * Read/state access to stored AI records. Nothing here calls a model or
 * generates content: insights, actions and runs are produced by a later
 * phase. With no stored records the endpoints return empty lists.
 */

const insightNotFound = () => notFound('AI_INSIGHT_NOT_FOUND', 'AI insight not found');
const actionNotFound = () => notFound('AI_ACTION_NOT_FOUND', 'AI action not found');

async function decide(storeId: string, id: string, status: 'approved' | 'rejected') {
  const updated = await aiRepository.decideAction(storeId, id, status);
  if (updated) return toAction(updated);

  const existing = await aiRepository.findAction(storeId, id);
  if (!existing) throw actionNotFound();
  throw conflict('INVALID_ACTION_STATE', `Only pending actions can be ${status}; this action is ${existing.status}`);
}

export const aiService = {
  async listInsights(storeId: string, query: ListInsightsQuery) {
    const result = await aiRepository.listInsights(
      storeId,
      { type: query.type, priority: query.priority, status: query.status, includeExpired: query.includeExpired },
      query.sortOrder === 'asc',
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toInsight), pagination: result.pagination };
  },

  async getInsight(storeId: string, id: string) {
    const [row, actions] = await Promise.all([
      aiRepository.findInsight(storeId, id),
      aiRepository.actionsForInsight(storeId, id),
    ]);
    if (!row) throw insightNotFound();
    return { ...toInsight(row), actions: actions.map(toAction) };
  },

  async updateInsightStatus(storeId: string, id: string, status: string) {
    if (!(await aiRepository.updateInsightStatus(storeId, id, status))) throw insightNotFound();
    return this.getInsight(storeId, id);
  },

  async listActions(storeId: string, query: ListActionsQuery) {
    const result = await aiRepository.listActions(
      storeId,
      { status: query.status, insightId: query.insightId, type: query.type },
      query.sortOrder === 'asc',
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toAction), pagination: result.pagination };
  },

  async getAction(storeId: string, id: string) {
    const row = await aiRepository.findAction(storeId, id);
    if (!row) throw actionNotFound();
    return toAction(row);
  },

  /** Records approval only. Execution of the action is implemented in a later phase. */
  approveAction: (storeId: string, id: string) => decide(storeId, id, 'approved'),

  rejectAction: (storeId: string, id: string) => decide(storeId, id, 'rejected'),

  async listRuns(storeId: string, query: ListRunsQuery) {
    const result = await aiRepository.listRuns(
      storeId,
      { status: query.status, analysisType: query.analysisType },
      query.sortOrder === 'asc',
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toAnalysisRun), pagination: result.pagination };
  },

  async getRun(storeId: string, id: string) {
    const row = await aiRepository.findRun(storeId, id);
    if (!row) throw notFound('AI_ANALYSIS_RUN_NOT_FOUND', 'AI analysis run not found');
    return toAnalysisRun(row);
  },
};
