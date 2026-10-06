import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { aiService } from '../services/ai.service.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { listActionsQuery, listInsightsQuery, listRunsQuery, updateInsightBody } from '../validators/ai.validator.js';
import { idParams } from '../validators/common.js';

export const aiController = {
  async listInsights(req: Request, res: Response) {
    const result = await aiService.listInsights(storeIdOf(req), listInsightsQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async getInsight(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await aiService.getInsight(storeIdOf(req), id));
  },

  async updateInsight(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    const { status } = updateInsightBody.parse(req.body);
    sendSuccess(res, await aiService.updateInsightStatus(storeIdOf(req), id, status));
  },

  async listActions(req: Request, res: Response) {
    const result = await aiService.listActions(storeIdOf(req), listActionsQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async getAction(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await aiService.getAction(storeIdOf(req), id));
  },

  async approveAction(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await aiService.approveAction(storeIdOf(req), id));
  },

  async rejectAction(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await aiService.rejectAction(storeIdOf(req), id));
  },

  async listRuns(req: Request, res: Response) {
    const result = await aiService.listRuns(storeIdOf(req), listRunsQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async getRun(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await aiService.getRun(storeIdOf(req), id));
  },
};
