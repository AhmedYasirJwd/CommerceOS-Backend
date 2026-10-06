import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { inventoryService } from '../services/inventory.service.js';
import { sendList, sendSuccess } from '../utils/response.js';
import {
  adjustInventoryBody,
  inventoryAlertsQuery,
  inventoryHistoryQuery,
  listInventoryQuery,
  productIdParams,
  restockInventoryBody,
  updateInventoryBody,
} from '../validators/inventory.validator.js';

export const inventoryController = {
  async list(req: Request, res: Response) {
    const result = await inventoryService.list(storeIdOf(req), listInventoryQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async alerts(req: Request, res: Response) {
    const result = await inventoryService.alerts(storeIdOf(req), inventoryAlertsQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async history(req: Request, res: Response) {
    const result = await inventoryService.history(storeIdOf(req), inventoryHistoryQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async get(req: Request, res: Response) {
    const { productId } = productIdParams.parse(req.params);
    sendSuccess(res, await inventoryService.get(storeIdOf(req), productId));
  },

  async update(req: Request, res: Response) {
    const { productId } = productIdParams.parse(req.params);
    const { lowStockThreshold } = updateInventoryBody.parse(req.body);
    sendSuccess(res, await inventoryService.updateThreshold(storeIdOf(req), productId, lowStockThreshold));
  },

  async adjust(req: Request, res: Response) {
    sendSuccess(res, await inventoryService.adjust(storeIdOf(req), adjustInventoryBody.parse(req.body)), 201);
  },

  async restock(req: Request, res: Response) {
    sendSuccess(res, await inventoryService.restock(storeIdOf(req), restockInventoryBody.parse(req.body)), 201);
  },
};
