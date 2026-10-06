-- ============================================================
-- CommerceOS API layer (views + functions)
--
-- Run AFTER schema.sql. This file is purely additive: it does not
-- create, alter or drop any table, column or constraint. It adds:
--
--   * read views that compute derived values (orders count, total spent,
--     units sold, stock status) so they are never stored as duplicates
--   * transactional functions for multi-table writes (orders, inventory,
--     product creation), because supabase-js cannot run a multi-statement
--     transaction from Node
--   * aggregation functions for the dashboard and analytics, so SUM / COUNT /
--     GROUP BY run inside PostgreSQL
--
-- Everything here can be re-run safely (create or replace).
--
-- Conventions
--   * Revenue           = sum(orders.total) of orders with status 'completed'
--   * Orders            = orders whose status is not 'cancelled'
--   * Units sold        = sum(order_items.quantity) of completed orders
--   * Product revenue   = sum(order_items.subtotal) of completed orders
--   * inventory_movements.quantity is a signed delta (sale = negative)
--   * Domain errors are raised with SQLSTATE P0001 and the machine-readable
--     error code in HINT, which the backend turns into an HTTP error.
-- ============================================================


-- ============================================================
-- HELPERS
-- ============================================================

create or replace function store_timezone(p_store_id uuid)
returns text
language sql
stable
as $$
    select coalesce((select timezone from stores where id = p_store_id), 'UTC');
$$;

create or replace function store_low_stock_default(p_store_id uuid)
returns integer
language sql
stable
as $$
    select coalesce(
        (select low_stock_default_threshold from store_settings where store_id = p_store_id),
        5
    );
$$;


-- ============================================================
-- VIEWS
-- security_invoker = true: views respect the caller's privileges / RLS,
-- so they never widen access beyond the underlying tables.
-- ============================================================

create or replace view v_customer_stats
with (security_invoker = true)
as
select
    c.id,
    c.store_id,
    c.first_name,
    c.last_name,
    trim(c.first_name || ' ' || coalesce(c.last_name, '')) as full_name,
    c.email,
    c.phone,
    c.status,
    c.created_at,
    c.updated_at,
    coalesce(s.orders_count, 0)::bigint           as orders_count,
    coalesce(s.completed_orders_count, 0)::bigint as completed_orders_count,
    coalesce(s.total_spent, 0)::numeric(12,2)     as total_spent,
    s.first_order_at,
    s.last_order_at
from customers c
left join lateral (
    select
        count(*) filter (where o.status <> 'cancelled')          as orders_count,
        count(*) filter (where o.status = 'completed')           as completed_orders_count,
        sum(o.total) filter (where o.status = 'completed')       as total_spent,
        min(o.ordered_at) filter (where o.status <> 'cancelled') as first_order_at,
        max(o.ordered_at) filter (where o.status <> 'cancelled') as last_order_at
    from orders o
    where o.customer_id = c.id
) s on true;


create or replace view v_product_stats
with (security_invoker = true)
as
select
    p.id,
    p.store_id,
    p.category_id,
    c.name as category_name,
    c.slug as category_slug,
    p.name,
    p.slug,
    p.description,
    p.sku,
    p.price,
    p.cost_price,
    p.active,
    p.created_at,
    p.updated_at,
    i.id as inventory_id,
    coalesce(i.quantity, 0) as quantity,
    coalesce(i.low_stock_threshold, ss.low_stock_default_threshold, 5) as low_stock_threshold,
    i.updated_at as inventory_updated_at,
    case
        when coalesce(i.quantity, 0) = 0 then 'out_of_stock'
        when coalesce(i.quantity, 0)
             <= coalesce(i.low_stock_threshold, ss.low_stock_default_threshold, 5) then 'low_stock'
        else 'in_stock'
    end as stock_status,
    coalesce(sales.units_sold, 0)::bigint          as units_sold,
    coalesce(sales.revenue, 0)::numeric(12,2)      as revenue,
    coalesce(rv.review_count, 0)::bigint           as review_count,
    rv.average_rating
from products p
left join categories c      on c.id = p.category_id
left join inventory i       on i.product_id = p.id
left join store_settings ss on ss.store_id = p.store_id
left join lateral (
    select
        sum(oi.quantity) as units_sold,
        sum(oi.subtotal) as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.product_id = p.id
      and o.status = 'completed'
) sales on true
left join lateral (
    select
        count(*)                       as review_count,
        round(avg(r.rating)::numeric, 2) as average_rating
    from product_reviews r
    where r.product_id = p.id
) rv on true;


create or replace view v_order_list
with (security_invoker = true)
as
select
    o.id,
    o.store_id,
    o.customer_id,
    o.order_number,
    o.status,
    o.subtotal,
    o.discount,
    o.tax,
    o.shipping,
    o.total,
    o.ordered_at,
    o.created_at,
    o.updated_at,
    cu.first_name as customer_first_name,
    cu.last_name  as customer_last_name,
    case when cu.id is null then null
         else trim(cu.first_name || ' ' || coalesce(cu.last_name, '')) end as customer_name,
    cu.email      as customer_email,
    coalesce(it.items_count, 0)::bigint as items_count,
    coalesce(it.units_count, 0)::bigint as units_count
