/**
 * Deterministic demo-data generator for CommerceOS.
 *
 * Produces rows for the tables in schema.sql that are internally consistent:
 *  - order totals = sum(item subtotals) - discount + tax + shipping
 *  - inventory is simulated chronologically: every sale, cancellation,
 *    restock and adjustment is an inventory_movements row, and the final
 *    inventory.quantity equals the last movement's new_quantity
 *  - customer spend / product units sold are derived from orders (never stored)
 *  - reviews come from customers who bought the product
 *  - store_visits produce a realistic conversion rate (~2-4%)
 *
 * Pure function: no I/O, so it can be validated against a local Postgres.
 */
import { randomUUID } from 'node:crypto';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------- random ---
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- catalogue ---
const CATALOG: { name: string; slug: string; description: string; products: [string, number, string][] }[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    description: 'Audio, wearables and accessories for everyday tech.',
    products: [
      ['Wireless Noise-Cancelling Headphones', 199.99, 'ELE-HDP-01'],
      ['Bluetooth Portable Speaker', 79.99, 'ELE-SPK-01'],
      ['Smart Fitness Watch', 149.0, 'ELE-WCH-01'],
      ['USB-C Fast Charger 65W', 39.99, 'ELE-CHG-01'],
      ['Mechanical Keyboard', 119.0, 'ELE-KBD-01'],
      ['Wireless Ergonomic Mouse', 49.5, 'ELE-MSE-01'],
    ],
  },
  {
    name: 'Apparel',
    slug: 'apparel',
    description: 'Comfortable everyday clothing.',
    products: [
      ['Organic Cotton T-Shirt', 24.0, 'APP-TSH-01'],
      ['Classic Denim Jacket', 89.0, 'APP-JKT-01'],
      ['Merino Wool Sweater', 110.0, 'APP-SWT-01'],
      ['Slim Fit Chinos', 59.0, 'APP-CHN-01'],
      ['Waterproof Rain Shell', 129.0, 'APP-RSH-01'],
      ['Essential Hoodie', 54.0, 'APP-HOD-01'],
    ],
  },
  {
    name: 'Shoes',
    slug: 'shoes',
    description: 'Running, casual and outdoor footwear.',
    products: [
      ['Everyday Running Shoes', 129.99, 'SHO-RUN-01'],
      ['Leather Chelsea Boots', 179.0, 'SHO-BOT-01'],
      ['Canvas Low-Top Sneakers', 64.0, 'SHO-SNK-01'],
      ['Trail Hiking Shoes', 149.0, 'SHO-HIK-01'],
      ['Recovery Slides', 34.0, 'SHO-SLD-01'],
      ['Minimalist Training Shoes', 109.0, 'SHO-TRN-01'],
    ],
  },
  {
    name: 'Home & Kitchen',
    slug: 'home-kitchen',
    description: 'Tools and essentials for the home.',
    products: [
      ['Pour-Over Coffee Set', 45.0, 'HOM-COF-01'],
      ['Cast Iron Skillet 10"', 39.0, 'HOM-SKL-01'],
      ['Chef Knife 8"', 89.0, 'HOM-KNF-01'],
      ['Linen Throw Blanket', 69.0, 'HOM-BLK-01'],
      ['Ceramic Dinnerware Set', 119.0, 'HOM-DIN-01'],
      ['Insulated Water Bottle', 29.0, 'HOM-BTL-01'],
    ],
  },
  {
    name: 'Beauty',
    slug: 'beauty',
    description: 'Skincare and personal care.',
    products: [
      ['Hydrating Face Serum', 38.0, 'BEA-SRM-01'],
      ['Daily SPF 50 Moisturiser', 26.0, 'BEA-SPF-01'],
      ['Natural Lip Balm Trio', 12.0, 'BEA-LIP-01'],
      ['Clay Detox Mask', 22.0, 'BEA-MSK-01'],
      ['Bamboo Hair Brush', 18.0, 'BEA-BRS-01'],
      ['Gentle Foaming Cleanser', 21.0, 'BEA-CLN-01'],
    ],
  },
  {
    name: 'Sports & Outdoors',
    slug: 'sports-outdoors',
    description: 'Gear for training and the outdoors.',
    products: [
      ['Non-Slip Yoga Mat', 49.0, 'SPO-YOG-01'],
      ['Adjustable Dumbbell Set', 249.0, 'SPO-DMB-01'],
      ['Resistance Bands Pack', 25.0, 'SPO-RBD-01'],
      ['Ultralight Camping Tent', 289.0, 'SPO-TNT-01'],
      ['Hydration Running Vest', 69.0, 'SPO-VST-01'],
      ['Foam Recovery Roller', 32.0, 'SPO-ROL-01'],
    ],
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    description: 'Bags, wallets and finishing touches.',
    products: [
      ['Leather Card Wallet', 45.0, 'ACC-WAL-01'],
      ['Everyday Backpack 22L', 98.0, 'ACC-BPK-01'],
      ['Polarised Sunglasses', 79.0, 'ACC-SUN-01'],
      ['Canvas Tote Bag', 28.0, 'ACC-TOT-01'],
      ['Minimal Analog Watch', 159.0, 'ACC-WCH-01'],
      ['Wool Beanie', 22.0, 'ACC-BNE-01'],
    ],
  },
];

