import type {
  AiActionRow,
  AiAnalysisRunRow,
  AiInsightRow,
  CategoryRow,
  CustomerStatsRow,
  InventoryMovementRow,
  OrderItemRow,
  OrderListRow,
  ProductStatsRow,
  ReviewRow,
  StoreRow,
  StoreSettingsRow,
} from '../types/rows.js';
import { num, numOrNull } from '../utils/db.js';

/** Frontend-facing stock labels. */
export const STOCK_LABELS = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
} as const;

const STOCK_LEVELS = { in_stock: 'in', low_stock: 'low', out_of_stock: 'out' } as const;

export function stockStatus(status: ProductStatsRow['stock_status']) {
  return { stockStatus: STOCK_LABELS[status], stockLevel: STOCK_LEVELS[status] };
}

export function toCustomer(row: CustomerStatsRow) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    ordersCount: num(row.orders_count),
    completedOrdersCount: num(row.completed_orders_count),
    totalSpent: num(row.total_spent),
    firstOrderAt: row.first_order_at,
    lastOrderAt: row.last_order_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCategory(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    productCount: num(row.products?.[0]?.count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toProduct(row: ProductStatsRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sku: row.sku,
    price: num(row.price),
    costPrice: numOrNull(row.cost_price),
    active: row.active,
    category: row.category_id ? { id: row.category_id, name: row.category_name, slug: row.category_slug } : null,
    stockQuantity: row.quantity,
    lowStockThreshold: row.low_stock_threshold,
    ...stockStatus(row.stock_status),
    unitsSold: num(row.units_sold),
    revenue: num(row.revenue),
    reviewCount: num(row.review_count),
    averageRating: numOrNull(row.average_rating),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toInventoryItem(row: ProductStatsRow) {
  return {
    productId: row.id,
    productName: row.name,
    sku: row.sku,
    active: row.active,
    price: num(row.price),
    category: row.category_id ? { id: row.category_id, name: row.category_name, slug: row.category_slug } : null,
    quantity: row.quantity,
    lowStockThreshold: row.low_stock_threshold,
    ...stockStatus(row.stock_status),
    updatedAt: row.inventory_updated_at,
  };
}

export function toMovement(row: InventoryMovementRow) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.product_sku,
    type: row.type,
    /** Signed change: negative for sales, positive for restocks/returns/cancellations. */
    quantityChange: row.quantity,
    previousQuantity: row.previous_quantity,
    newQuantity: row.new_quantity,
    referenceId: row.reference_id,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function toOrder(row: OrderListRow) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    customer: row.customer_id
      ? { id: row.customer_id, name: row.customer_name, email: row.customer_email }
      : null,
    amount: num(row.total),
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    tax: num(row.tax),
    shipping: num(row.shipping),
    total: num(row.total),
    itemsCount: num(row.items_count),
    unitsCount: num(row.units_count),
    orderedAt: row.ordered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toOrderItem(row: OrderItemRow) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    unitPrice: num(row.unit_price),
    subtotal: num(row.subtotal),
  };
}

export function toReview(row: ReviewRow) {
  return {
    id: row.id,
    productId: row.product_id,
    product: row.product ? { id: row.product.id, name: row.product.name } : null,
    customerId: row.customer_id,
    customer: row.customer
      ? {
          id: row.customer.id,
          name: [row.customer.first_name, row.customer.last_name].filter(Boolean).join(' '),
          email: row.customer.email,
        }
      : null,
    rating: row.rating,
    title: row.title,
    reviewText: row.review_text,
    sentiment: row.sentiment,
    createdAt: row.created_at,
  };
}

export function toInsight(row: AiInsightRow) {
  return {
    id: row.id,
    type: row.type,
    priority: row.priority,
    title: row.title,
    summary: row.summary,
    explanation: row.explanation,
    recommendation: row.recommendation,
    data: row.data,
    status: row.status,
    generatedBy: row.generated_by,
    modelName: row.model_name,
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function toAction(row: AiActionRow) {
  return {
    id: row.id,
    insightId: row.insight_id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    parameters: row.parameters,
    result: row.result,
    errorMessage: row.error_message,
    approvedAt: row.approved_at,
    executedAt: row.executed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAnalysisRun(row: AiAnalysisRunRow) {
  return {
    id: row.id,
    analysisType: row.analysis_type,
    status: row.status,
    inputSnapshot: row.input_snapshot,
    outputSummary: row.output_summary,
    modelName: row.model_name,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export function toStore(row: StoreRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    currency: row.currency,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toStoreSettings(row: StoreSettingsRow | null) {
  if (!row) {
    // Schema defaults; returned until the settings row is first saved.
    return { aiInsightsEnabled: true, lowStockDefaultThreshold: 5, persisted: false, updatedAt: null };
  }
  return {
    aiInsightsEnabled: row.ai_insights_enabled,
    lowStockDefaultThreshold: row.low_stock_default_threshold,
    persisted: true,
    updatedAt: row.updated_at,
  };
}