from orders o
left join customers cu on cu.id = o.customer_id
left join lateral (
    select count(*) as items_count, sum(oi.quantity) as units_count
    from order_items oi
    where oi.order_id = o.id
) it on true;


create or replace view v_inventory_movements
with (security_invoker = true)
as
select
    m.id,
    p.store_id,
    m.product_id,
    p.name as product_name,
    p.sku  as product_sku,
    m.type,
    m.quantity,
    m.previous_quantity,
    m.new_quantity,
    m.reference_id,
    m.note,
    m.created_at
from inventory_movements m
join products p on p.id = m.product_id;


-- ============================================================
-- TRANSACTIONAL WRITES
-- A PostgreSQL function runs inside a single transaction: any raised
-- exception rolls back every write made by the function.
-- ============================================================

-- ------------------------------------------------------------
-- Create a product together with its inventory row (and an initial
-- 'restock' movement when it starts with stock).
-- ------------------------------------------------------------
create or replace function create_product_with_inventory(
    p_store_id            uuid,
    p_name                text,
    p_price               numeric,
    p_category_id         uuid    default null,
    p_slug                text    default null,
    p_description         text    default null,
    p_sku                 text    default null,
    p_cost_price          numeric default null,
    p_active              boolean default true,
    p_initial_quantity    integer default 0,
    p_low_stock_threshold integer default null
)
returns uuid
language plpgsql
as $$
declare
    v_product_id uuid;
    v_quantity   integer := coalesce(p_initial_quantity, 0);
begin
    if v_quantity < 0 then
        raise exception using errcode = 'P0001',
            message = 'Initial quantity cannot be negative',
            hint = 'NEGATIVE_INVENTORY';
    end if;

    if p_category_id is not null and not exists (
        select 1 from categories where id = p_category_id and store_id = p_store_id
    ) then
        raise exception using errcode = 'P0001',
            message = 'Category not found',
            hint = 'CATEGORY_NOT_FOUND';
    end if;

    insert into products (store_id, category_id, name, slug, description, sku, price, cost_price, active)
    values (p_store_id, p_category_id, p_name, p_slug, p_description, p_sku, p_price, p_cost_price, coalesce(p_active, true))
    returning id into v_product_id;

    insert into inventory (product_id, quantity, low_stock_threshold)
    values (v_product_id, v_quantity, coalesce(p_low_stock_threshold, store_low_stock_default(p_store_id)));

    if v_quantity > 0 then
        insert into inventory_movements (product_id, type, quantity, previous_quantity, new_quantity, note)
        values (v_product_id, 'restock', v_quantity, 0, v_quantity, 'Initial stock');
    end if;

    return v_product_id;
end;
$$;


-- ------------------------------------------------------------
-- Restock / adjust / return stock for one product.
-- Either p_quantity_change (signed delta) or p_new_quantity (absolute)
-- must be supplied. Negative resulting stock is rejected.
-- Returns a JSON summary of the change.
-- ------------------------------------------------------------
create or replace function apply_inventory_change(
    p_store_id        uuid,
    p_product_id      uuid,
    p_type            text,
    p_quantity_change integer default null,
    p_new_quantity    integer default null,
    p_note            text    default null
)
returns json
language plpgsql
as $$
declare
    v_inventory   inventory%rowtype;
    v_new         integer;
    v_delta       integer;
    v_movement_id uuid;
begin
    if p_type not in ('restock', 'adjustment', 'return') then
        raise exception using errcode = 'P0001',
            message = 'Invalid inventory movement type: ' || coalesce(p_type, 'null'),
            hint = 'INVALID_MOVEMENT_TYPE';
    end if;

    if (p_quantity_change is null) = (p_new_quantity is null) then
        raise exception using errcode = 'P0001',
            message = 'Provide exactly one of quantity change or new quantity',
            hint = 'INVALID_INVENTORY_CHANGE';
    end if;

    if not exists (select 1 from products where id = p_product_id and store_id = p_store_id) then
        raise exception using errcode = 'P0001',
            message = 'Product not found',
            hint = 'PRODUCT_NOT_FOUND';
    end if;

    insert into inventory (product_id, quantity, low_stock_threshold)
    values (p_product_id, 0, store_low_stock_default(p_store_id))
    on conflict (product_id) do nothing;

    select * into v_inventory from inventory where product_id = p_product_id for update;

    v_new := coalesce(p_new_quantity, v_inventory.quantity + p_quantity_change);
    v_delta := v_new - v_inventory.quantity;

    if v_new < 0 then
        raise exception using errcode = 'P0001',
            message = format('Change would make inventory negative (current %s, requested change %s)',
                             v_inventory.quantity, v_delta),
            hint = 'NEGATIVE_INVENTORY';
    end if;

    if p_type in ('restock', 'return') and v_delta <= 0 then
        raise exception using errcode = 'P0001',
            message = initcap(p_type) || ' quantity must be greater than zero',
            hint = 'INVALID_INVENTORY_CHANGE';
    end if;

    if v_delta = 0 then
        raise exception using errcode = 'P0001',
            message = 'Adjustment does not change the quantity',
            hint = 'INVALID_INVENTORY_CHANGE';
    end if;

    update inventory set quantity = v_new where id = v_inventory.id;

    insert into inventory_movements (product_id, type, quantity, previous_quantity, new_quantity, note)
    values (p_product_id, p_type, v_delta, v_inventory.quantity, v_new, p_note)
    returning id into v_movement_id;

    return json_build_object(
        'movement_id',       v_movement_id,
        'product_id',        p_product_id,
        'type',              p_type,
        'quantity_change',   v_delta,
        'previous_quantity', v_inventory.quantity,
        'new_quantity',      v_new
    );
