import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { dashboardService } from '../services/dashboard.service.js';
import { sendSuccess } from '../utils/response.js';
import { analyticsRangeQuery, recentOrdersQuery, topProductsQuery } from '../validators/analytics.validator.js';

export const dashboardController = {
  async summary(req: Request, res: Response) {
    sendSuccess(res, await dashboardService.summary(storeIdOf(req), analyticsRangeQuery.parse(req.query)));
  },

  async revenue(req: Request, res: Response) {
    sendSuccess(res, await dashboardService.revenue(storeIdOf(req), analyticsRangeQuery.parse(req.query)));
  },

  async orders(req: Request, res: Response) {
    sendSuccess(res, await dashboardService.orders(storeIdOf(req), analyticsRangeQuery.parse(req.query)));
  },

  async topProducts(req: Request, res: Response) {
    sendSuccess(res, await dashboardService.topProducts(storeIdOf(req), topProductsQuery.parse(req.query)));
  },

  async recentOrders(req: Request, res: Response) {
    const { limit } = recentOrdersQuery.parse(req.query);
    sendSuccess(res, await dashboardService.recentOrders(storeIdOf(req), limit));
  },
};
