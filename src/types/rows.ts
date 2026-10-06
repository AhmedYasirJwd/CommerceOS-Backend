/**
 * Row shapes as returned by Supabase for the tables in schema.sql and the
 * views in supabase/migrations/001_commerceos_api.sql. numeric/bigint
 * values are typed `number | string` because PostgREST may serialise them
 * either way; services normalise them with `num()`.
 */
type Numeric = number | string;

export interface StoreRow {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface StoreSettingsRow {
  id: string;
  store_id: string;
  ai_insights_enabled: boolean;
  low_stock_default_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow {
  id: string;
  store_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  products?: { count: number }[];
}

export interface CustomerStatsRow {
  id: string;
  store_id: string;
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  orders_count: Numeric;
  completed_orders_count: Numeric;
  total_spent: Numeric;
  first_order_at: string | null;
  last_order_at: string | null;
}

export interface ProductStatsRow {
  id: string;
  store_id: string;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  sku: string | null;
  price: Numeric;
  cost_price: Numeric | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  inventory_id: string | null;
  quantity: number;
  low_stock_threshold: number;
  inventory_updated_at: string | null;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
  units_sold: Numeric;
  revenue: Numeric;
  review_count: Numeric;
  average_rating: Numeric | null;
}

export interface OrderListRow {
  id: string;
  store_id: string;
  customer_id: string | null;
  order_number: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  subtotal: Numeric;
  discount: Numeric;
  tax: Numeric;
  shipping: Numeric;
  total: Numeric;
  ordered_at: string;
  created_at: string;
  updated_at: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  items_count: Numeric;
  units_count: Numeric;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: Numeric;
  subtotal: Numeric;
  created_at: string;
}

export interface InventoryMovementRow {
  id: string;
  store_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  type: 'sale' | 'restock' | 'adjustment' | 'return' | 'cancellation';
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reference_id: string | null;
  note: string | null;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  store_id: string;
  product_id: string;
  customer_id: string | null;
  rating: number;
  title: string | null;
  review_text: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  created_at: string;
  product: { id: string; name: string } | null;
  customer: { id: string; first_name: string; last_name: string | null; email: string } | null;
}

export interface AiInsightRow {
  id: string;
  store_id: string;
  type: string;
  priority: string;
  title: string;
  summary: string;
  explanation: string | null;
  recommendation: string | null;
  data: unknown;
  status: string;
  generated_by: string;
  model_name: string | null;
  generated_at: string;
  expires_at: string | null;
  created_at: string;
}

export interface AiActionRow {
  id: string;
  store_id: string;
  insight_id: string | null;
  type: string;
  title: string;
  description: string | null;
  status: string;
  parameters: unknown;
  result: unknown;
  error_message: string | null;
  approved_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiAnalysisRunRow {
  id: string;
  store_id: string;
  analysis_type: string;
  status: string;
  input_snapshot: unknown;
  output_summary: unknown;
  model_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}
