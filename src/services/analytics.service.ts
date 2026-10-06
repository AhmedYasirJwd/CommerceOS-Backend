import { analyticsRepository } from '../repositories/analytics.repository.js';
import { num, numOrNull } from '../utils/db.js';
import { describeRange, resolveDateRange } from '../utils/dateRange.js';
import type { AnalyticsRangeQuery, ProductPerformanceQuery } from '../validators/analytics.validator.js';
import { compare, currentAndPrevious, round2, salesSeries } from './dashboard.service.js';
import { stockStatus } from './mappers.js';

export const analyticsService = {
  async overview(storeId: string, query: AnalyticsRangeQuery) {
    const range = resolveDateRange(query);
    const { current, previous } = await currentAndPrevious(storeId, range);
    const c = (key: Parameters<typeof compare>[2]) => compare(current, previous, key);
    return {
      period: describeRange(range),
      revenue: c('revenue'),
      orders: c('orders'),
      completedOrders: c('completed_orders'),
      averageOrderValue: c('average_order_value'),
      unitsSold: c('units_sold'),
      totalCustomers: c('total_customers'),
      newCustomers: c('new_customers'),
      purchasingCustomers: c('purchasing_customers'),
      revenuePerCustomer: c('revenue_per_customer'),
      conversionRate: c('conversion_rate'),
      sessions: c('sessions'),
      visitors: c('visitors'),
      retentionRate: c('retention_rate'),
      returningCustomerRate: c('returning_customer_rate'),
      repeatPurchaseRate: c('repeat_purchase_rate'),
    };
  },

  async revenue(storeId: string, query: AnalyticsRangeQuery) {
    const { range, rows } = await salesSeries(storeId, query);
    const series = rows.map((row) => ({
      date: row.bucket,
      revenue: num(row.revenue),
      completedOrders: num(row.completed_orders),
      averageOrderValue: num(row.average_order_value),
      unitsSold: num(row.units_sold),
    }));
    const totalRevenue = round2(series.reduce((sum, p) => sum + p.revenue, 0));
    const completed = series.reduce((sum, p) => sum + p.completedOrders, 0);
    return {
      period: describeRange(range),
      totals: {
        revenue: totalRevenue,
        completedOrders: completed,
        averageOrderValue: completed > 0 ? round2(totalRevenue / completed) : 0,
        unitsSold: series.reduce((sum, p) => sum + p.unitsSold, 0),
      },
      series,
    };
  },

  async orders(storeId: string, query: AnalyticsRangeQuery) {
    const range = resolveDateRange(query);
    const [rows, metrics] = await Promise.all([
      analyticsRepository.salesTimeseries(storeId, range, range.interval),
      analyticsRepository.periodMetrics(storeId, range),
    ]);
    return {
      period: describeRange(range),
      totals: {
        orders: num(metrics.orders),
        averageOrderValue: num(metrics.average_order_value),
      },
      statusBreakdown: {
        pending: num(metrics.pending_orders),
        processing: num(metrics.processing_orders),
        completed: num(metrics.completed_orders),
        cancelled: num(metrics.cancelled_orders),
      },
      series: rows.map((row) => ({
        date: row.bucket,
        orders: num(row.orders),
        completed: num(row.completed_orders),
        cancelled: num(row.cancelled_orders),
      })),
    };
  },

  async conversion(storeId: string, query: AnalyticsRangeQuery) {
    const range = resolveDateRange(query);
    const [rows, metrics] = await Promise.all([
      analyticsRepository.salesTimeseries(storeId, range, range.interval),
      analyticsRepository.periodMetrics(storeId, range),
    ]);
    return {
      period: describeRange(range),
      totals: {
        sessions: num(metrics.sessions),
        visitors: num(metrics.visitors),
        completedOrders: num(metrics.completed_orders),
        conversionRate: numOrNull(metrics.conversion_rate),
      },
      series: rows.map((row) => ({
        date: row.bucket,
        sessions: num(row.sessions),
        completedOrders: num(row.completed_orders),
        conversionRate: numOrNull(row.conversion_rate),
      })),
    };
  },

  async customers(storeId: string, query: AnalyticsRangeQuery) {
    const range = resolveDateRange(query);
    const [rows, metrics] = await Promise.all([
      analyticsRepository.customerGrowth(storeId, range, range.interval),
      analyticsRepository.periodMetrics(storeId, range),
    ]);
    const total = num(metrics.total_customers);
    const added = num(metrics.new_customers);
    const startCount = total - added;
    return {
      period: describeRange(range),
      totals: {
        totalCustomers: total,
        newCustomers: added,
        /** New customers as a % of the customer base at the start of the period. */
        growthRate: startCount > 0 ? round2((added / startCount) * 100) : null,
        purchasingCustomers: num(metrics.purchasing_customers),
        revenuePerCustomer: num(metrics.revenue_per_customer),
      },
      series: rows.map((row) => ({
        date: row.bucket,
        newCustomers: num(row.new_customers),
        totalCustomers: num(row.total_customers),
        activeCustomers: num(row.active_customers),
        revenuePerCustomer: num(row.revenue_per_customer),
      })),
    };
  },

  async retention(storeId: string, query: AnalyticsRangeQuery) {
    const range = resolveDateRange({ ...query, defaultRange: '1y' });
    const [metrics, cohortRows] = await Promise.all([
      analyticsRepository.periodMetrics(storeId, range),
      analyticsRepository.retentionCohorts(storeId, range),
    ]);

    const cohorts = new Map<string, { cohortMonth: string; cohortSize: number; months: { monthOffset: number; customers: number; rate: number }[] }>();
    for (const row of cohortRows) {
      const key = String(row.cohort_month);
      const size = num(row.cohort_size);
      const cohort = cohorts.get(key) ?? { cohortMonth: key, cohortSize: size, months: [] };
      const customers = num(row.active_customers);
      cohort.months.push({ monthOffset: row.month_offset, customers, rate: size > 0 ? round2((customers / size) * 100) : 0 });
      cohorts.set(key, cohort);
    }

    return {
      period: describeRange(range),
      retentionRate: numOrNull(metrics.retention_rate),
      previousPeriodCustomers: num(metrics.previous_period_customers),
      retainedCustomers: num(metrics.retained_customers),
      returningCustomerRate: num(metrics.returning_customer_rate),
      returningCustomers: num(metrics.returning_customers),
      repeatPurchaseRate: num(metrics.repeat_purchase_rate),
      repeatCustomers: num(metrics.repeat_customers),
      purchasingCustomers: num(metrics.purchasing_customers),
      cohorts: [...cohorts.values()],
    };
  },

  async categories(storeId: string, query: AnalyticsRangeQuery) {
    const range = resolveDateRange(query);
    const rows = await analyticsRepository.categoryRevenue(storeId, range);
    return {
      period: describeRange(range),
      categories: rows.map((row) => ({
        categoryId: row.category_id,
        name: row.category_name,
        revenue: num(row.revenue),
        unitsSold: num(row.units_sold),
        ordersCount: num(row.orders_count),
        sharePercent: num(row.share),
      })),
    };
  },

  async products(storeId: string, query: ProductPerformanceQuery) {
    const range = resolveDateRange(query);
    const rows = await analyticsRepository.productPerformance(storeId, range, query.sortBy, query.limit);
    return {
      period: describeRange(range),
      products: rows.map((row) => ({
        productId: row.product_id,
        name: row.product_name,
        category: row.category_id ? { id: row.category_id, name: row.category_name } : null,
        price: num(row.price),
        unitsSold: num(row.units_sold),
        revenue: num(row.revenue),
        ordersCount: num(row.orders_count),
        cost: numOrNull(row.cost),
        grossProfit: numOrNull(row.gross_profit),
        marginPercent: numOrNull(row.margin),
        reviewCount: num(row.review_count),
        averageRating: numOrNull(row.average_rating),
        stockQuantity: row.quantity,
        ...stockStatus(row.stock_status),
      })),
    };
  },
};
