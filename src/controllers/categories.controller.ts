import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { categoriesService } from '../services/categories.service.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/common.js';
import { createCategoryBody, listCategoriesQuery, updateCategoryBody } from '../validators/categories.validator.js';

export const categoriesController = {
  async list(req: Request, res: Response) {
    const result = await categoriesService.list(storeIdOf(req), listCategoriesQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async get(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await categoriesService.get(storeIdOf(req), id));
  },

  async create(req: Request, res: Response) {
    sendSuccess(res, await categoriesService.create(storeIdOf(req), createCategoryBody.parse(req.body)), 201);
  },

  async update(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await categoriesService.update(storeIdOf(req), id, updateCategoryBody.parse(req.body)));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await categoriesService.remove(storeIdOf(req), id));
  },
};