end;
$$;


-- ------------------------------------------------------------
-- Create an order with its items, decrement inventory and record
-- 'sale' movements, all in one transaction.
--
-- p_items: [{ "product_id": uuid, "quantity": int, "unit_price"?: numeric }]
-- When unit_price is omitted the product's current price is used. The
-- product name and unit price are copied into order_items so historical
-- orders are unaffected by later product changes.
-- ------------------------------------------------------------
create or replace function create_order_with_items(
    p_store_id     uuid,
    p_items        jsonb,
    p_customer_id  uuid        default null,
    p_status       text        default 'pending',
    p_order_number text        default null,
    p_discount     numeric     default 0,
    p_tax          numeric     default 0,
    p_shipping     numeric     default 0,
    p_ordered_at   timestamptz default null
)
returns uuid
language plpgsql
as $$
declare
    v_order_id     uuid := uuid_generate_v4();
    v_order_number text := nullif(trim(p_order_number), '');
    v_subtotal     numeric(12,2) := 0;
    v_total        numeric(12,2);
    v_item         record;
    v_product      record;
    v_available    integer;
    v_unit_price   numeric(12,2);
    v_line         numeric(12,2);
begin
    if coalesce(p_status, 'pending') not in ('pending', 'processing', 'completed') then
        raise exception using errcode = 'P0001',
            message = 'New orders must be pending, processing or completed',
            hint = 'INVALID_ORDER_STATUS';
    end if;

    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception using errcode = 'P0001',
            message = 'An order needs at least one item',
            hint = 'ORDER_ITEMS_REQUIRED';
    end if;

    if p_customer_id is not null and not exists (
        select 1 from customers where id = p_customer_id and store_id = p_store_id
    ) then
        raise exception using errcode = 'P0001',
            message = 'Customer not found',
            hint = 'CUSTOMER_NOT_FOUND';
    end if;

    -- Serialise order-number generation per store.
    perform pg_advisory_xact_lock(hashtext('commerceos:orders:' || p_store_id::text));

    if v_order_number is null then
        select 'ORD-' || (coalesce(max((substring(order_number from '^ORD-([0-9]{1,15})$'))::bigint), 100000) + 1)
        into v_order_number
        from orders
        where store_id = p_store_id;
    elsif exists (select 1 from orders where store_id = p_store_id and order_number = v_order_number) then
        raise exception using errcode = 'P0001',
            message = 'Order number already exists: ' || v_order_number,
            hint = 'ORDER_NUMBER_EXISTS';
    end if;

    -- Lock every affected inventory row up-front in a stable order to avoid
    -- deadlocks between concurrent orders. Products without an inventory
    -- row get one with zero stock (and will then fail the stock check).
    insert into inventory (product_id, quantity, low_stock_threshold)
    select p.id, 0, store_low_stock_default(p_store_id)
    from products p
    where p.store_id = p_store_id
      and p.id in (select (e->>'product_id')::uuid from jsonb_array_elements(p_items) e)
    on conflict (product_id) do nothing;

    perform 1
    from inventory
    where product_id in (select (e->>'product_id')::uuid from jsonb_array_elements(p_items) e)
    order by product_id
    for update;

    insert into orders (id, store_id, customer_id, order_number, status, subtotal, discount, tax, shipping, total, ordered_at)
    values (
        v_order_id, p_store_id, p_customer_id, v_order_number, coalesce(p_status, 'pending'),
        0, coalesce(p_discount, 0), coalesce(p_tax, 0), coalesce(p_shipping, 0), 0,
        coalesce(p_ordered_at, now())
    );

    for v_item in
        select
            (e->>'product_id')::uuid             as product_id,
            (e->>'quantity')::integer            as quantity,
            nullif(e->>'unit_price', '')::numeric as unit_price
        from jsonb_array_elements(p_items) with ordinality as t(e, ord)
        order by ord
    loop
        if v_item.product_id is null then
            raise exception using errcode = 'P0001',
                message = 'Every order item needs a product_id',
                hint = 'INVALID_ORDER_ITEM';
        end if;

        if v_item.quantity is null or v_item.quantity <= 0 then
            raise exception using errcode = 'P0001',
                message = 'Item quantity must be a positive integer',
                hint = 'INVALID_QUANTITY';
        end if;

        select id, name, price, active into v_product
        from products
        where id = v_item.product_id and store_id = p_store_id;

        if not found then
            raise exception using errcode = 'P0001',
                message = 'Product not found: ' || v_item.product_id,
                hint = 'PRODUCT_NOT_FOUND';
        end if;

        if not v_product.active then
            raise exception using errcode = 'P0001',
                message = 'Product is not active: ' || v_product.name,
                hint = 'PRODUCT_INACTIVE';
        end if;

        v_unit_price := coalesce(v_item.unit_price, v_product.price);

        if v_unit_price < 0 then
            raise exception using errcode = 'P0001',
                message = 'Unit price cannot be negative',
                hint = 'INVALID_PRICE';
        end if;

        v_line := round(v_unit_price * v_item.quantity, 2);

        select quantity into v_available from inventory where product_id = v_product.id;

        if v_available < v_item.quantity then
            raise exception using errcode = 'P0001',
                message = format('Insufficient stock for %s (available %s, requested %s)',
                                 v_product.name, v_available, v_item.quantity),
                hint = 'INSUFFICIENT_STOCK';
        end if;

        update inventory set quantity = quantity - v_item.quantity where product_id = v_product.id;

        insert into inventory_movements (product_id, type, quantity, previous_quantity, new_quantity, reference_id, note)
        values (v_product.id, 'sale', -v_item.quantity, v_available, v_available - v_item.quantity,
                v_order_id, 'Order ' || v_order_number);

        insert into order_items (order_id, product_id, product_name, quantity, unit_price, subtotal)
        values (v_order_id, v_product.id, v_product.name, v_item.quantity, v_unit_price, v_line);

        v_subtotal := v_subtotal + v_line;
    end loop;

    v_total := v_subtotal - coalesce(p_discount, 0) + coalesce(p_tax, 0) + coalesce(p_shipping, 0);

    if v_total < 0 then
        raise exception using errcode = 'P0001',
            message = 'Discount cannot exceed the order subtotal plus tax and shipping',
            hint = 'INVALID_DISCOUNT';
    end if;

    update orders set subtotal = v_subtotal, total = v_total where id = v_order_id;

    return v_order_id;
