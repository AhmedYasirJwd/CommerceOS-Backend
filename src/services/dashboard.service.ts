import { analyticsRepository, type PeriodMetricsRow } from '../repositories/analytics.repository.js';
import { ordersRepository } from '../repositories/orders.repository.js';
import { num, numOrNull } from '../utils/db.js';
import { describeRange, percentChange, previousPeriod, resolveDateRange } from '../utils/dateRange.js';
import type { AnalyticsRangeQuery, TopProductsQuery } from '../validators/analytics.validator.js';
import { toOrder } from './mappers.js';

/** A KPI with its value in the previous equal-length period and the relative change (%). */
export function metric(current: number | null, previous: number | null) {
  return {
    value: current,
    previousValue: previous,
    changePercent: current === null || previous === null ? null : percentChange(current, previous),
  };
}

export async function currentAndPrevious(storeId: string, range: { from: Date; to: Date }) {
  const [current, previous] = await Promise.all([
    analyticsRepository.periodMetrics(storeId, range),
    analyticsRepository.periodMetrics(storeId, previousPeriod(range)),
  ]);
  return { current, previous };
}

export function compare(current: PeriodMetricsRow, previous: PeriodMetricsRow, key: keyof PeriodMetricsRow) {
  return metric(numOrNull(current[key]), numOrNull(previous[key]));
}

export function salesSeries(storeId: string, query: AnalyticsRangeQuery) {
  const range = resolveDateRange(query);
  return analyticsRepository.salesTimeseries(storeId, range, range.interval).then((rows) => ({ range, rows }));
}

export const dashboardService = {
  /** KPI cards. Revenue and orders are for the selected period; totalCustomers is the count at period end. */
  async summary(storeId: string, query: AnalyticsRangeQuery) {
    const range = resolveDateRange(query);
    const { current, previous } = await currentAndPrevious(storeId, range);
    return {
      period: describeRange(range),
      totalRevenue: compare(current, previous, 'revenue'),
      totalOrders: compare(current, previous, 'orders'),
      totalCustomers: compare(current, previous, 'total_customers'),
      conversionRate: compare(current, previous, 'conversion_rate'),
      averageOrderValue: compare(current, previous, 'average_order_value'),
      newCustomers: compare(current, previous, 'new_customers'),
    };
  },

  async revenue(storeId: string, query: AnalyticsRangeQuery) {
    const { range, rows } = await salesSeries(storeId, query);
    const series = rows.map((row) => ({
      date: row.bucket,
      revenue: num(row.revenue),
      orders: num(row.orders),
      averageOrderValue: num(row.average_order_value),
    }));
    return {
      period: describeRange(range),
      totalRevenue: round2(series.reduce((sum, point) => sum + point.revenue, 0)),
      series,
    };
  },

  async orders(storeId: string, query: AnalyticsRangeQuery) {
    const { range, rows } = await salesSeries(storeId, query);
    const series = rows.map((row) => ({
      date: row.bucket,
      orders: num(row.orders),
      completed: num(row.completed_orders),
      cancelled: num(row.cancelled_orders),
    }));
    return {
      period: describeRange(range),
      totalOrders: series.reduce((sum, point) => sum + point.orders, 0),
      series,
    };
  },

  async topProducts(storeId: string, query: TopProductsQuery) {
    const range = resolveDateRange(query);
    const rows = await analyticsRepository.topProducts(storeId, range, query.limit, query.sortBy);
    return {
      period: describeRange(range),
      products: rows.map((row) => ({
        productId: row.product_id,
        name: row.product_name,
        category: row.category_name,
        unitsSold: num(row.units_sold),
        revenue: num(row.revenue),
        ordersCount: num(row.orders_count),
      })),
    };
  },

  async recentOrders(storeId: string, limit: number) {
    const rows = await ordersRepository.recent(storeId, limit);
    return rows.map(toOrder);
  },
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
