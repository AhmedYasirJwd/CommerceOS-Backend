import { supabase } from '../config/supabase.js';
import { unwrap } from '../utils/db.js';
import type { Interval } from '../utils/dateRange.js';

/** Thin wrappers around the aggregation functions in 001_commerceos_api.sql. */

export interface PeriodMetricsRow {
  revenue: number;
  orders: number;
  completed_orders: number;
  pending_orders: number;
  processing_orders: number;
  cancelled_orders: number;
  units_sold: number;
  average_order_value: number;
  total_customers: number;
  new_customers: number;
  purchasing_customers: number;
  revenue_per_customer: number;
  returning_customers: number;
  returning_customer_rate: number;
  repeat_customers: number;
  repeat_purchase_rate: number;
  previous_period_customers: number;
  retained_customers: number;
  retention_rate: number | null;
  sessions: number;
  visitors: number;
  conversion_rate: number | null;
}

type Numeric = number | string;

export interface SalesBucketRow {
  bucket: string;
  revenue: Numeric;
  orders: Numeric;
  completed_orders: Numeric;
  cancelled_orders: Numeric;
  units_sold: Numeric;
  average_order_value: Numeric;
  sessions: Numeric;
  conversion_rate: Numeric | null;
}

export interface TopProductRow {
  product_id: string | null;
  product_name: string;
  category_id: string | null;
  category_name: string | null;
  units_sold: Numeric;
  revenue: Numeric;
  orders_count: Numeric;
}

export interface CustomerGrowthRow {
  bucket: string;
  new_customers: Numeric;
  total_customers: Numeric;
  active_customers: Numeric;
  revenue: Numeric;
  revenue_per_customer: Numeric;
}

export interface CohortRow {
  cohort_month: string;
  cohort_size: Numeric;
  month_offset: number;
  active_customers: Numeric;
}

export interface CategoryRevenueRow {
  category_id: string | null;
  category_name: string;
  revenue: Numeric;
  units_sold: Numeric;
  orders_count: Numeric;
  share: Numeric;
}

export interface ProductPerformanceRow {
  product_id: string;
  product_name: string;
  category_id: string | null;
  category_name: string | null;
  price: Numeric;
  units_sold: Numeric;
  revenue: Numeric;
  orders_count: Numeric;
  cost: Numeric | null;
  gross_profit: Numeric | null;
  margin: Numeric | null;
  review_count: Numeric;
  average_rating: Numeric | null;
  quantity: number;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

interface Period {
  from: Date;
  to: Date;
}

const base = (storeId: string, period: Period) => ({
  p_store_id: storeId,
  p_from: period.from.toISOString(),
  p_to: period.to.toISOString(),
});

export const analyticsRepository = {
  async periodMetrics(storeId: string, period: Period): Promise<PeriodMetricsRow> {
    return unwrap(await supabase.rpc('period_metrics', base(storeId, period)));
  },

  async salesTimeseries(storeId: string, period: Period, interval: Interval): Promise<SalesBucketRow[]> {
    return unwrap(await supabase.rpc('sales_timeseries', { ...base(storeId, period), p_interval: interval }));
  },

  async topProducts(storeId: string, period: Period, limit: number, sortBy: 'units' | 'revenue'): Promise<TopProductRow[]> {
    return unwrap(
      await supabase.rpc('top_selling_products', { ...base(storeId, period), p_limit: limit, p_sort_by: sortBy }),
    );
  },

  async customerGrowth(storeId: string, period: Period, interval: Interval): Promise<CustomerGrowthRow[]> {
    return unwrap(await supabase.rpc('customer_growth_series', { ...base(storeId, period), p_interval: interval }));
  },

  async retentionCohorts(storeId: string, period: Period): Promise<CohortRow[]> {
    return unwrap(await supabase.rpc('retention_cohorts', base(storeId, period)));
  },

  async categoryRevenue(storeId: string, period: Period): Promise<CategoryRevenueRow[]> {
    return unwrap(await supabase.rpc('category_revenue', base(storeId, period)));
  },

  async productPerformance(
    storeId: string,
    period: Period,
    sortBy: string,
    limit: number,
  ): Promise<ProductPerformanceRow[]> {
    return unwrap(
      await supabase.rpc('product_performance', { ...base(storeId, period), p_sort_by: sortBy, p_limit: limit }),
    );
  },
};
