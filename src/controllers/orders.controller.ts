import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { ordersService } from '../services/orders.service.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/common.js';
import { createOrderBody, listOrdersQuery, updateOrderBody } from '../validators/orders.validator.js';

export const ordersController = {
  async list(req: Request, res: Response) {
    const result = await ordersService.list(storeIdOf(req), listOrdersQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async get(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await ordersService.get(storeIdOf(req), id));
  },

  async create(req: Request, res: Response) {
    sendSuccess(res, await ordersService.create(storeIdOf(req), createOrderBody.parse(req.body)), 201);
  },

  async update(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await ordersService.update(storeIdOf(req), id, updateOrderBody.parse(req.body)));
  },
};
