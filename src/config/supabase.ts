import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Server-side Supabase client authenticated with the service role key.
 * The service role bypasses RLS, so every repository query MUST be scoped
 * by store_id. This client must never be exposed to the frontend.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'x-application-name': 'commerceos-backend' },
  },
});