const FIRST_NAMES = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'James', 'Isabella', 'Lucas', 'Mia', 'Mateo', 'Amelia', 'Ethan', 'Harper', 'Aiden', 'Layla', 'Omar', 'Fatima', 'Yusuf', 'Aisha', 'Hassan', 'Zara', 'Ali', 'Chloe', 'Daniel', 'Grace', 'Samuel', 'Nora', 'Leo', 'Hana', 'Kenji', 'Priya', 'Arjun', 'Sofia', 'Diego', 'Lena', 'Felix', 'Maya', 'Ivan'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Khan', 'Ahmed', 'Hassan', 'Rahman', 'Patel', 'Nguyen', 'Kim', 'Tanaka', 'Rossi', 'Muller', 'Novak', 'Silva', 'Cohen', 'Okafor', 'Haddad', 'Larsen', 'Moreau', 'Clarke'];

const REVIEW_TEXT: Record<number, [string, string][]> = {
  5: [['Absolutely love it', 'Exceeded my expectations. Great quality and fast delivery.'], ['Perfect', 'Exactly as described, would buy again.'], ['Best purchase this year', 'Really well made and worth every penny.']],
  4: [['Very good', 'Solid quality, only minor nitpicks.'], ['Happy with it', 'Works well, arrived quickly. Packaging could be better.'], ['Great value', 'Good product for the price.']],
  3: [['It is okay', 'Does the job but nothing special.'], ['Average', 'Decent, but I expected slightly better quality.']],
  2: [['Disappointed', 'Quality is lower than I expected for the price.'], ['Not great', 'Sizing/fit was off and the material feels cheap.']],
  1: [['Would not recommend', 'Stopped working after a week.'], ['Poor quality', 'Arrived damaged and support was slow.']],
};

// ----------------------------------------------------------------- types ---
export interface SeedData {
  store: { id: string; name: string; slug: string; currency: string; timezone: string };
  settings: Record<string, unknown>;
  user: { id: string; email: string; name: string };
  categories: Record<string, unknown>[];
  products: Record<string, unknown>[];
  inventory: Record<string, unknown>[];
  movements: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  orderItems: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  visits: Record<string, unknown>[];
  insights: Record<string, unknown>[];
  actions: Record<string, unknown>[];
}

interface SimProduct {
  id: string;
  name: string;
  priceCents: number;
  costCents: number;
  categoryName: string;
  active: boolean;
  weight: number;
  quality: number;
  threshold: number;
  qty: number;
  lastMovementAt: number;
}

