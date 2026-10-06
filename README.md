# CommerceOS Backend

REST API for the CommerceOS dashboard. Node.js + TypeScript + Express 5, Zod validation, Supabase PostgreSQL.

```
CommerceOS Frontend  ──HTTPS/JSON──▶  CommerceOS Backend  ──supabase-js──▶  Supabase PostgreSQL
```

The backend is stateless (no local files, no in-memory state, no background workers), so it runs locally with `npm run dev` or as a Vercel serverless function.

- [Setup](#setup)
- [Supabase setup](#supabase-setup)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [Metric definitions](#metric-definitions)
- [API reference](#api-reference)
- [Vercel deployment](#vercel-deployment)

---

## Setup

```bash
npm install
cp .env.example .env      # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run seed              # creates the demo store and prints DEFAULT_STORE_ID
# put DEFAULT_STORE_ID in .env
npm run dev               # http://localhost:3001
```

## Supabase setup

The database schema (`schema.sql`) is the source of truth and is expected to **already exist** in your Supabase project. This backend does not create or alter tables.

Run these in the Supabase SQL editor, in order:

| File | Required | What it does |
| --- | --- | --- |
| `schema.sql` | yes (if not already applied) | Tables, constraints, indexes, triggers. |
| `supabase/migrations/001_commerceos_api.sql` | **yes** | Additive only. Adds 4 read views and 13 functions. These are needed because supabase-js cannot run multi-statement transactions or `GROUP BY` queries. Transactional writes (orders, inventory changes, product creation) and all aggregations run inside PostgreSQL. Safe to re-run. |
| `supabase/migrations/002_enable_rls_recommended.sql` | recommended | Enables Row Level Security on every table. See the security note below. |

> **Security note on the schema.** `schema.sql` creates every table without Row Level Security. On Supabase, that means anyone holding the project's public **anon** key can read and write every table directly through the Supabase REST API, bypassing this backend. `002_enable_rls_recommended.sql` enables RLS with no policies, which blocks the anon and authenticated roles. The backend uses the service role, which bypasses RLS, so nothing in the API changes.

## Environment variables

`.env.example`:

```env
NODE_ENV=development
PORT=3001
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_URL=http://localhost:3000
AUTH_MODE=demo
DEFAULT_STORE_ID=
```

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Project URL (Settings → API). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key. **Backend only.** Never give it to the frontend and never commit it. |
| `FRONTEND_URL` | Allowed CORS origin(s), comma-separated. `http://localhost:3000` is always allowed outside production. |
| `AUTH_MODE` | `demo` (no login; every request is scoped to `DEFAULT_STORE_ID`) or `supabase` (see [Authentication](#authentication)). |
| `DEFAULT_STORE_ID` | Store used in demo mode and by the seed script. |

The environment is validated at startup. If something is missing, the server refuses to start and lists the problems.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with auto-reload (tsx watch). |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Run the compiled server (`dist/src/server.js`). |
| `npm run typecheck` | Type-check without emitting. |
| `npm run seed` | Seed the demo store. Refuses if the store already has data. |
| `npm run seed:reset` | Delete the demo store's data (only that store's), then seed again. |

The seed creates 7 categories, 42 products, 160 customers, 650 orders over 12 months (~1,150 items), the matching inventory and ~1,300 inventory movements, ~200 reviews, ~34k store visits, 4 stored AI insights and 3 AI actions. The data is internally consistent:
- Every order total equals the sum of its items − discount + tax + shipping.
- Every stock change is a movement, and each product's final quantity equals the sum of its movements.
- Units sold equal the units moved out of inventory.
- The stored AI records are clearly labelled `generated_by = 'seed'` and are derived from the seeded numbers. They are not model output.

## Architecture

```
src/
  config/        env.ts (zod-validated env), supabase.ts (service-role client)
  middleware/    auth (store context), errorHandler, notFound, requestLogger
  routes/        route table
  controllers/   HTTP layer: parse/validate input → call service → send response
  services/      business rules, mapping DB rows → API objects
  repositories/  all database access (supabase-js queries, views, RPCs)
  validators/    zod schemas for params, queries and bodies
  types/         row types, request context
  utils/         errors, pagination, date ranges, search, slug
  app.ts         express app, default export (no listen) — Vercel's entry point
  server.ts      local HTTP server
scripts/seed.ts  seed runner; scripts/seed/generate.ts is the pure data generator
supabase/migrations/
```

**Request flow:** Route → Controller → Service → Repository → Supabase.

**Store scoping:** every repository method takes `storeId` as its first argument and filters by it. Tables without a `store_id` column (`inventory`, `inventory_movements`, `order_items`) are reached only through a store-scoped product or order. Related ids supplied in a request (category, customer, product) are checked against the same store.

**Transactions:** creating an order, cancelling an order, restocking/adjusting stock, and creating a product (product + inventory + initial movement) each run as one PostgreSQL function. Either every write succeeds or none do. Inventory rows are locked (`FOR UPDATE`, in a consistent order) to prevent overselling under concurrency. Order numbers are generated under a per-store advisory lock.

**Derived values are never stored.** Customer order counts and spend, product units sold and revenue, and stock status are all computed by views over `orders` / `order_items` / `inventory`.

### Authentication

`src/middleware/auth.ts` is the only place that decides who the caller is.

- `AUTH_MODE=demo` (default): no login. Every request acts as owner of `DEFAULT_STORE_ID`. Use this until the frontend has login.
- `AUTH_MODE=supabase`: the client sends `Authorization: Bearer <Supabase Auth access token>`. The backend verifies the token with Supabase Auth, then finds the matching `users` row (by `users.id = auth user id`, otherwise by email). It then loads that user's `store_members` rows. Users in several stores pick one with the `X-Store-Id` header. A `viewer` role can only read; writes return `403 INSUFFICIENT_ROLE`.

### Order status & inventory rules

- Stock is reserved (decremented, `sale` movement) when an order is **created**, for any status other than cancelled.
- Allowed transitions: `pending → processing | completed | cancelled`, `processing → completed | cancelled`, `completed → cancelled`. `cancelled` is final.
- Cancelling puts stock back: a `cancellation` movement, or `return` if the order was completed.
- `inventory_movements.quantity` is a **signed** change (sale = negative). `previous_quantity` and `new_quantity` hold the levels before and after.
- Stock can never go negative. Orders that exceed stock fail with `409 INSUFFICIENT_STOCK`, and adjustments that would go below 0 fail with `422 NEGATIVE_INVENTORY`.
- Product `PATCH` does not change stock. Use `/api/inventory/*` so every change is recorded.

## Metric definitions

All reporting periods are half-open `[from, to)`. Time buckets use the store's `timezone`.

| Metric | Definition |
| --- | --- |
| **Revenue** | `SUM(orders.total)` of orders with status `completed`. |
| **Orders** | Count of orders whose status is not `cancelled`. |
| **Average order value** | Revenue ÷ completed orders. |
| **Units sold** | `SUM(order_items.quantity)` on completed orders. |
| **Product / category revenue** | `SUM(order_items.subtotal)` on completed orders. This is item revenue before order-level discount, tax and shipping, so it can differ from store revenue. |
| **Conversion rate** | `completed orders ÷ distinct sessions × 100` in the period. A session is `store_visits.session_id`, or `visitor_id` when there is no session id, or the visit row itself when neither is set. `null` when there were no sessions. |
| **Visitors** | Distinct `store_visits.visitor_id` (falling back to session id, then row id). |
| **Customer total spent** | Sum of totals of the customer's completed orders. |
| **Customer orders count** | The customer's non-cancelled orders. |
| **Total customers** | Customers created before the end of the period. |
| **New customers** | Customers created in the period. |
| **Customer growth rate** | New customers ÷ customers at the start of the period × 100. |
| **Purchasing customers** | Distinct customers with ≥ 1 completed order in the period. |
| **Revenue per customer** | Revenue ÷ purchasing customers. |
| **Retention rate** | Of customers with a completed order in the *previous* equal-length period, the % who also had a completed order in this period. `null` if the previous period had no buyers. |
| **Returning customer rate** | % of this period's purchasing customers who had a completed order before the period started. |
| **Repeat purchase rate** | % of this period's purchasing customers with ≥ 2 completed orders in the period. |
| **Retention cohorts** | A customer's cohort is the month of their first completed order. For each later month, the table counts how many customers in the cohort had a completed order that month. |
| **Stock status** | `Out of Stock` if quantity = 0. `Low Stock` if 0 < quantity ≤ low_stock_threshold. Otherwise `In Stock`. A product with no inventory row counts as 0 units, with the store's default threshold. |
| **changePercent** | `(current − previous) ÷ previous × 100` against the previous equal-length period. `null` when the previous value is 0 and the current one isn't. |

---

## API reference

Base URL: `http://localhost:3001` (local).

### Conventions

**Success**

```json
{ "success": true, "data": { } }
```

**List**

```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

**Error**

```json
{ "success": false, "error": { "code": "PRODUCT_NOT_FOUND", "message": "Product not found" } }
```

Validation errors return `400 VALIDATION_ERROR` with `details: [{ path, message }]`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid input (`VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_DATE_RANGE`, …) |
| 401 / 403 | Auth (`UNAUTHORIZED`, `STORE_ACCESS_DENIED`, `INSUFFICIENT_ROLE`, `CORS_ORIGIN_DENIED`) |
| 404 | `*_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | Conflicts (`INSUFFICIENT_STOCK`, `INVALID_STATUS_TRANSITION`, `CATEGORY_SLUG_EXISTS`, `CUSTOMER_EMAIL_EXISTS`, `CUSTOMER_HAS_ORDERS`, `INVALID_ACTION_STATE`, …) |
| 422 | Business-rule violations (`NEGATIVE_INVENTORY`, `INVALID_INVENTORY_CHANGE`, `PRODUCT_INACTIVE`, `INVALID_DISCOUNT`) |
| 500 / 503 | `DATABASE_ERROR`, `DATABASE_NOT_MIGRATED`, `DATABASE_UNAVAILABLE`, `INTERNAL_ERROR` |

**Pagination:** `?page=1&limit=20` (`limit` max 100).
**Sorting:** `?sortBy=<field>&sortOrder=asc|desc`.
**Multi-value filters:** comma-separated, e.g. `?status=pending,processing`.
**Dates:** `YYYY-MM-DD` or ISO-8601. A date-only `to` includes that whole day.

**Date ranges (dashboard & analytics):** `?range=7d|30d|90d|1y` (default `30d`; retention defaults to `1y`), or `?from=…&to=…`. The optional `interval=day|week|month` defaults to `day` for ≤ 31 days, `week` for ≤ 120 days, and `month` otherwise.

### Endpoint map

| Feature | Method | Endpoint |
| --- | --- | --- |
| Root | GET | `/` |
| Health | GET | `/health` |
| Customers | GET | `/api/customers` |
| Customer | GET | `/api/customers/:id` |
| Create customer | POST | `/api/customers` |
| Update customer | PATCH | `/api/customers/:id` |
| Delete customer | DELETE | `/api/customers/:id` |
| Products | GET | `/api/products` |
| Product | GET | `/api/products/:id` |
| Create product | POST | `/api/products` |
| Update product | PATCH | `/api/products/:id` |
| Delete product | DELETE | `/api/products/:id` |
| Categories | GET | `/api/categories` |
| Category | GET | `/api/categories/:id` |
| Create category | POST | `/api/categories` |
| Update category | PATCH | `/api/categories/:id` |
| Delete category | DELETE | `/api/categories/:id` |
| Orders | GET | `/api/orders` |
| Order (with items) | GET | `/api/orders/:id` |
| Create order | POST | `/api/orders` |
| Update order status/customer | PATCH | `/api/orders/:id` |
| Inventory | GET | `/api/inventory` |
| Inventory alerts | GET | `/api/inventory/alerts` |
| Inventory history | GET | `/api/inventory/history` |
| Product inventory | GET | `/api/inventory/:productId` |
| Set low-stock threshold | PATCH | `/api/inventory/:productId` |
| Adjust stock | POST | `/api/inventory/adjust` |
| Restock | POST | `/api/inventory/restock` |
| Dashboard summary | GET | `/api/dashboard/summary` |
| Dashboard revenue chart | GET | `/api/dashboard/revenue` |
| Dashboard orders chart | GET | `/api/dashboard/orders` |
| Top products | GET | `/api/dashboard/top-products` |
| Recent orders | GET | `/api/dashboard/recent-orders` |
| Analytics overview | GET | `/api/analytics/overview` |
| Revenue analytics | GET | `/api/analytics/revenue` |
| Orders analytics | GET | `/api/analytics/orders` |
| Conversion analytics | GET | `/api/analytics/conversion` |
| Customer analytics | GET | `/api/analytics/customers` |
| Retention | GET | `/api/analytics/retention` |
| Category revenue | GET | `/api/analytics/categories` |
| Product performance | GET | `/api/analytics/products` |
| AI insights | GET | `/api/ai/insights` |
| AI insight | GET | `/api/ai/insights/:id` |
| Update AI insight status | PATCH | `/api/ai/insights/:id` |
| AI actions | GET | `/api/ai/actions` |
| AI action | GET | `/api/ai/actions/:id` |
| Approve AI action | PATCH | `/api/ai/actions/:id/approve` |
| Reject AI action | PATCH | `/api/ai/actions/:id/reject` |
| AI analysis runs | GET | `/api/ai/analysis-runs` |
| AI analysis run | GET | `/api/ai/analysis-runs/:id` |
| Reviews | GET | `/api/reviews` |
| Review | GET | `/api/reviews/:id` |
| Create review | POST | `/api/reviews` |
| Update review | PATCH | `/api/reviews/:id` |
| Delete review | DELETE | `/api/reviews/:id` |
| Store | GET | `/api/store` |
| Update store | PATCH | `/api/store` |
| Store settings | GET | `/api/store/settings` |
| Update store settings | PATCH | `/api/store/settings` |

### Health

`GET /health` returns `200` when the database is reachable, otherwise `503`.

```json
{
  "success": true,
  "status": "ok",
  "service": "commerceos-backend",
  "version": "1.0.0",
  "environment": "development",
  "authMode": "demo",
  "timestamp": "2026-10-06T12:00:00.000Z",
  "uptimeSeconds": 42,
  "database": { "status": "ok", "latencyMs": 85 },
  "defaultStore": { "configured": true, "found": true }
}
```

### Customers

`GET /api/customers` query parameters:
- `page`, `limit`
- `search`: matches name, email or phone
- `status`: `active` or `inactive`
- `sortBy`: `name | email | orders | totalSpent | lastOrderAt | createdAt` (default `createdAt`)
- `sortOrder`

```bash
curl "http://localhost:3001/api/customers?search=john&status=active&sortBy=totalSpent&sortOrder=desc"
```

```json
{
  "success": true,
  "data": [{
    "id": "4b0c…", "firstName": "John", "lastName": "Smith", "name": "John Smith",
    "email": "john.smith@example.com", "phone": "+1-555-201-3344", "status": "active",
    "ordersCount": 7, "completedOrdersCount": 6, "totalSpent": 812.4,
    "firstOrderAt": "2026-01-10T09:12:00.000Z", "lastOrderAt": "2026-09-28T17:40:00.000Z",
    "createdAt": "…", "updatedAt": "…"
  }],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`GET /api/customers/:id` returns the same fields plus `recentOrders` (the last 10).

`POST /api/customers` (201):

```json
{ "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com", "phone": "+1-555-0100", "status": "active" }
```

`PATCH /api/customers/:id` accepts any subset of the create fields. A duplicate email returns `409 CUSTOMER_EMAIL_EXISTS`.

`DELETE /api/customers/:id` returns `409 CUSTOMER_HAS_ORDERS` if the customer has orders. Set them inactive instead, or use `?force=true`: their orders are kept, without a customer.

### Products

`GET /api/products` query parameters:
- `search`: matches name, SKU or category
- `category`: slug or id
- `stock`: `in`, `low`, `out` (comma-separated)
- `active`: `true` or `false`
- `minPrice`, `maxPrice`
- `sortBy`: `name | price | stock | unitsSold | revenue | category | createdAt`
- `sortOrder`

```bash
curl "http://localhost:3001/api/products?category=shoes&stock=low,out&sortBy=unitsSold&sortOrder=desc"
```

```json
{
  "success": true,
  "data": [{
    "id": "…", "name": "Everyday Running Shoes", "slug": "everyday-running-shoes", "sku": "SHO-RUN-01",
    "description": "…", "price": 129.99, "costPrice": 61.2, "active": true,
    "category": { "id": "…", "name": "Shoes", "slug": "shoes" },
    "stockQuantity": 4, "lowStockThreshold": 10, "stockStatus": "Low Stock", "stockLevel": "low",
    "unitsSold": 74, "revenue": 9619.26, "reviewCount": 12, "averageRating": 4.33,
    "createdAt": "…", "updatedAt": "…"
  }],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`POST /api/products` (201). `initialQuantity` creates the inventory row and records a `restock` movement:

```json
{
  "name": "Trail Socks", "price": 14.99, "costPrice": 5, "categoryId": "…", "sku": "SPO-SCK-01",
  "description": "Merino trail socks", "active": true, "initialQuantity": 100, "lowStockThreshold": 15
}
```

`PATCH /api/products/:id` accepts `name, slug, description, sku, price, costPrice, categoryId (nullable), active`. It does not change stock.

`DELETE /api/products/:id` permanently deletes the product, its inventory and its movement history. Past orders keep their line items. To hide a product instead, set `active: false`.

### Categories

`GET /api/categories` query parameters:
- `search`
- `sortBy`: `name | slug | createdAt` (default `name asc`)
- `limit` (default 100)

Each category includes `productCount`.

`POST /api/categories`:

```json
{ "name": "Shoes", "slug": "shoes", "description": "Footwear" }
```

`slug` is optional (derived from `name`) and must match `^[a-z0-9]+(-[a-z0-9]+)*$`. A slug that already exists in the store returns `409 CATEGORY_SLUG_EXISTS`. Deleting a category leaves its products uncategorized.

### Orders

`GET /api/orders` query parameters:
- `search`: matches order number, customer name or customer email
- `status`: comma-separated statuses
- `customerId`
- `from`, `to`
- `minTotal`, `maxTotal`
- `sortBy`: `orderedAt | total | orderNumber | status | customer`
- `sortOrder`

```bash
curl "http://localhost:3001/api/orders?status=completed&from=2026-10-01&to=2026-10-06"
```

```json
{
  "success": true,
  "data": [{
    "id": "…", "orderNumber": "ORD-100642", "status": "completed",
    "customer": { "id": "…", "name": "Aisha Khan", "email": "aisha.khan@example.com" },
    "amount": 141.47, "subtotal": 128, "discount": 0, "tax": 10.24, "shipping": 0, "total": 141.47,
    "itemsCount": 2, "unitsCount": 3, "orderedAt": "2026-10-03T14:22:10.000Z", "createdAt": "…", "updatedAt": "…"
  }],
  "pagination": { "page": 1, "limit": 20, "total": 9, "totalPages": 1 }
}
```

`GET /api/orders/:id` returns the order plus
`items: [{ id, productId, productName, quantity, unitPrice, subtotal }]`.

`POST /api/orders` (201):

```json
{
  "customerId": "…",
  "items": [
    { "productId": "…", "quantity": 2 },
    { "productId": "…", "quantity": 1, "unitPrice": 19.5 }
  ],
  "status": "pending",
  "discount": 5, "tax": 4.2, "shipping": 7.99
}
```

- `unitPrice` is optional. It defaults to the product's current price.
- Item name and price are copied onto the order, so later product edits don't change past orders.
- `orderNumber` is optional. It defaults to the next `ORD-<n>`.
- `orderedAt` is optional and defaults to now.
- `status` can be `pending`, `processing` or `completed`.
- Errors: `INSUFFICIENT_STOCK`, `PRODUCT_INACTIVE`, `PRODUCT_NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `INVALID_DISCOUNT`.

`PATCH /api/orders/:id`:

```json
{ "status": "cancelled" }
```

You can also send `{ "customerId": "…" | null }`. Status transitions are listed under [Order status & inventory rules](#order-status--inventory-rules).

### Inventory

`GET /api/inventory` query parameters:
- `search`
- `category`
- `stock`: `in`, `low`, `out` (comma-separated)
- `sortBy`: `name | quantity | threshold | status | updatedAt` (default `name asc`)

```json
{
  "productId": "…", "productName": "Smart Fitness Watch", "sku": "ELE-WCH-01", "active": true, "price": 149,
  "category": { "id": "…", "name": "Electronics", "slug": "electronics" },
  "quantity": 3, "lowStockThreshold": 8, "stockStatus": "Low Stock", "stockLevel": "low", "updatedAt": "…"
}
```

`GET /api/inventory/alerts` lists active low-stock and out-of-stock products, lowest quantity first.

`GET /api/inventory/history` query parameters:
- `productId`
- `type`: `sale, restock, adjustment, return, cancellation` (comma-separated)
- `from`, `to`
- `sortOrder` (default `desc`)

```json
{
  "id": "…", "productId": "…", "productName": "Smart Fitness Watch", "sku": "ELE-WCH-01",
  "type": "sale", "quantityChange": -2, "previousQuantity": 5, "newQuantity": 3,
  "referenceId": "<order id>", "note": "Order ORD-100640", "createdAt": "…"
}
```

`GET /api/inventory/:productId` returns the inventory item plus `recentMovements` (the last 20).

`PATCH /api/inventory/:productId`:

```json
{ "lowStockThreshold": 12 }
```

`POST /api/inventory/restock` (201):

```json
{ "productId": "…", "quantity": 50, "note": "PO-1182" }
```

`POST /api/inventory/adjust` (201). Send exactly one of `quantityChange` (signed) or `newQuantity` (absolute, e.g. after a stock count):

```json
{ "productId": "…", "quantityChange": -3, "type": "adjustment", "note": "Damaged in warehouse" }
```

`type` can be `adjustment` (default) or `return`. Both endpoints return:

```json
{
  "success": true,
  "data": {
    "movement": { "id": "…", "type": "restock", "quantityChange": 50, "previousQuantity": 3, "newQuantity": 53 },
    "inventory": { "productId": "…", "quantity": 53, "stockStatus": "In Stock" }
  }
}
```

### Dashboard

All dashboard endpoints accept the date-range parameters.

`GET /api/dashboard/summary?range=30d`. Each metric is `{ value, previousValue, changePercent }`:

```json
{
  "success": true,
  "data": {
    "period": { "range": "30d", "from": "…", "to": "…", "interval": "day" },
    "totalRevenue":      { "value": 13897.18, "previousValue": 12011.4, "changePercent": 15.7 },
    "totalOrders":       { "value": 98, "previousValue": 90, "changePercent": 8.89 },
    "totalCustomers":    { "value": 160, "previousValue": 143, "changePercent": 11.89 },
    "conversionRate":    { "value": 3.1, "previousValue": 2.95, "changePercent": 5.08 },
    "averageOrderValue": { "value": 157.92, "previousValue": 149.2, "changePercent": 5.84 },
    "newCustomers":      { "value": 17, "previousValue": 15, "changePercent": 13.33 }
  }
}
```

`GET /api/dashboard/revenue?range=1y&interval=month`:

```json
{ "period": { … }, "totalRevenue": 93563.06,
  "series": [{ "date": "2025-10-01", "revenue": 3120.5, "orders": 21, "averageOrderValue": 148.6 }] }
```

`GET /api/dashboard/orders` returns
`{ period, totalOrders, series: [{ date, orders, completed, cancelled }] }`.

`GET /api/dashboard/top-products?range=30d&limit=5&sortBy=units|revenue` returns
`{ period, products: [{ productId, name, category, unitsSold, revenue, ordersCount }] }`.

`GET /api/dashboard/recent-orders?limit=5` returns the latest orders, in the same shape as the orders list.

### Analytics

All analytics endpoints accept the date-range parameters.

| Endpoint | Returns |
| --- | --- |
| `GET /api/analytics/overview` | `period` plus `{ value, previousValue, changePercent }` for each of: `revenue, orders, completedOrders, averageOrderValue, unitsSold, totalCustomers, newCustomers, purchasingCustomers, revenuePerCustomer, conversionRate, sessions, visitors, retentionRate, returningCustomerRate, repeatPurchaseRate` |
| `GET /api/analytics/revenue` | `totals { revenue, completedOrders, averageOrderValue, unitsSold }`, `series [{ date, revenue, completedOrders, averageOrderValue, unitsSold }]` |
| `GET /api/analytics/orders` | `totals { orders, averageOrderValue }`, `statusBreakdown { pending, processing, completed, cancelled }`, `series [{ date, orders, completed, cancelled }]` |
| `GET /api/analytics/conversion` | `totals { sessions, visitors, completedOrders, conversionRate }`, `series [{ date, sessions, completedOrders, conversionRate }]` |
| `GET /api/analytics/customers` | `totals { totalCustomers, newCustomers, growthRate, purchasingCustomers, revenuePerCustomer }`, `series [{ date, newCustomers, totalCustomers, activeCustomers, revenuePerCustomer }]` |
| `GET /api/analytics/retention` | `retentionRate, previousPeriodCustomers, retainedCustomers, returningCustomerRate, returningCustomers, repeatPurchaseRate, repeatCustomers, purchasingCustomers, cohorts [{ cohortMonth, cohortSize, months [{ monthOffset, customers, rate }] }]` |
| `GET /api/analytics/categories` | `categories [{ categoryId, name, revenue, unitsSold, ordersCount, sharePercent }]` |
| `GET /api/analytics/products?sortBy=revenue\|units\|profit\|rating\|name&limit=50` | `products [{ productId, name, category, price, unitsSold, revenue, ordersCount, cost, grossProfit, marginPercent, reviewCount, averageRating, stockQuantity, stockStatus, stockLevel }]` |

### AI (stored records only)

This phase calls no model and generates nothing. These endpoints only read and update records already stored in `ai_insights`, `ai_actions` and `ai_analysis_runs`. When there are no records, they return empty lists.

`GET /api/ai/insights` query parameters:
- `type`, `priority`, `status` (each comma-separated)
- `includeExpired` (default `false`)
- `sortOrder`, by `generated_at`

`GET /api/ai/insights/:id` includes the insight's linked `actions`.

`PATCH /api/ai/insights/:id`:

```json
{ "status": "viewed" }
```

Allowed values: `new | viewed | dismissed | actioned`.

`GET /api/ai/actions` query parameters: `status` (comma-separated), `insightId`, `type`.

`PATCH /api/ai/actions/:id/approve` and `/reject` take no body. They only move a `pending` action to `approved` (setting `approved_at`) or `rejected`. Nothing is executed. An action that isn't pending returns `409 INVALID_ACTION_STATE`.

`GET /api/ai/analysis-runs` query parameters: `status`, `analysisType`. `GET /api/ai/analysis-runs/:id` returns one run.

### Reviews

`GET /api/reviews` query parameters:
- `productId`, `customerId`
- `rating`, `minRating`, `maxRating`
- `sentiment`: `positive, neutral, negative, unanalyzed` (comma-separated)
- `search`: matches title and text
- `sortBy`: `createdAt | rating`

`POST /api/reviews`:

```json
{ "productId": "…", "customerId": "…", "rating": 5, "title": "Great", "reviewText": "Love it", "sentiment": "positive" }
```

`sentiment` is optional and set by hand. Automatic sentiment analysis comes in a later phase.

`PATCH /api/reviews/:id` accepts `rating, title, reviewText, sentiment, customerId`. `DELETE /api/reviews/:id` deletes the review.

### Store

`GET /api/store` returns:

```json
{
  "id": "…", "name": "CommerceOS Demo Store", "slug": "commerceos-demo", "currency": "USD", "timezone": "UTC",
  "settings": { "aiInsightsEnabled": true, "lowStockDefaultThreshold": 10, "persisted": true, "updatedAt": "…" }
}
```

`PATCH /api/store` accepts `name`, `slug`, `currency` (ISO 4217) and `timezone` (IANA).

`GET /api/store/settings` returns the settings. `PATCH /api/store/settings`:

```json
{ "aiInsightsEnabled": false, "lowStockDefaultThreshold": 8 }
```

---

## Vercel deployment

Deploy the backend as its own Vercel project, separate from the frontend. Vercel detects it as an **Express** project and serves the default export of `src/app.ts` as one serverless function. No `vercel.json` is needed.

1. Import the Git repository in Vercel. The framework preset is auto-detected (Express). Leave the build and output settings at their defaults.
2. Under **Project Settings → Environment Variables**, set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (the **secret** key, not the publishable one)
   - `FRONTEND_URL=https://amd-hackathon-frontend.vercel.app` (comma-separate preview URLs if needed)
   - `AUTH_MODE`
   - `DEFAULT_STORE_ID`

   Do **not** set `NODE_ENV`. Vercel sets it to `production` at runtime on its own. Setting it yourself makes `npm install` skip dev dependencies, and the TypeScript build then fails.
3. Deploy, then check `https://<backend>.vercel.app/health`.
4. In the frontend, set its API base URL (for example `NEXT_PUBLIC_API_URL`) to the backend URL.

In production only the origins in `FRONTEND_URL` are allowed by CORS.

---

## Not in this phase

AMD AI / Copilot, AMD Cloud, ROCm, model hosting, AI prompts, AI background analysis, Vercel Cron, demand forecasting and AI workflow execution are intentionally not implemented. The `ai_conversations`, `ai_messages` and `demand_forecasts` tables are not exposed yet.
