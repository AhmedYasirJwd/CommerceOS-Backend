import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { reviewsService } from '../services/reviews.service.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/common.js';
import { createReviewBody, listReviewsQuery, updateReviewBody } from '../validators/reviews.validator.js';

export const reviewsController = {
  async list(req: Request, res: Response) {
    const result = await reviewsService.list(storeIdOf(req), listReviewsQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async get(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await reviewsService.get(storeIdOf(req), id));
  },

  async create(req: Request, res: Response) {
    sendSuccess(res, await reviewsService.create(storeIdOf(req), createReviewBody.parse(req.body)), 201);
  },

  async update(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await reviewsService.update(storeIdOf(req), id, updateReviewBody.parse(req.body)));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await reviewsService.remove(storeIdOf(req), id));
  },
};