const iso = (t: number) => new Date(t).toISOString();
const money = (cents: number) => Math.round(cents) / 100;

export function generateSeedData(options: { storeId: string; now?: number; seed?: number }): SeedData {
  const rand = mulberry32(options.seed ?? 20261006);
  const now = options.now ?? Date.now();
  const start = now - 365 * DAY;

  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
  const weighted = <T extends { weight: number }>(items: readonly T[]): T => {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = rand() * total;
    for (const item of items) if ((r -= item.weight) <= 0) return item;
    return items[items.length - 1]!;
  };

  const storeId = options.storeId;
  const store = { id: storeId, name: 'CommerceOS Demo Store', slug: 'commerceos-demo', currency: 'USD', timezone: 'UTC' };
  const settings = { store_id: storeId, ai_insights_enabled: true, low_stock_default_threshold: 10 };
  const user = { id: randomUUID(), email: 'owner@commerceos.demo', name: 'Demo Owner' };

  // ------------------------------------------------------ categories/products
  const categories: SeedData['categories'] = [];
  const products: SeedData['products'] = [];
  const sim: SimProduct[] = [];

  for (const category of CATALOG) {
    const categoryId = randomUUID();
    categories.push({
      id: categoryId,
      store_id: storeId,
      name: category.name,
      slug: category.slug,
      description: category.description,
      created_at: iso(start - 30 * DAY),
      updated_at: iso(start - 30 * DAY),
    });
    for (const [name, price, sku] of category.products) {
      const id = randomUUID();
      const priceCents = Math.round(price * 100);
      const costCents = Math.round(priceCents * (0.35 + rand() * 0.25));
      const active = sku !== 'APP-RSH-01'; // one discontinued product for demo purposes
      products.push({
        id,
        store_id: storeId,
        category_id: categoryId,
        name,
        slug: name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        description: `${name} from our ${category.name.toLowerCase()} range.`,
        sku,
        price: money(priceCents),
        cost_price: money(costCents),
        active,
        created_at: iso(start - 30 * DAY),
        updated_at: iso(start - 30 * DAY),
      });
      sim.push({
        id,
        name,
        priceCents,
        costCents,
        categoryName: category.name,
        active,
        // cheaper items sell more often; a few "hero" products sell a lot
        weight: (1 / Math.sqrt(price)) * (rand() < 0.15 ? 3 : 1) * (0.6 + rand()),
        quality: 0.55 + rand() * 0.4,
        threshold: int(5, 15),
        qty: 0,
        lastMovementAt: start,
      });
    }
  }

  // Products whose price rose ~6 months ago: older orders keep the old price.
  const repriced = new Set([sim[0]!.id, sim[13]!.id, sim[31]!.id]);
  const repriceAt = now - 180 * DAY;

  // ------------------------------------------------------------- movements
  const movements: SeedData['movements'] = [];
  const move = (p: SimProduct, type: string, delta: number, at: number, referenceId: string | null, note: string | null) => {
    const previous = p.qty;
    p.qty += delta;
    if (p.qty < 0) throw new Error(`Seed bug: negative stock for ${p.name}`);
    p.lastMovementAt = at;
    movements.push({
      id: randomUUID(),
      product_id: p.id,
      type,
      quantity: delta,
      previous_quantity: previous,
      new_quantity: p.qty,
      reference_id: referenceId,
      note,
      created_at: iso(at),
    });
  };

  for (const p of sim) move(p, 'restock', int(60, 180), start - DAY, null, 'Initial stock');

  // ------------------------------------------------------------- customers
  const customers: SeedData['customers'] = [];
  const customerCreated: { id: string; createdAt: number; loyal: boolean }[] = [];
  const usedEmails = new Set<string>();
  const CUSTOMER_COUNT = 160;
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    let email = `${first}.${last}`.toLowerCase() + '@example.com';
    for (let n = 2; usedEmails.has(email); n++) email = `${first}.${last}${n}`.toLowerCase() + '@example.com';
    usedEmails.add(email);
    // signups grow over time (density increases toward now)
    const createdAt = start - 60 * DAY + Math.sqrt(rand()) * (425 * DAY - 2 * DAY);
    const id = randomUUID();
    customers.push({
      id,
      store_id: storeId,
      first_name: first,
      last_name: last,
      email,
      phone: rand() < 0.7 ? `+1-555-${String(int(100, 999))}-${String(int(1000, 9999))}` : null,
      status: 'active',
      created_at: iso(createdAt),
      updated_at: iso(createdAt),
    });
    customerCreated.push({ id, createdAt, loyal: rand() < 0.3 });
  }
  customerCreated.sort((a, b) => a.createdAt - b.createdAt);

  // ---------------------------------------------------------------- orders
  const ORDER_COUNT = 650;
  const orderTimes = Array.from({ length: ORDER_COUNT }, () => start + Math.sqrt(rand()) * (365 * DAY - 15 * 60 * 1000)).sort(
    (a, b) => a - b,
  );

  for (let i = 1; i < orderTimes.length; i++) {
    if (orderTimes[i]! - orderTimes[i - 1]! < 5000) orderTimes[i] = orderTimes[i - 1]! + 5000;
  }

  const orders: SeedData['orders'] = [];
  const orderItems: SeedData['orderItems'] = [];
  const purchases: { customerId: string; productId: string; at: number }[] = [];
  const lastOrderAt = new Map<string, number>();

  // Cancellations happen hours after the order; they are queued and applied in
  // time order so every product's movement chain stays chronological.
  const cancellations: { at: number; product: SimProduct; quantity: number; orderId: string; orderNumber: string }[] = [];
  const flushCancellations = (until: number) => {
    cancellations.sort((a, b) => a.at - b.at);
    while (cancellations.length && cancellations[0]!.at <= until) {
      const c = cancellations.shift()!;
      move(c.product, 'cancellation', c.quantity, c.at, c.orderId, `Order ${c.orderNumber} cancelled`);
    }
  };

  orderTimes.forEach((orderedAt, index) => {
    flushCancellations(orderedAt - 2000);
    const id = randomUUID();
    const ageDays = (now - orderedAt) / DAY;

    const eligible = customerCreated.filter((c) => c.createdAt < orderedAt);
    let customerId: string | null = null;
    if (eligible.length && rand() > 0.04) {
      const loyal = eligible.filter((c) => c.loyal);
      customerId = (loyal.length && rand() < 0.45 ? pick(loyal) : pick(eligible)).id;
    }

    let status: string;
    if (ageDays > 4) status = rand() < 0.92 ? 'completed' : 'cancelled';
    else status = rand() < 0.35 ? 'pending' : rand() < 0.6 ? 'processing' : rand() < 0.85 ? 'completed' : 'cancelled';

    // pick 1-4 distinct products (the discontinued one only before it was discontinued)
    const itemCount = weighted([
      { n: 1, weight: 5 },
      { n: 2, weight: 3 },
      { n: 3, weight: 1.5 },
      { n: 4, weight: 0.5 },
    ]).n;
    const chosen = new Map<string, SimProduct>();
    const pool = sim.filter((p) => p.active || ageDays > 90);
    while (chosen.size < itemCount) {
      const p = weighted(pool);
      chosen.set(p.id, p);
    }

    const orderNumber = `ORD-${100001 + index}`;
    let subtotal = 0;
    for (const p of chosen.values()) {
      const quantity = weighted([
        { n: 1, weight: 7 },
        { n: 2, weight: 2.5 },
        { n: 3, weight: 0.5 },
      ]).n;
      const unitCents = repriced.has(p.id) && orderedAt < repriceAt ? Math.round(p.priceCents * 0.9) : p.priceCents;
      const lineCents = unitCents * quantity;
      subtotal += lineCents;

      // restock just before the sale if stock would not cover it
      if (p.qty < quantity) move(p, 'restock', int(80, 150), orderedAt - 1000, null, 'Supplier delivery');
      move(p, 'sale', -quantity, orderedAt, id, `Order ${orderNumber}`);
      // routine replenishment when stock gets low
      if (p.qty <= p.threshold && rand() < 0.75) move(p, 'restock', int(60, 140), orderedAt + 1000, null, 'Supplier delivery');

      orderItems.push({
        id: randomUUID(),
        order_id: id,
        product_id: p.id,
        product_name: p.name,
        quantity,
        unit_price: money(unitCents),
        subtotal: money(lineCents),
        created_at: iso(orderedAt),
      });
      if (customerId && status === 'completed') purchases.push({ customerId, productId: p.id, at: orderedAt });
    }

    const discount = rand() < 0.15 ? Math.round(subtotal * 0.1) : 0;
    const tax = Math.round((subtotal - discount) * 0.08);
    const shipping = subtotal >= 7500 ? 0 : 799;
    const total = subtotal - discount + tax + shipping;

    if (status === 'cancelled') {
      const cancelledAt = Math.min(orderedAt + int(1, 20) * HOUR, now - 12 * 60 * 1000);
      for (const p of chosen.values()) {
        const item = orderItems.find((i) => i.order_id === id && i.product_id === p.id)!;
        cancellations.push({ at: cancelledAt, product: p, quantity: item.quantity as number, orderId: id, orderNumber });
      }
    }

    orders.push({
      id,
      store_id: storeId,
      customer_id: customerId,
      order_number: orderNumber,
      status,
      subtotal: money(subtotal),
      discount: money(discount),
      tax: money(tax),
      shipping: money(shipping),
      total: money(total),
      ordered_at: iso(orderedAt),
      created_at: iso(orderedAt),
      updated_at: iso(orderedAt),
    });
    if (customerId && status !== 'cancelled') lastOrderAt.set(customerId, orderedAt);
  });

  flushCancellations(Infinity);

  // Leave some products low / out of stock via a recorded stock-count adjustment.
  const countAt = now - 10 * 60 * 1000;
  const lowTargets = [sim[2]!, sim[9]!, sim[20]!, sim[27]!, sim[38]!];
  const outTargets = [sim[16]!, sim[33]!];
  for (const p of lowTargets) {
    const target = Math.max(1, Math.min(p.threshold - 1, int(1, p.threshold)));
    if (p.qty !== target) move(p, 'adjustment', target - p.qty, countAt, null, 'Stock count correction');
  }
  for (const p of outTargets) {
    if (p.qty !== 0) move(p, 'adjustment', -p.qty, countAt, null, 'Damaged stock written off');
  }
  for (const p of sim) {
    if (lowTargets.includes(p) || outTargets.includes(p)) continue;
    if (p.qty <= p.threshold) move(p, 'restock', int(60, 120), countAt, null, 'Supplier delivery');
  }

  // Customers with no order for 6+ months are inactive.
  for (const c of customers) {
    const last = lastOrderAt.get(c.id as string);
    if (last !== undefined && now - last > 180 * DAY) c.status = 'inactive';
  }

  const inventory = sim.map((p) => ({
    id: randomUUID(),
    product_id: p.id,
    quantity: p.qty,
    low_stock_threshold: p.threshold,
    updated_at: iso(p.lastMovementAt),
  }));

  // --------------------------------------------------------------- reviews
  const reviews: SeedData['reviews'] = [];
  const reviewed = new Set<string>();
  const qualityOf = new Map(sim.map((p) => [p.id, p.quality]));
  for (const purchase of purchases) {
    const key = `${purchase.customerId}:${purchase.productId}`;
    if (reviewed.has(key) || rand() > 0.22) continue;
    const at = purchase.at + int(3, 20) * DAY;
    if (at > now) continue;
    reviewed.add(key);
    const quality = qualityOf.get(purchase.productId)!;
    const r = rand();
    const rating = r < quality * 0.75 ? 5 : r < quality ? 4 : r < quality + 0.12 ? 3 : r < quality + 0.2 ? 2 : 1;
    const [title, text] = pick(REVIEW_TEXT[rating]!);
    // ~30% left unlabelled for the future AI sentiment analysis phase
    const sentiment = rand() < 0.3 ? null : rating >= 4 ? 'positive' : rating === 3 ? 'neutral' : 'negative';
    reviews.push({
      id: randomUUID(),
      store_id: storeId,
      product_id: purchase.productId,
      customer_id: purchase.customerId,
      rating,
      title,
      review_text: text,
      sentiment,
      created_at: iso(at),
    });
  }

  // ---------------------------------------------------------------- visits
  const visits: SeedData['visits'] = [];
  const completedPerDay = new Map<number, number>();
  for (const o of orders) {
    if (o.status !== 'completed') continue;
    const day = Math.floor(Date.parse(o.ordered_at as string) / DAY);
    completedPerDay.set(day, (completedPerDay.get(day) ?? 0) + 1);
  }
  const visitorPool: string[] = [];
  const firstDay = Math.floor(start / DAY);
  const lastDay = Math.floor(now / DAY);
  for (let day = firstDay; day <= lastDay; day++) {
    const progress = (day - firstDay) / (lastDay - firstDay);
    const conversion = 0.022 + rand() * 0.02; // 2.2% - 4.2%
    const completed = completedPerDay.get(day) ?? 0;
    const sessions = Math.max(Math.round(12 + progress * 25), Math.round(completed / conversion));
    for (let s = 0; s < sessions; s++) {
      let visitorId: string;
      if (visitorPool.length > 50 && rand() < 0.35) visitorId = pick(visitorPool);
      else {
        visitorId = `vis_${randomUUID().slice(0, 12)}`;
        visitorPool.push(visitorId);
      }
      const sessionId = `ses_${randomUUID().slice(0, 16)}`;
      const sessionStart = day * DAY + rand() * DAY;
      const pageViews = weighted([
        { n: 1, weight: 5 },
        { n: 2, weight: 3 },
        { n: 3, weight: 2 },
      ]).n;
      for (let v = 0; v < pageViews; v++) {
        const at = sessionStart + v * int(20, 240) * 1000;
        if (at > now) break;
        visits.push({ id: randomUUID(), store_id: storeId, visitor_id: visitorId, session_id: sessionId, visited_at: iso(at) });
      }
    }
  }

  // ---------------------------------------------------- stored AI records
  // Demo records derived from the generated data (generated_by = 'seed').
  // They are not model output; real insights are produced in a later phase.
  const lowStock = sim.filter((p) => p.qty > 0 && p.qty <= p.threshold);
  const outOfStock = sim.filter((p) => p.qty === 0);
  const revenueBetween = (from: number, to: number) =>
    money(
      orders
        .filter((o) => o.status === 'completed' && Date.parse(o.ordered_at as string) >= from && Date.parse(o.ordered_at as string) < to)
        .reduce((s, o) => s + Math.round((o.total as number) * 100), 0),
    );
  const last30 = revenueBetween(now - 30 * DAY, now);
  const prev30 = revenueBetween(now - 60 * DAY, now - 30 * DAY);
  const change = prev30 > 0 ? Math.round(((last30 - prev30) / prev30) * 1000) / 10 : null;

  const unitsLast30 = new Map<string, number>();
  const completedRecent = new Set(
    orders.filter((o) => o.status === 'completed' && Date.parse(o.ordered_at as string) >= now - 30 * DAY).map((o) => o.id),
  );
  for (const item of orderItems) {
    if (!completedRecent.has(item.order_id as string)) continue;
    unitsLast30.set(item.product_id as string, (unitsLast30.get(item.product_id as string) ?? 0) + (item.quantity as number));
  }
  const [topId, topUnits] = [...unitsLast30.entries()].sort((a, b) => b[1] - a[1])[0] ?? [sim[0]!.id, 0];
  const top = sim.find((p) => p.id === topId)!;
  const inactiveCount = customers.filter((c) => c.status === 'inactive').length;

  const insightBase = {
    store_id: storeId,
    status: 'new',
    generated_by: 'seed',
    model_name: null,
    generated_at: iso(now - 2 * HOUR),
    created_at: iso(now - 2 * HOUR),
    expires_at: iso(now + 14 * DAY),
  };
  const stockInsightId = randomUUID();
  const insights: SeedData['insights'] = [
    {
      ...insightBase,
      id: stockInsightId,
      type: 'inventory',
      priority: outOfStock.length ? 'critical' : 'high',
      title: `${outOfStock.length} products out of stock, ${lowStock.length} running low`,
      summary: `Out of stock: ${outOfStock.map((p) => p.name).join(', ') || 'none'}. Low stock: ${lowStock.map((p) => p.name).join(', ') || 'none'}.`,
      explanation: 'Inventory levels are at or below the configured low-stock thresholds.',
      recommendation: 'Restock the affected products to avoid lost sales.',
      data: {
        outOfStock: outOfStock.map((p) => ({ productId: p.id, name: p.name })),
        lowStock: lowStock.map((p) => ({ productId: p.id, name: p.name, quantity: p.qty, threshold: p.threshold })),
      },
    },
    {
      ...insightBase,
      id: randomUUID(),
      type: 'revenue',
      priority: change !== null && change < 0 ? 'high' : 'medium',
      title: change === null ? 'Revenue in the last 30 days' : `Revenue ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% vs previous 30 days`,
      summary: `Completed-order revenue was $${last30.toFixed(2)} in the last 30 days compared with $${prev30.toFixed(2)} in the 30 days before.`,
      explanation: 'Calculated from completed orders only.',
      recommendation: change !== null && change < 0 ? 'Review recent pricing and promotions.' : 'Keep investing in the channels driving growth.',
      data: { last30Days: last30, previous30Days: prev30, changePercent: change },
    },
    {
      ...insightBase,
      id: randomUUID(),
      type: 'product',
      priority: 'medium',
      title: `Top seller: ${top.name}`,
      summary: `${top.name} sold ${topUnits} units in completed orders over the last 30 days.`,
      explanation: `Highest unit sales in the ${top.categoryName} category and across the store.`,
      recommendation: 'Make sure stock levels can support continued demand.',
      data: { productId: top.id, unitsSold: topUnits },
    },
    {
      ...insightBase,
      id: randomUUID(),
      type: 'customer',
      priority: 'low',
      status: 'viewed',
      title: `${inactiveCount} customers have not ordered in 6 months`,
      summary: `${inactiveCount} customers are marked inactive because their last order was more than 180 days ago.`,
      explanation: 'Derived from each customer\'s most recent non-cancelled order.',
      recommendation: 'Consider a win-back campaign for inactive customers.',
      data: { inactiveCustomers: inactiveCount },
    },
  ];

  const restockTargets = [...outOfStock, ...lowStock].slice(0, 3);
  const actions: SeedData['actions'] = restockTargets.map((p, i) => ({
    id: randomUUID(),
    store_id: storeId,
    insight_id: stockInsightId,
    type: 'restock_product',
    title: `Restock ${p.name}`,
    description: `Order ${Math.max(50, p.threshold * 5)} units of ${p.name} (current stock ${p.qty}).`,
    status: i === 2 ? 'rejected' : 'pending',
    parameters: { productId: p.id, quantity: Math.max(50, p.threshold * 5) },
    result: null,
    error_message: null,
    approved_at: null,
    executed_at: null,
    created_at: iso(now - 2 * HOUR),
    updated_at: iso(now - 2 * HOUR),
  }));

  return {
    store,
    settings,
    user,
    categories,
    products,
    inventory,
    movements,
    customers,
    orders,
    orderItems,
    reviews,
    visits,
    insights,
    actions,
  };
}
