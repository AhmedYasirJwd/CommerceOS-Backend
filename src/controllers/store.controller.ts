import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { storeService } from '../services/store.service.js';
import { sendSuccess } from '../utils/response.js';
import { updateStoreBody, updateStoreSettingsBody } from '../validators/store.validator.js';

export const storeController = {
  async get(req: Request, res: Response) {
    sendSuccess(res, await storeService.get(storeIdOf(req)));
  },

  async update(req: Request, res: Response) {
    sendSuccess(res, await storeService.update(storeIdOf(req), updateStoreBody.parse(req.body)));
  },

  async getSettings(req: Request, res: Response) {
    sendSuccess(res, await storeService.getSettings(storeIdOf(req)));
  },

  async updateSettings(req: Request, res: Response) {
    sendSuccess(res, await storeService.updateSettings(storeIdOf(req), updateStoreSettingsBody.parse(req.body)));
  },
};