end;
$$;


-- ------------------------------------------------------------
-- Update an order's status and/or customer.
--
-- Allowed transitions:
--   pending    -> processing | completed | cancelled
--   processing -> completed | cancelled
--   completed  -> cancelled   (stock returned as a 'return' movement)
--   cancelled  -> (final)
-- Cancelling puts the ordered quantities back into inventory.
-- ------------------------------------------------------------
create or replace function update_order(
    p_store_id        uuid,
    p_order_id        uuid,
    p_status          text    default null,
    p_customer_id     uuid    default null,
    p_update_customer boolean default false
)
returns uuid
language plpgsql
as $$
declare
    v_order    orders%rowtype;
    v_item     record;
    v_previous integer;
    v_type     text;
begin
    select * into v_order from orders
    where id = p_order_id and store_id = p_store_id
    for update;

    if not found then
        raise exception using errcode = 'P0001',
            message = 'Order not found',
            hint = 'ORDER_NOT_FOUND';
    end if;

    if p_update_customer then
        if p_customer_id is not null and not exists (
            select 1 from customers where id = p_customer_id and store_id = p_store_id
        ) then
            raise exception using errcode = 'P0001',
                message = 'Customer not found',
                hint = 'CUSTOMER_NOT_FOUND';
        end if;

        update orders set customer_id = p_customer_id where id = p_order_id;
    end if;

    if p_status is not null and p_status <> v_order.status then
        if p_status not in ('pending', 'processing', 'completed', 'cancelled') then
            raise exception using errcode = 'P0001',
                message = 'Invalid order status: ' || p_status,
                hint = 'INVALID_ORDER_STATUS';
        end if;

        if v_order.status = 'cancelled'
           or (v_order.status = 'processing' and p_status = 'pending')
           or (v_order.status = 'completed' and p_status in ('pending', 'processing')) then
            raise exception using errcode = 'P0001',
                message = format('Cannot change order status from %s to %s', v_order.status, p_status),
                hint = 'INVALID_STATUS_TRANSITION';
        end if;

        if p_status = 'cancelled' then
            v_type := case when v_order.status = 'completed' then 'return' else 'cancellation' end;

            for v_item in
                select oi.product_id, sum(oi.quantity)::integer as quantity
                from order_items oi
                join products p on p.id = oi.product_id and p.store_id = p_store_id
                where oi.order_id = p_order_id
                group by oi.product_id
                order by oi.product_id
            loop
                insert into inventory (product_id, quantity, low_stock_threshold)
                values (v_item.product_id, 0, store_low_stock_default(p_store_id))
                on conflict (product_id) do nothing;

                select quantity into v_previous from inventory
                where product_id = v_item.product_id
                for update;

                update inventory set quantity = quantity + v_item.quantity
                where product_id = v_item.product_id;

                insert into inventory_movements (product_id, type, quantity, previous_quantity, new_quantity, reference_id, note)
                values (v_item.product_id, v_type, v_item.quantity, v_previous, v_previous + v_item.quantity,
                        p_order_id, 'Order ' || v_order.order_number || ' cancelled');
            end loop;
        end if;

        update orders set status = p_status where id = p_order_id;
    end if;

    return p_order_id;
