import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { analyticsService } from '../services/analytics.service.js';
import { sendSuccess } from '../utils/response.js';
import { analyticsRangeQuery, productPerformanceQuery } from '../validators/analytics.validator.js';

const rangeHandler =
  (fn: (storeId: string, query: ReturnType<typeof analyticsRangeQuery.parse>) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    sendSuccess(res, await fn(storeIdOf(req), analyticsRangeQuery.parse(req.query)));
  };

export const analyticsController = {
  overview: rangeHandler((s, q) => analyticsService.overview(s, q)),
  revenue: rangeHandler((s, q) => analyticsService.revenue(s, q)),
  orders: rangeHandler((s, q) => analyticsService.orders(s, q)),
  conversion: rangeHandler((s, q) => analyticsService.conversion(s, q)),
  customers: rangeHandler((s, q) => analyticsService.customers(s, q)),
  retention: rangeHandler((s, q) => analyticsService.retention(s, q)),
  categories: rangeHandler((s, q) => analyticsService.categories(s, q)),

  async products(req: Request, res: Response) {
    sendSuccess(res, await analyticsService.products(storeIdOf(req), productPerformanceQuery.parse(req.query)));
  },
};
