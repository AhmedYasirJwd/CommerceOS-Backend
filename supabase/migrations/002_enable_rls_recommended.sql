-- ============================================================
-- RECOMMENDED SECURITY HARDENING (optional, review before running)
--
-- schema.sql creates every table in the `public` schema WITHOUT Row Level
-- Security. On Supabase that means anyone holding the project's public
-- anon key can read and modify every table through the Supabase REST API,
-- bypassing this backend entirely.
--
-- Enabling RLS with no policies denies all access to the anon and
-- authenticated roles. The backend uses the service_role key, which
-- bypasses RLS, so the API keeps working unchanged.
--
-- If the frontend later needs direct Supabase access (e.g. Realtime),
-- add explicit policies for that use case.
-- ============================================================

alter table stores              enable row level security;
alter table users               enable row level security;
alter table store_members       enable row level security;
alter table store_settings      enable row level security;
alter table categories          enable row level security;
alter table products            enable row level security;
alter table inventory           enable row level security;
alter table inventory_movements enable row level security;
alter table customers           enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table store_visits        enable row level security;
alter table product_reviews     enable row level security;
alter table ai_insights         enable row level security;
alter table ai_conversations    enable row level security;
alter table ai_messages         enable row level security;
alter table ai_actions          enable row level security;
alter table ai_analysis_runs    enable row level security;
alter table demand_forecasts    enable row level security;