end;
$$;


-- ============================================================
-- ANALYTICS / DASHBOARD
-- All periods are half-open: [p_from, p_to).
-- Time buckets are computed in the store's timezone.
-- ============================================================

-- ------------------------------------------------------------
-- Headline metrics for one period.
--   conversion_rate          = completed orders / distinct sessions * 100
--                              (session key = coalesce(session_id, visitor_id, visit id))
--   revenue_per_customer     = revenue / distinct customers with a completed order
--   retention_rate           = % of customers who bought in the previous
--                              equal-length period and bought again in this one
--   returning_customer_rate  = % of this period's buyers who had bought
--                              before the period started
--   repeat_purchase_rate     = % of this period's buyers with 2+ completed orders
-- ------------------------------------------------------------
create or replace function period_metrics(
    p_store_id uuid,
    p_from     timestamptz,
    p_to       timestamptz
)
returns json
language sql
stable
as $$
    with
    period_orders as (
        select id, customer_id, status, total
        from orders
        where store_id = p_store_id
          and ordered_at >= p_from
          and ordered_at <  p_to
    ),
    order_stats as (
        select
            coalesce(sum(total) filter (where status = 'completed'), 0) as revenue,
            count(*) filter (where status <> 'cancelled')               as orders,
            count(*) filter (where status = 'completed')                as completed_orders,
            count(*) filter (where status = 'pending')                  as pending_orders,
            count(*) filter (where status = 'processing')               as processing_orders,
            count(*) filter (where status = 'cancelled')                as cancelled_orders
        from period_orders
    ),
    units as (
        select coalesce(sum(oi.quantity), 0) as units_sold
        from order_items oi
        join period_orders po on po.id = oi.order_id
        where po.status = 'completed'
    ),
    buyers as (
        select customer_id, count(*) as completed_orders
        from period_orders
        where status = 'completed' and customer_id is not null
        group by customer_id
    ),
    previous_buyers as (
        select distinct customer_id
        from orders
        where store_id = p_store_id
          and status = 'completed'
          and customer_id is not null
          and ordered_at >= p_from - (p_to - p_from)
          and ordered_at <  p_from
    ),
    buyer_stats as (
        select
            (select count(*) from buyers)                                as purchasing_customers,
            (select count(*) from buyers where completed_orders >= 2)    as repeat_customers,
            (select count(*) from buyers b where exists (
                select 1 from orders o
                where o.customer_id = b.customer_id
                  and o.store_id = p_store_id
                  and o.status = 'completed'
                  and o.ordered_at < p_from))                            as returning_customers,
            (select count(*) from previous_buyers)                       as previous_period_customers,
            (select count(*) from previous_buyers pb
                where pb.customer_id in (select customer_id from buyers)) as retained_customers
    ),
    customer_stats as (
        select
            count(*) filter (where created_at < p_to)                         as total_customers,
            count(*) filter (where created_at >= p_from and created_at < p_to) as new_customers
        from customers
        where store_id = p_store_id
    ),
    traffic as (
        select
            count(distinct coalesce(session_id, visitor_id, id::text)) as sessions,
            count(distinct coalesce(visitor_id, session_id, id::text)) as visitors
        from store_visits
        where store_id = p_store_id
          and visited_at >= p_from
          and visited_at <  p_to
    )
    select json_build_object(
        'revenue',                   os.revenue,
        'orders',                    os.orders,
        'completed_orders',          os.completed_orders,
        'pending_orders',            os.pending_orders,
        'processing_orders',         os.processing_orders,
        'cancelled_orders',          os.cancelled_orders,
        'units_sold',                u.units_sold,
        'average_order_value',       case when os.completed_orders > 0
                                          then round(os.revenue / os.completed_orders, 2) else 0 end,
        'total_customers',           cs.total_customers,
        'new_customers',             cs.new_customers,
        'purchasing_customers',      bs.purchasing_customers,
        'revenue_per_customer',      case when bs.purchasing_customers > 0
                                          then round(os.revenue / bs.purchasing_customers, 2) else 0 end,
        'returning_customers',       bs.returning_customers,
        'returning_customer_rate',   case when bs.purchasing_customers > 0
                                          then round(100.0 * bs.returning_customers / bs.purchasing_customers, 2) else 0 end,
        'repeat_customers',          bs.repeat_customers,
        'repeat_purchase_rate',      case when bs.purchasing_customers > 0
                                          then round(100.0 * bs.repeat_customers / bs.purchasing_customers, 2) else 0 end,
        'previous_period_customers', bs.previous_period_customers,
        'retained_customers',        bs.retained_customers,
        'retention_rate',            case when bs.previous_period_customers > 0
                                          then round(100.0 * bs.retained_customers / bs.previous_period_customers, 2) else null end,
        'sessions',                  t.sessions,
        'visitors',                  t.visitors,
        'conversion_rate',           case when t.sessions > 0
                                          then round(100.0 * os.completed_orders / t.sessions, 2) else null end
    )
    from order_stats os, units u, buyer_stats bs, customer_stats cs, traffic t;
