-- ============================================================
-- CommerceOS Database Schema
-- PostgreSQL / Supabase
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";


-- ============================================================
-- STORES
-- ============================================================

create table if not exists stores (
    id uuid primary key default uuid_generate_v4(),

    name varchar(255) not null,
    slug varchar(255) not null unique,

    currency varchar(10) not null default 'USD',
    timezone varchar(100) not null default 'UTC',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- ============================================================
-- USERS
-- ============================================================

create table if not exists users (
    id uuid primary key default uuid_generate_v4(),

    email varchar(255) not null unique,
    name varchar(255),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- ============================================================
-- STORE MEMBERS
-- ============================================================

create table if not exists store_members (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,

    role varchar(50) not null default 'owner'
        check (role in ('owner', 'admin', 'manager', 'viewer')),

    created_at timestamptz not null default now(),

    unique(store_id, user_id)
);


-- ============================================================
-- STORE SETTINGS
-- ============================================================

create table if not exists store_settings (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null unique references stores(id) on delete cascade,

    ai_insights_enabled boolean not null default true,

    low_stock_default_threshold integer not null default 5
        check (low_stock_default_threshold >= 0),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- ============================================================
-- CATEGORIES
-- ============================================================

create table if not exists categories (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    name varchar(255) not null,
    slug varchar(255) not null,

    description text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique(store_id, slug)
);


-- ============================================================
-- PRODUCTS
-- ============================================================

create table if not exists products (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,
    category_id uuid references categories(id) on delete set null,

    name varchar(255) not null,
    slug varchar(255),

    description text,

    sku varchar(100),

    price numeric(12,2) not null default 0
        check (price >= 0),

    cost_price numeric(12,2)
        check (cost_price is null or cost_price >= 0),

    active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- ============================================================
-- INVENTORY
-- ============================================================

create table if not exists inventory (
    id uuid primary key default uuid_generate_v4(),

    product_id uuid not null unique references products(id) on delete cascade,

    quantity integer not null default 0
        check (quantity >= 0),

    low_stock_threshold integer not null default 5
        check (low_stock_threshold >= 0),

    updated_at timestamptz not null default now()
);


-- ============================================================
-- INVENTORY MOVEMENTS
-- ============================================================

create table if not exists inventory_movements (
    id uuid primary key default uuid_generate_v4(),

    product_id uuid not null references products(id) on delete cascade,

    type varchar(50) not null
        check (
            type in (
                'sale',
                'restock',
                'adjustment',
                'return',
                'cancellation'
            )
        ),

    quantity integer not null,

    previous_quantity integer not null
        check (previous_quantity >= 0),

    new_quantity integer not null
        check (new_quantity >= 0),

    reference_id uuid,

    note text,

    created_at timestamptz not null default now()
);


-- ============================================================
-- CUSTOMERS
-- ============================================================

create table if not exists customers (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    first_name varchar(150) not null,
    last_name varchar(150),

    email varchar(255) not null,

    phone varchar(50),

    status varchar(20) not null default 'active'
        check (status in ('active', 'inactive')),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique(store_id, email)
);


-- ============================================================
-- ORDERS
-- ============================================================

create table if not exists orders (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    customer_id uuid references customers(id) on delete set null,

    order_number varchar(100) not null,

    status varchar(30) not null default 'pending'
        check (
            status in (
                'pending',
                'processing',
                'completed',
                'cancelled'
            )
        ),

    subtotal numeric(12,2) not null default 0
        check (subtotal >= 0),

    discount numeric(12,2) not null default 0
        check (discount >= 0),

    tax numeric(12,2) not null default 0
        check (tax >= 0),

    shipping numeric(12,2) not null default 0
        check (shipping >= 0),

    total numeric(12,2) not null default 0
        check (total >= 0),

    ordered_at timestamptz not null default now(),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique(store_id, order_number)
);


-- ============================================================
-- ORDER ITEMS
-- ============================================================

create table if not exists order_items (
    id uuid primary key default uuid_generate_v4(),

    order_id uuid not null references orders(id) on delete cascade,

    product_id uuid references products(id) on delete set null,

    product_name varchar(255) not null,

    quantity integer not null
        check (quantity > 0),

    unit_price numeric(12,2) not null
        check (unit_price >= 0),

    subtotal numeric(12,2) not null
        check (subtotal >= 0),

    created_at timestamptz not null default now()
);


-- ============================================================
-- STORE TRAFFIC / VISITS
-- Used for conversion rate
-- ============================================================

create table if not exists store_visits (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    visitor_id varchar(255),

    session_id varchar(255),

    visited_at timestamptz not null default now()
);


-- ============================================================
-- PRODUCT REVIEWS
-- Useful for AI analysis
-- ============================================================

create table if not exists product_reviews (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    product_id uuid not null references products(id) on delete cascade,

    customer_id uuid references customers(id) on delete set null,

    rating integer not null
        check (rating between 1 and 5),

    title varchar(255),

    review_text text,

    sentiment varchar(30)
        check (
            sentiment is null
            or sentiment in ('positive', 'neutral', 'negative')
        ),

    created_at timestamptz not null default now()
);


-- ============================================================
-- AI INSIGHTS
-- ============================================================

create table if not exists ai_insights (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    type varchar(50) not null
        check (
            type in (
                'revenue',
                'sales',
                'inventory',
                'customer',
                'product',
                'marketing',
                'general'
            )
        ),

    priority varchar(20) not null default 'medium'
        check (
            priority in ('low', 'medium', 'high', 'critical')
        ),

    title varchar(255) not null,

    summary text not null,

    explanation text,

    recommendation text,

    data jsonb,

    status varchar(30) not null default 'new'
        check (
            status in (
                'new',
                'viewed',
                'dismissed',
                'actioned'
            )
        ),

    generated_by varchar(50) not null default 'amd_ai',

    model_name varchar(255),

    generated_at timestamptz not null default now(),

    expires_at timestamptz,

    created_at timestamptz not null default now()
);


-- ============================================================
-- AI CONVERSATIONS
-- ============================================================

create table if not exists ai_conversations (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    user_id uuid references users(id) on delete set null,

    title varchar(255),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- ============================================================
-- AI MESSAGES
-- ============================================================

create table if not exists ai_messages (
    id uuid primary key default uuid_generate_v4(),

    conversation_id uuid not null references ai_conversations(id) on delete cascade,

    role varchar(30) not null
        check (role in ('user', 'assistant', 'system')),

    content text not null,

    metadata jsonb,

    created_at timestamptz not null default now()
);


-- ============================================================
-- AI ACTIONS / WORKFLOWS
-- ============================================================

create table if not exists ai_actions (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    insight_id uuid references ai_insights(id) on delete set null,

    type varchar(100) not null,

    title varchar(255) not null,

    description text,

    status varchar(30) not null default 'pending'
        check (
            status in (
                'pending',
                'approved',
                'rejected',
                'executing',
                'completed',
                'failed',
                'cancelled'
            )
        ),

    parameters jsonb,

    result jsonb,

    error_message text,

    approved_at timestamptz,

    executed_at timestamptz,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);


-- ============================================================
-- AI ANALYSIS RUNS
-- Keeps track of background AI jobs
-- ============================================================

create table if not exists ai_analysis_runs (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    analysis_type varchar(100) not null,

    status varchar(30) not null default 'queued'
        check (
            status in (
                'queued',
                'running',
                'completed',
                'failed'
            )
        ),

    input_snapshot jsonb,

    output_summary jsonb,

    model_name varchar(255),

    started_at timestamptz,

    completed_at timestamptz,

    error_message text,

    created_at timestamptz not null default now()
);


-- ============================================================
-- DEMAND FORECASTS
-- ============================================================

create table if not exists demand_forecasts (
    id uuid primary key default uuid_generate_v4(),

    store_id uuid not null references stores(id) on delete cascade,

    product_id uuid not null references products(id) on delete cascade,

    forecast_date date not null,

    predicted_quantity numeric(12,2) not null
        check (predicted_quantity >= 0),

    lower_bound numeric(12,2),

    upper_bound numeric(12,2),

    model_name varchar(255),

    created_at timestamptz not null default now(),

    unique(product_id, forecast_date)
);


-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_store_members_store
    on store_members(store_id);

create index if not exists idx_store_members_user
    on store_members(user_id);


create index if not exists idx_categories_store
    on categories(store_id);


create index if not exists idx_products_store
    on products(store_id);

create index if not exists idx_products_category
    on products(category_id);

create index if not exists idx_products_active
    on products(store_id, active);


create index if not exists idx_inventory_product
    on inventory(product_id);


create index if not exists idx_inventory_movements_product
    on inventory_movements(product_id);

create index if not exists idx_inventory_movements_created
    on inventory_movements(created_at);


create index if not exists idx_customers_store
    on customers(store_id);

create index if not exists idx_customers_email
    on customers(email);


create index if not exists idx_orders_store
    on orders(store_id);

create index if not exists idx_orders_customer
    on orders(customer_id);

create index if not exists idx_orders_status
    on orders(store_id, status);

create index if not exists idx_orders_date
    on orders(store_id, ordered_at);


create index if not exists idx_order_items_order
    on order_items(order_id);

create index if not exists idx_order_items_product
    on order_items(product_id);


create index if not exists idx_store_visits_store
    on store_visits(store_id);

create index if not exists idx_store_visits_date
    on store_visits(store_id, visited_at);


create index if not exists idx_reviews_store
    on product_reviews(store_id);

create index if not exists idx_reviews_product
    on product_reviews(product_id);

create index if not exists idx_reviews_sentiment
    on product_reviews(product_id, sentiment);


create index if not exists idx_ai_insights_store
    on ai_insights(store_id);

create index if not exists idx_ai_insights_status
    on ai_insights(store_id, status);

create index if not exists idx_ai_insights_generated
    on ai_insights(store_id, generated_at desc);


create index if not exists idx_ai_conversations_store
    on ai_conversations(store_id);

create index if not exists idx_ai_messages_conversation
    on ai_messages(conversation_id, created_at);


create index if not exists idx_ai_actions_store
    on ai_actions(store_id);

create index if not exists idx_ai_actions_status
    on ai_actions(store_id, status);


create index if not exists idx_ai_analysis_runs_store
    on ai_analysis_runs(store_id);

create index if not exists idx_ai_analysis_runs_status
    on ai_analysis_runs(store_id, status);


create index if not exists idx_forecasts_product
    on demand_forecasts(product_id, forecast_date);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


drop trigger if exists update_stores_updated_at on stores;

create trigger update_stores_updated_at
before update on stores
for each row
execute function update_updated_at_column();


drop trigger if exists update_store_settings_updated_at on store_settings;

create trigger update_store_settings_updated_at
before update on store_settings
for each row
execute function update_updated_at_column();


drop trigger if exists update_categories_updated_at on categories;

create trigger update_categories_updated_at
before update on categories
for each row
execute function update_updated_at_column();


drop trigger if exists update_products_updated_at on products;

create trigger update_products_updated_at
before update on products
for each row
execute function update_updated_at_column();


drop trigger if exists update_inventory_updated_at on inventory;

create trigger update_inventory_updated_at
before update on inventory
for each row
execute function update_updated_at_column();


drop trigger if exists update_customers_updated_at on customers;

create trigger update_customers_updated_at
before update on customers
for each row
execute function update_updated_at_column();


drop trigger if exists update_orders_updated_at on orders;

create trigger update_orders_updated_at
before update on orders
for each row
execute function update_updated_at_column();


drop trigger if exists update_ai_conversations_updated_at on ai_conversations;

create trigger update_ai_conversations_updated_at
before update on ai_conversations
for each row
execute function update_updated_at_column();


drop trigger if exists update_ai_actions_updated_at on ai_actions;

create trigger update_ai_actions_updated_at
before update on ai_actions
for each row
execute function update_updated_at_column();


-- ============================================================
-- END OF SCHEMA
-- ============================================================