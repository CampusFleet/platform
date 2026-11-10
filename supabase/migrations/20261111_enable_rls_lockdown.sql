-- ==============================================================================
-- CampusFleet: Lock the public schema to server-side access only.
--
-- APPLY ONLY AFTER deploying the code that routes the browser store through
-- /api/db (src/app/api/db/rest/v1/[table]/route.ts). Before that deploy, the
-- live frontend still reads/writes with the anon key and would break.
--
-- Why: the NEXT_PUBLIC anon key ships in every browser bundle, and RLS was off
-- on 50/51 tables, so anyone could read users.password_hash, payroll configs and
-- face embeddings, or rewrite any table directly against PostgREST.
--
-- Effect: anon / authenticated get no table, view, sequence or function access.
-- The service_role key (server only) bypasses RLS and keeps working.
-- Rollback: see the bottom of this file.
-- ==============================================================================

BEGIN;

-- 1. Enable RLS on every base table in public (no policies = deny for non-bypass roles)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- 2. rest_zones had "ALL for public" policies → drop them (anon could write)
DROP POLICY IF EXISTS "Allow all on rest_zones for service role" ON public.rest_zones;
DROP POLICY IF EXISTS "Allow public read on rest_zones" ON public.rest_zones;

-- 3. Views run with their owner's rights and would bypass RLS → revoke direct grants
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, public;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 4. Same defaults for objects created later
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, public;

COMMIT;

-- ------------------------------------------------------------------------------
-- Rollback (only if something critical breaks after deploy):
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
--   DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public'
--     LOOP EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename); END LOOP; END $$;
-- ------------------------------------------------------------------------------