$$;


-- ------------------------------------------------------------
-- Revenue / orders over time, one row per bucket (gaps filled with 0).
-- p_interval: 'day' | 'week' | 'month'
-- ------------------------------------------------------------
create or replace function sales_timeseries(
    p_store_id uuid,
    p_from     timestamptz,
    p_to       timestamptz,
    p_interval text default 'day'
)
returns table (
    bucket              date,
    revenue             numeric,
    orders              bigint,
    completed_orders    bigint,
    cancelled_orders    bigint,
    units_sold          bigint,
    average_order_value numeric,
    sessions            bigint,
    conversion_rate     numeric
)
language sql
stable
as $$
    with
    tz as (select store_timezone(p_store_id) as name),
    buckets as (
        select gs::date as bucket
        from tz, generate_series(
            date_trunc(p_interval, p_from at time zone tz.name),
            date_trunc(p_interval, (p_to - interval '1 microsecond') at time zone tz.name),
            ('1 ' || p_interval)::interval
        ) gs
    ),
    o as (
        select
            date_trunc(p_interval, ordered_at at time zone tz.name)::date as bucket,
            status, total
        from orders, tz
        where store_id = p_store_id and ordered_at >= p_from and ordered_at < p_to
    ),
    agg as (
        select
            bucket,
            coalesce(sum(total) filter (where status = 'completed'), 0) as revenue,
            count(*) filter (where status <> 'cancelled')               as orders,
            count(*) filter (where status = 'completed')                as completed_orders,
            count(*) filter (where status = 'cancelled')                as cancelled_orders
        from o
        group by bucket
    ),
    u as (
        select
            date_trunc(p_interval, od.ordered_at at time zone tz.name)::date as bucket,
            sum(oi.quantity) as units_sold
        from order_items oi
        join orders od on od.id = oi.order_id, tz
        where od.store_id = p_store_id and od.status = 'completed'
          and od.ordered_at >= p_from and od.ordered_at < p_to
        group by 1
    ),
    v as (
        select
            date_trunc(p_interval, visited_at at time zone tz.name)::date as bucket,
            count(distinct coalesce(session_id, visitor_id, id::text)) as sessions
        from store_visits, tz
        where store_id = p_store_id and visited_at >= p_from and visited_at < p_to
        group by 1
    )
    select
        b.bucket,
        coalesce(a.revenue, 0)::numeric,
        coalesce(a.orders, 0)::bigint,
        coalesce(a.completed_orders, 0)::bigint,
        coalesce(a.cancelled_orders, 0)::bigint,
        coalesce(u.units_sold, 0)::bigint,
        case when coalesce(a.completed_orders, 0) > 0
             then round(a.revenue / a.completed_orders, 2) else 0 end::numeric,
        coalesce(v.sessions, 0)::bigint,
        case when coalesce(v.sessions, 0) > 0
             then round(100.0 * coalesce(a.completed_orders, 0) / v.sessions, 2) else null end::numeric
    from buckets b
    left join agg a on a.bucket = b.bucket
    left join u     on u.bucket = b.bucket
    left join v     on v.bucket = b.bucket
    order by b.bucket;
$$;


-- ------------------------------------------------------------
-- Best-selling products in a period (completed orders only).
-- p_sort_by: 'units' | 'revenue'
-- ------------------------------------------------------------
create or replace function top_selling_products(
    p_store_id uuid,
    p_from     timestamptz,
    p_to       timestamptz,
    p_limit    integer default 5,
    p_sort_by  text    default 'units'
)
returns table (
    product_id    uuid,
    product_name  text,
    category_id   uuid,
    category_name text,
    units_sold    bigint,
    revenue       numeric,
    orders_count  bigint
)
language sql
stable
as $$
    select
        oi.product_id,
        coalesce(max(p.name), max(oi.product_name))::text,
        max(p.category_id::text)::uuid,
        max(c.name)::text,
        sum(oi.quantity)::bigint,
        sum(oi.subtotal)::numeric,
        count(distinct o.id)::bigint
    from order_items oi
    join orders o      on o.id = oi.order_id
    left join products p   on p.id = oi.product_id
    left join categories c on c.id = p.category_id
    where o.store_id = p_store_id
      and o.status = 'completed'
      and o.ordered_at >= p_from
      and o.ordered_at <  p_to
    group by oi.product_id, case when oi.product_id is null then oi.product_name end
    order by
        case when p_sort_by = 'revenue' then sum(oi.subtotal) else sum(oi.quantity) end desc,
        2 asc
    limit greatest(coalesce(p_limit, 5), 1);
$$;


