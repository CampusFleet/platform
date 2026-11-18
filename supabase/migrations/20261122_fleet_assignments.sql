-- Standing fleet assignments (see docs/CODEMAP.md → "Fleet plan").
--
-- Before: a bus's crew lived only on trip rows, and the nightly rollover copied it from that bus's
-- most recent trip. Assigning a driver to one run of bus 44 left him on every other run of bus 37,
-- so the driver portal kept showing bus 37.
--
-- Now there are two standing assignments, edited on two manager pages:
--   * bus → route   : buses.current_route_id (already used by the rollover)
--   * staff → bus   : bus_crew_assignments (one regular driver + conductor per bus; a person is the
--                     regular crew of at most one bus)
-- set_bus_crew() moves the person (removes them from their old bus), and with p_apply_today updates
-- today's runs that have not started: this bus's runs get the new crew, and the person is taken off
-- other buses' unstarted runs (those get that bus's own regular crew, or nobody).
-- set_bus_route() changes the route from the next plan; today's runs are not moved (riders are booked).
-- Per-shift exceptions stay on the dispatch board (manager_update_run).

CREATE TABLE IF NOT EXISTS public.bus_crew_assignments (
  bus_id INTEGER PRIMARY KEY REFERENCES public.buses(id) ON DELETE CASCADE,
  driver_id TEXT REFERENCES public.staff(id) ON DELETE SET NULL,
  conductor_id TEXT REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  CHECK (driver_id IS NULL OR conductor_id IS NULL OR driver_id <> conductor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bus_crew_driver ON public.bus_crew_assignments (driver_id) WHERE driver_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bus_crew_conductor ON public.bus_crew_assignments (conductor_id) WHERE conductor_id IS NOT NULL;
ALTER TABLE public.bus_crew_assignments ENABLE ROW LEVEL SECURITY;

-- Seed from each bus's latest trip so nothing changes until a manager edits it.
INSERT INTO public.bus_crew_assignments (bus_id, driver_id, conductor_id, updated_by)
SELECT DISTINCT ON (t.bus_id) t.bus_id, t.driver_id, t.conductor_id, 'seed'
  FROM public.trips t
 WHERE t.bus_id IS NOT NULL AND (t.driver_id IS NOT NULL OR t.conductor_id IS NOT NULL)
 ORDER BY t.bus_id, t.trip_date DESC, t.started_at DESC NULLS LAST
ON CONFLICT (bus_id) DO NOTHING;
-- The seed can put one person on two buses; keep them on the lowest bus id only (the manager
-- fixes the rest on the crew page).
UPDATE public.bus_crew_assignments a SET driver_id = NULL
  FROM public.bus_crew_assignments b
 WHERE a.driver_id = b.driver_id AND a.bus_id > b.bus_id AND a.updated_by = 'seed';
UPDATE public.bus_crew_assignments a SET conductor_id = NULL
  FROM public.bus_crew_assignments b
 WHERE a.conductor_id = b.conductor_id AND a.bus_id > b.bus_id AND a.updated_by = 'seed';
UPDATE public.bus_crew_assignments a SET conductor_id = NULL
  FROM public.bus_crew_assignments b
 WHERE a.conductor_id = b.driver_id AND a.updated_by = 'seed' AND b.updated_by = 'seed';

CREATE OR REPLACE FUNCTION public.set_bus_crew(
  p_bus_id INTEGER, p_driver_id TEXT, p_conductor_id TEXT, p_apply_today BOOLEAN, p_actor TEXT, p_actor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_driver TEXT := NULLIF(p_driver_id, '');
  v_conductor TEXT := NULLIF(p_conductor_id, '');
  v_moved_from JSONB := '[]'::jsonb;
  v_runs INT := 0;
  v_cleared INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM buses WHERE id = p_bus_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bus not found.');
  END IF;
  IF v_driver IS NOT NULL AND v_driver = v_conductor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The driver and conductor must be different people.');
  END IF;
  IF v_driver IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff WHERE id = v_driver AND role = 'driver' AND is_active IS NOT FALSE) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That driver is not an active driver.');
  END IF;
  IF v_conductor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff WHERE id = v_conductor AND role IN ('conductor', 'driver') AND is_active IS NOT FALSE) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That conductor is not active staff.');
  END IF;

  -- Move people off the bus they were regular crew of.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('bus', b.bus_number, 'staff', x.staff_id)), '[]'::jsonb) INTO v_moved_from
    FROM (
      SELECT bus_id, driver_id AS staff_id FROM bus_crew_assignments WHERE bus_id <> p_bus_id AND driver_id IN (v_driver, v_conductor)
      UNION ALL
      SELECT bus_id, conductor_id FROM bus_crew_assignments WHERE bus_id <> p_bus_id AND conductor_id IN (v_driver, v_conductor)
    ) x JOIN buses b ON b.id = x.bus_id;
  UPDATE bus_crew_assignments
     SET driver_id = CASE WHEN driver_id IN (v_driver, v_conductor) THEN NULL ELSE driver_id END,
         conductor_id = CASE WHEN conductor_id IN (v_driver, v_conductor) THEN NULL ELSE conductor_id END,
         updated_at = now(), updated_by = p_actor
   WHERE bus_id <> p_bus_id AND (driver_id IN (v_driver, v_conductor) OR conductor_id IN (v_driver, v_conductor));

  INSERT INTO bus_crew_assignments (bus_id, driver_id, conductor_id, updated_at, updated_by)
  VALUES (p_bus_id, v_driver, v_conductor, now(), p_actor)
  ON CONFLICT (bus_id) DO UPDATE SET driver_id = EXCLUDED.driver_id, conductor_id = EXCLUDED.conductor_id,
                                     updated_at = now(), updated_by = EXCLUDED.updated_by;

  IF p_apply_today THEN
    -- Other buses' unstarted runs today: take these people off; that bus's own regular crew takes over.
    UPDATE trips t
       SET driver_id = CASE WHEN t.driver_id IN (v_driver, v_conductor) THEN a.driver_id ELSE t.driver_id END,
           conductor_id = CASE WHEN t.conductor_id IN (v_driver, v_conductor) THEN a.conductor_id ELSE t.conductor_id END
      FROM (SELECT b.id, c.driver_id, c.conductor_id FROM buses b LEFT JOIN bus_crew_assignments c ON c.bus_id = b.id) a
     WHERE a.id = t.bus_id
       AND t.trip_date = v_day AND t.bus_id <> p_bus_id
       AND t.status::text IN ('SCHEDULED', 'DELAYED') AND t.started_at IS NULL
       AND (t.driver_id IN (v_driver, v_conductor) OR t.conductor_id IN (v_driver, v_conductor));
    GET DIAGNOSTICS v_cleared = ROW_COUNT;
    -- This bus's unstarted runs today get the new crew.
    UPDATE trips SET driver_id = v_driver, conductor_id = v_conductor
     WHERE bus_id = p_bus_id AND trip_date = v_day
       AND status::text IN ('SCHEDULED', 'DELAYED') AND started_at IS NULL;
    GET DIAGNOSTICS v_runs = ROW_COUNT;
  END IF;

  INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, new_value)
  VALUES (p_actor, p_actor_role, 'BUS_CREW_SET', 'Bus', p_bus_id::text,
          jsonb_build_object('driver_id', v_driver, 'conductor_id', v_conductor, 'apply_today', p_apply_today,
                             'runs_updated', v_runs, 'other_runs_cleared', v_cleared, 'moved_from', v_moved_from));
  RETURN jsonb_build_object('ok', true, 'runsUpdated', v_runs, 'otherRunsChanged', v_cleared, 'movedFrom', v_moved_from);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bus_route(p_bus_id INTEGER, p_route_id TEXT, p_actor TEXT, p_actor_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_route TEXT := NULLIF(p_route_id, '');
  v_old TEXT;
BEGIN
  SELECT current_route_id INTO v_old FROM buses WHERE id = p_bus_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Bus not found.'); END IF;
  IF v_route IS NOT NULL AND NOT EXISTS (SELECT 1 FROM routes WHERE id = v_route AND is_active IS NOT FALSE) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That route is not active.');
  END IF;
  UPDATE buses SET current_route_id = v_route WHERE id = p_bus_id;
  INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, previous_value, new_value)
  VALUES (p_actor, p_actor_role, 'BUS_ROUTE_SET', 'Bus', p_bus_id::text,
          jsonb_build_object('route_id', v_old), jsonb_build_object('route_id', v_route));
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_bus_crew(INTEGER, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_bus_route(INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_bus_crew(INTEGER, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_bus_route(INTEGER, TEXT, TEXT, TEXT) TO service_role;
