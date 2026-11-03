-- Migration: Create rest_zones table for Fleet Staging & Overnight Depots
-- Enables 100% dynamic database-driven corridor anchor 2 transit nodes with full CRUD operations.

CREATE TABLE IF NOT EXISTS public.rest_zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  landmark TEXT,
  fleet_capacity INTEGER DEFAULT 25,
  operating_hours TEXT DEFAULT '24/7 Fleet Staging',
  campus_id TEXT REFERENCES public.campuses(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security policies
ALTER TABLE public.rest_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on rest_zones" ON public.rest_zones;
CREATE POLICY "Allow public read on rest_zones" ON public.rest_zones FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all on rest_zones for service role" ON public.rest_zones;
CREATE POLICY "Allow all on rest_zones for service role" ON public.rest_zones USING (true) WITH CHECK (true);

-- Index for high-speed spatial & campus lookups
CREATE INDEX IF NOT EXISTS idx_rest_zones_campus_id ON public.rest_zones(campus_id);
CREATE INDEX IF NOT EXISTS idx_rest_zones_code ON public.rest_zones(code);