-- ------------------------------------------------------------
-- Customer growth per bucket.
--   new_customers    = customers created in the bucket
--   total_customers  = cumulative customers at the end of the bucket
--   active_customers = distinct customers with a completed order in the bucket
-- ------------------------------------------------------------
create or replace function customer_growth_series(
    p_store_id uuid,
    p_from     timestamptz,
    p_to       timestamptz,
    p_interval text default 'day'
)
returns table (
    bucket               date,
    new_customers        bigint,
    total_customers      bigint,
    active_customers     bigint,
    revenue              numeric,
    revenue_per_customer numeric
)
language sql
stable
as $$
    with
    tz as (select store_timezone(p_store_id) as name),
    buckets as (
        select gs::date as bucket
        from tz, generate_series(
            date_trunc(p_interval, p_from at time zone tz.name),
            date_trunc(p_interval, (p_to - interval '1 microsecond') at time zone tz.name),
            ('1 ' || p_interval)::interval
        ) gs
    ),
    base as (
        select count(*) as n from customers
        where store_id = p_store_id and created_at < p_from
    ),
    nc as (
        select date_trunc(p_interval, created_at at time zone tz.name)::date as bucket, count(*) as n
        from customers, tz
        where store_id = p_store_id and created_at >= p_from and created_at < p_to
        group by 1
    ),
    ac as (
        select
            date_trunc(p_interval, ordered_at at time zone tz.name)::date as bucket,
            count(distinct customer_id) as active,
            sum(total) as revenue
        from orders, tz
        where store_id = p_store_id and status = 'completed'
          and ordered_at >= p_from and ordered_at < p_to
        group by 1
    )
    select
        b.bucket,
        coalesce(nc.n, 0)::bigint,
        ((select n from base) + sum(coalesce(nc.n, 0)) over (order by b.bucket))::bigint,
        coalesce(ac.active, 0)::bigint,
        coalesce(ac.revenue, 0)::numeric,
        case when coalesce(ac.active, 0) > 0 then round(ac.revenue / ac.active, 2) else 0 end::numeric
    from buckets b
    left join nc on nc.bucket = b.bucket
    left join ac on ac.bucket = b.bucket
    order by b.bucket;
$$;


-- ------------------------------------------------------------
-- Monthly retention cohorts.
-- A customer's cohort is the month of their first-ever completed order.
-- Only cohorts whose first month falls in [p_from, p_to) are returned.
-- Each row: how many of the cohort bought again N months later.
-- ------------------------------------------------------------
create or replace function retention_cohorts(
    p_store_id uuid,
    p_from     timestamptz,
    p_to       timestamptz
)
returns table (
    cohort_month     date,
    cohort_size      bigint,
    month_offset     integer,
    active_customers bigint
)
language sql
stable
as $$
    with
    tz as (select store_timezone(p_store_id) as name),
    activity as (
        select distinct
            o.customer_id,
            date_trunc('month', o.ordered_at at time zone tz.name)::date as month
        from orders o, tz
        where o.store_id = p_store_id
          and o.status = 'completed'
          and o.customer_id is not null
          and o.ordered_at < p_to
    ),
    first_month as (
        select customer_id, min(month) as cohort_month
        from activity
        group by customer_id
    ),
    cohorts as (
        select fm.*
        from first_month fm, tz
        where fm.cohort_month >= date_trunc('month', p_from at time zone tz.name)::date
    ),
    sizes as (
        select cohort_month, count(*) as cohort_size from cohorts group by cohort_month
    )
    select
        c.cohort_month,
        s.cohort_size::bigint,
        ((extract(year from a.month) - extract(year from c.cohort_month)) * 12
          + (extract(month from a.month) - extract(month from c.cohort_month)))::integer as month_offset,
        count(distinct a.customer_id)::bigint
    from cohorts c
    join activity a on a.customer_id = c.customer_id
    join sizes s    on s.cohort_month = c.cohort_month
    group by c.cohort_month, s.cohort_size, 3
    order by c.cohort_month, 3;
$$;


-- ------------------------------------------------------------
-- Revenue by category (completed orders, item subtotals).
-- Products without a category are grouped as "Uncategorized".
-- ------------------------------------------------------------
create or replace function category_revenue(
    p_store_id uuid,
    p_from     timestamptz,
    p_to       timestamptz
)
returns table (
    category_id   uuid,
    category_name text,
    revenue       numeric,
    units_sold    bigint,
    orders_count  bigint,
    share         numeric
)
language sql
stable
as $$
    with sales as (
        select
            c.id as category_id,
            coalesce(c.name, 'Uncategorized')::text as category_name,
            sum(oi.subtotal) as revenue,
            sum(oi.quantity) as units_sold,
            count(distinct o.id) as orders_count
        from order_items oi
        join orders o          on o.id = oi.order_id
        left join products p   on p.id = oi.product_id
        left join categories c on c.id = p.category_id
        where o.store_id = p_store_id
          and o.status = 'completed'
          and o.ordered_at >= p_from
          and o.ordered_at <  p_to
        group by c.id, c.name
    )
    select
        category_id,
        category_name,
        revenue::numeric,
        units_sold::bigint,
        orders_count::bigint,
        case when sum(revenue) over () > 0
             then round(100.0 * revenue / sum(revenue) over (), 2) else 0 end::numeric
    from sales
    order by revenue desc;
$$;


