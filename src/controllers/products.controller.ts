import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { productsService } from '../services/products.service.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/common.js';
import { createProductBody, listProductsQuery, updateProductBody } from '../validators/products.validator.js';

export const productsController = {
  async list(req: Request, res: Response) {
    const result = await productsService.list(storeIdOf(req), listProductsQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async get(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await productsService.get(storeIdOf(req), id));
  },

  async create(req: Request, res: Response) {
    sendSuccess(res, await productsService.create(storeIdOf(req), createProductBody.parse(req.body)), 201);
  },

  async update(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await productsService.update(storeIdOf(req), id, updateProductBody.parse(req.body)));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await productsService.remove(storeIdOf(req), id));
  },
};
