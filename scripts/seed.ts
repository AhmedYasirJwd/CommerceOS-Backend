/**
 * Seed the CommerceOS demo store in Supabase.
 *
 *   npm run seed          seed an empty store (refuses if the store already has data)
 *   npm run seed:reset    delete the store's existing data, then seed
 *
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. The store id is
 * DEFAULT_STORE_ID when set, otherwise the existing store with slug
 * "commerceos-demo", otherwise a new id (printed at the end).
 * Only rows belonging to that store are ever deleted.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { generateSeedData } from './seed/generate.js';
import { looksLikePublicKey } from '../src/config/keys.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)');
  process.exit(1);
}

if (looksLikePublicKey(key)) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is the public anon/publishable key. Use the secret key (sb_secret_...) or the legacy service_role key.');
  process.exit(1);
}

const reset = process.argv.includes('--reset');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const BATCH = 500;

function fail(step: string, error: { message: string; code?: string } | null): never {
  console.error(`\n✖ ${step} failed: ${error?.message ?? 'unknown error'}${error?.code ? ` (${error.code})` : ''}`);
  process.exit(1);
}

async function insertAll(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH));
    if (error) fail(`insert into ${table}`, error);
  }
  console.log(`  ✓ ${table.padEnd(20)} ${rows.length}`);
}

async function resolveStoreId(): Promise<string> {
  const configured = process.env.DEFAULT_STORE_ID?.trim();
  if (configured) return configured;
  const { data, error } = await supabase.from('stores').select('id').eq('slug', 'commerceos-demo').maybeSingle();
  if (error) fail('look up demo store', error);
  return data?.id ?? randomUUID();
}

async function storeHasData(storeId: string): Promise<boolean> {
  for (const table of ['products', 'customers', 'orders']) {
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('store_id', storeId);
    if (error) fail(`check ${table}`, error);
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

async function clearStore(storeId: string) {
  // Children first. Products cascade to inventory, movements, reviews and
  // forecasts; orders cascade to order_items.
  for (const table of [
    'ai_actions',
    'ai_insights',
    'ai_analysis_runs',
    'ai_conversations',
    'demand_forecasts',
    'product_reviews',
    'store_visits',
    'orders',
    'products',
    'categories',
    'customers',
  ]) {
    const { error } = await supabase.from(table).delete().eq('store_id', storeId);
    if (error) fail(`clear ${table}`, error);
  }
  console.log('  ✓ cleared existing store data');
}

async function main() {
  const storeId = await resolveStoreId();
  console.log(`Seeding store ${storeId}${reset ? ' (reset)' : ''}`);

  const { data: existing, error: lookupError } = await supabase.from('stores').select('id').eq('id', storeId).maybeSingle();
  if (lookupError) fail('look up store', lookupError);

  if (existing && (await storeHasData(storeId))) {
    if (!reset) {
      console.error('\nThis store already has data. Run `npm run seed:reset` to replace it.');
      process.exit(1);
    }
    await clearStore(storeId);
  }

  const data = generateSeedData({ storeId });

  // Slug is globally unique: free it if another store holds it.
  const { data: slugOwner } = await supabase.from('stores').select('id').eq('slug', data.store.slug).maybeSingle();
  const store = slugOwner && slugOwner.id !== storeId ? { ...data.store, slug: `${data.store.slug}-${storeId.slice(0, 8)}` } : data.store;

  const { error: storeError } = await supabase.from('stores').upsert(store, { onConflict: 'id' });
  if (storeError) fail('upsert store', storeError);
  const { error: settingsError } = await supabase.from('store_settings').upsert(data.settings, { onConflict: 'store_id' });
  if (settingsError) fail('upsert store_settings', settingsError);
  console.log('  ✓ stores / store_settings');

  const { data: existingUser, error: userLookupError } = await supabase
    .from('users')
    .select('id')
    .eq('email', data.user.email)
    .maybeSingle();
  if (userLookupError) fail('look up users', userLookupError);
  let user = existingUser;
  if (!user) {
    const { data: created, error: userError } = await supabase.from('users').insert(data.user).select('id').single();
    if (userError) fail('insert users', userError);
    user = created;
  }
  const { error: memberError } = await supabase
    .from('store_members')
    .upsert({ store_id: storeId, user_id: user.id, role: 'owner' }, { onConflict: 'store_id,user_id' });
  if (memberError) fail('upsert store_members', memberError);
  console.log(`  ✓ users / store_members (${data.user.email})`);

  await insertAll('categories', data.categories);
  await insertAll('products', data.products);
  await insertAll('inventory', data.inventory);
  await insertAll('customers', data.customers);
  await insertAll('orders', data.orders);
  await insertAll('order_items', data.orderItems);
  await insertAll('inventory_movements', data.movements);
  await insertAll('product_reviews', data.reviews);
  await insertAll('store_visits', data.visits);
  await insertAll('ai_insights', data.insights);
  await insertAll('ai_actions', data.actions);

  console.log('\nDone.');
  if (process.env.DEFAULT_STORE_ID?.trim() !== storeId) {
    console.log(`\nAdd this to your .env:\n  DEFAULT_STORE_ID=${storeId}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