-- ------------------------------------------------------------
-- Per-product performance in a period (all of the store's products,
-- including those with no sales).
-- p_sort_by: 'revenue' | 'units' | 'profit' | 'rating' | 'name'
-- ------------------------------------------------------------
create or replace function product_performance(
    p_store_id uuid,
    p_from     timestamptz,
    p_to       timestamptz,
    p_sort_by  text    default 'revenue',
    p_limit    integer default 50
)
returns table (
    product_id     uuid,
    product_name   text,
    category_id    uuid,
    category_name  text,
    price          numeric,
    units_sold     bigint,
    revenue        numeric,
    orders_count   bigint,
    cost           numeric,
    gross_profit   numeric,
    margin         numeric,
    review_count   bigint,
    average_rating numeric,
    quantity       integer,
    stock_status   text
)
language sql
stable
as $$
    with sales as (
        select
            oi.product_id,
            sum(oi.quantity)     as units_sold,
            sum(oi.subtotal)     as revenue,
            count(distinct o.id) as orders_count
        from order_items oi
        join orders o on o.id = oi.order_id
        where o.store_id = p_store_id
          and o.status = 'completed'
          and o.ordered_at >= p_from
          and o.ordered_at <  p_to
          and oi.product_id is not null
        group by oi.product_id
    ),
    perf as (
        select
            ps.id                                as product_id,
            ps.name::text                        as product_name,
            ps.category_id,
            ps.category_name::text               as category_name,
            ps.price::numeric                    as price,
            coalesce(s.units_sold, 0)::bigint    as units_sold,
            coalesce(s.revenue, 0)::numeric      as revenue,
            coalesce(s.orders_count, 0)::bigint  as orders_count,
            case when ps.cost_price is null then null
                 else (ps.cost_price * coalesce(s.units_sold, 0)) end::numeric as cost,
            ps.review_count,
            ps.average_rating,
            ps.quantity,
            ps.stock_status
        from v_product_stats ps
        left join sales s on s.product_id = ps.id
        where ps.store_id = p_store_id
    )
    select
        r.product_id, r.product_name, r.category_id, r.category_name, r.price,
        r.units_sold, r.revenue, r.orders_count, r.cost,
        case when r.cost is null then null else r.revenue - r.cost end::numeric,
        case when r.cost is null or r.revenue = 0 then null
             else round(100.0 * (r.revenue - r.cost) / r.revenue, 2) end::numeric,
        r.review_count, r.average_rating, r.quantity, r.stock_status
    from perf r
    order by
        case p_sort_by
            when 'units'  then r.units_sold::numeric
            when 'profit' then coalesce(r.revenue - r.cost, 0)
            when 'rating' then coalesce(r.average_rating, 0)
            when 'name'   then 0
            else r.revenue
        end desc,
        r.product_name asc
    limit greatest(coalesce(p_limit, 50), 1);
$$;


-- ============================================================
-- PRIVILEGES
-- Only the backend (service_role) may call these functions / read these
-- views. The anon and authenticated roles are explicitly denied, so the
-- public anon key cannot be used to call them directly.
-- ============================================================

do $$
declare
    fn text;
    vw text;
begin
    foreach fn in array array[
        'store_timezone(uuid)',
        'store_low_stock_default(uuid)',
        'create_product_with_inventory(uuid, text, numeric, uuid, text, text, text, numeric, boolean, integer, integer)',
        'apply_inventory_change(uuid, uuid, text, integer, integer, text)',
        'create_order_with_items(uuid, jsonb, uuid, text, text, numeric, numeric, numeric, timestamptz)',
        'update_order(uuid, uuid, text, uuid, boolean)',
        'period_metrics(uuid, timestamptz, timestamptz)',
        'sales_timeseries(uuid, timestamptz, timestamptz, text)',
        'top_selling_products(uuid, timestamptz, timestamptz, integer, text)',
        'customer_growth_series(uuid, timestamptz, timestamptz, text)',
        'retention_cohorts(uuid, timestamptz, timestamptz)',
        'category_revenue(uuid, timestamptz, timestamptz)',
        'product_performance(uuid, timestamptz, timestamptz, text, integer)'
    ]
    loop
        execute format('revoke all on function %s from public', fn);
        if exists (select 1 from pg_roles where rolname = 'anon') then
            execute format('revoke all on function %s from anon', fn);
        end if;
        if exists (select 1 from pg_roles where rolname = 'authenticated') then
            execute format('revoke all on function %s from authenticated', fn);
        end if;
        if exists (select 1 from pg_roles where rolname = 'service_role') then
            execute format('grant execute on function %s to service_role', fn);
        end if;
    end loop;

    foreach vw in array array['v_customer_stats', 'v_product_stats', 'v_order_list', 'v_inventory_movements']
    loop
        if exists (select 1 from pg_roles where rolname = 'anon') then
            execute format('revoke all on %I from anon', vw);
        end if;
        if exists (select 1 from pg_roles where rolname = 'authenticated') then
            execute format('revoke all on %I from authenticated', vw);
        end if;
        if exists (select 1 from pg_roles where rolname = 'service_role') then
            execute format('grant select on %I to service_role', vw);
        end if;
    end loop;
end;
$$;


-- Ask PostgREST (Supabase API) to pick up the new views/functions.
notify pgrst, 'reload schema';
