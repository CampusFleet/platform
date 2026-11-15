-- Transport manager dispatch (src/lib/manager/dispatch.ts → /api/transport-manager/dispatch).
-- Each function is one transaction: the run, its riders and the audit log change together.
--
-- manager_update_run  : change a run's bus and/or crew. Refuses a bus, driver or conductor already on
--                       another run that overlaps in time (shift times + 20 min turnaround). A new bus
--                       clears seats of riders not yet on board, so the chart re-seats them for that bus.
-- manager_add_run     : extra run (route + shift + date), e.g. a second bus for a crowded shift.
-- manager_cancel_run  : cancels a run that has not started; riders not on board are released.

CREATE OR REPLACE FUNCTION public._dispatch_overlaps(p_date DATE, p_trip_id TEXT, p_shift_id TEXT, p_column TEXT, p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_start TIME; v_end TIME; v_hit TEXT;
BEGIN
  IF p_value IS NULL OR p_value = '' THEN RETURN NULL; END IF;
  SELECT start_time, COALESCE(end_time, start_time + interval '90 minutes') INTO v_start, v_end FROM shifts WHERE id::text = p_shift_id;
  IF v_start IS NULL THEN RETURN NULL; END IF;
  EXECUTE format(
    'SELECT COALESCE(sh.name, ''another run'') FROM trips t JOIN shifts sh ON sh.id = t.shift_id
      WHERE t.trip_date = $1 AND t.id::text <> $2 AND t.status::text NOT IN (''CANCELLED'', ''COMPLETED'')
        AND t.%I::text = $3
        AND sh.start_time < $5 + interval ''20 minutes''
        AND $4 < COALESCE(sh.end_time, sh.start_time + interval ''90 minutes'') + interval ''20 minutes''
      LIMIT 1', p_column)
    INTO v_hit USING p_date, p_trip_id, p_value, v_start, v_end;
  RETURN v_hit;
END;
$$;

CREATE OR REPLACE FUNCTION public.manager_update_run(
  p_trip_id TEXT, p_bus_id INTEGER, p_driver_id TEXT, p_conductor_id TEXT, p_actor TEXT, p_actor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD; v_hit TEXT; v_released INT := 0;
BEGIN
  SELECT * INTO t FROM trips WHERE id::text = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Run not found.'); END IF;
  IF t.status::text IN ('COMPLETED', 'CANCELLED') THEN RETURN jsonb_build_object('ok', false, 'error', 'This run has ended.'); END IF;

  IF p_driver_id IS NOT NULL AND p_driver_id <> '' AND NOT EXISTS (SELECT 1 FROM staff WHERE id::text = p_driver_id AND role = 'driver' AND COALESCE(is_active, true)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only an active driver can drive.');
  END IF;
  IF p_conductor_id IS NOT NULL AND p_conductor_id <> '' AND NOT EXISTS (SELECT 1 FROM staff WHERE id::text = p_conductor_id AND role IN ('conductor', 'driver') AND COALESCE(is_active, true)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only an active conductor (or driver) can be the conductor.');
  END IF;
  IF p_driver_id IS NOT NULL AND p_driver_id <> '' AND p_driver_id = p_conductor_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The driver and the conductor must be different people.');
  END IF;

  v_hit := _dispatch_overlaps(t.trip_date, p_trip_id, t.shift_id::text, 'bus_id', p_bus_id::text);
  IF v_hit IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', format('That bus is already on %s at that time.', v_hit)); END IF;
  v_hit := _dispatch_overlaps(t.trip_date, p_trip_id, t.shift_id::text, 'driver_id', p_driver_id);
  IF v_hit IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', format('That driver is already on %s at that time.', v_hit)); END IF;
  v_hit := _dispatch_overlaps(t.trip_date, p_trip_id, t.shift_id::text, 'conductor_id', p_conductor_id);
  IF v_hit IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', format('That conductor is already on %s at that time.', v_hit)); END IF;

  IF p_bus_id IS DISTINCT FROM t.bus_id THEN
    IF t.status::text = 'IN_PROGRESS' THEN RETURN jsonb_build_object('ok', false, 'error', 'Change the bus before the run starts.'); END IF;
    UPDATE bus_reservations SET bus_id = p_bus_id, chosen_seat = CASE WHEN status = 'BOARDED' THEN chosen_seat ELSE NULL END
     WHERE trip_id::text = p_trip_id AND status NOT IN ('CANCELLED');
    GET DIAGNOSTICS v_released = ROW_COUNT;
    UPDATE teacher_reservations SET bus_id = p_bus_id, chosen_seat = CASE WHEN status = 'BOARDED' THEN chosen_seat ELSE NULL END
     WHERE trip_id = p_trip_id AND status <> 'CANCELLED';
  END IF;

  UPDATE trips SET bus_id = p_bus_id,
                   driver_id = NULLIF(p_driver_id, ''),
                   conductor_id = NULLIF(p_conductor_id, '')
   WHERE id::text = p_trip_id;

  INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, previous_value, new_value, reason)
  VALUES (p_actor, p_actor_role, 'RUN_UPDATED', 'Trip', p_trip_id,
          jsonb_build_object('bus_id', t.bus_id, 'driver_id', t.driver_id, 'conductor_id', t.conductor_id),
          jsonb_build_object('bus_id', p_bus_id, 'driver_id', p_driver_id, 'conductor_id', p_conductor_id),
          'Bus / crew changed by transport manager');
  RETURN jsonb_build_object('ok', true, 'reseated', v_released);
END;
$$;

CREATE OR REPLACE FUNCTION public.manager_add_run(
  p_trip_id TEXT, p_date DATE, p_route_id TEXT, p_shift_id TEXT, p_bus_id INTEGER, p_driver_id TEXT, p_conductor_id TEXT, p_actor TEXT, p_actor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hit TEXT; v_code TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM routes WHERE id::text = p_route_id) THEN RETURN jsonb_build_object('ok', false, 'error', 'Route not found.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM shifts WHERE id::text = p_shift_id AND is_active) THEN RETURN jsonb_build_object('ok', false, 'error', 'Shift not found.'); END IF;
  v_hit := _dispatch_overlaps(p_date, p_trip_id, p_shift_id, 'bus_id', p_bus_id::text);
  IF v_hit IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', format('That bus is already on %s at that time.', v_hit)); END IF;
  v_hit := _dispatch_overlaps(p_date, p_trip_id, p_shift_id, 'driver_id', p_driver_id);
  IF v_hit IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', format('That driver is already on %s at that time.', v_hit)); END IF;
  v_hit := _dispatch_overlaps(p_date, p_trip_id, p_shift_id, 'conductor_id', p_conductor_id);
  IF v_hit IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', format('That conductor is already on %s at that time.', v_hit)); END IF;

  v_code := 'TRIP-X-' || to_char(p_date, 'YYYYMMDD') || '-' || substr(md5(p_trip_id), 1, 6);
  INSERT INTO trips (id, trip_code, route_id, bus_id, shift_id, driver_id, conductor_id, trip_date, status, delay_minutes, manifest_locked, current_stop_index)
  VALUES (p_trip_id, v_code, p_route_id, p_bus_id, p_shift_id, NULLIF(p_driver_id, ''), NULLIF(p_conductor_id, ''), p_date, 'SCHEDULED', 0, false, 0);

  INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, new_value, reason)
  VALUES (p_actor, p_actor_role, 'RUN_ADDED', 'Trip', p_trip_id,
          jsonb_build_object('route_id', p_route_id, 'shift_id', p_shift_id, 'bus_id', p_bus_id, 'date', p_date), 'Extra run added by transport manager');
  RETURN jsonb_build_object('ok', true, 'tripId', p_trip_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.manager_cancel_run(p_trip_id TEXT, p_reason TEXT, p_actor TEXT, p_actor_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD; v_released INT := 0;
BEGIN
  SELECT * INTO t FROM trips WHERE id::text = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Run not found.'); END IF;
  IF t.status::text <> 'SCHEDULED' AND t.status::text <> 'DELAYED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only a run that has not started can be cancelled.');
  END IF;
  UPDATE trips SET status = 'CANCELLED' WHERE id::text = p_trip_id;
  UPDATE bus_reservations SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'RUN_CANCELLED', chosen_seat = NULL
   WHERE trip_id::text = p_trip_id AND status NOT IN ('CANCELLED', 'BOARDED');
  GET DIAGNOSTICS v_released = ROW_COUNT;
  UPDATE teacher_reservations SET status = 'CANCELLED', chosen_seat = NULL WHERE trip_id = p_trip_id AND status = 'ASSIGNED';
  INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, reason)
  VALUES (p_actor, p_actor_role, 'RUN_CANCELLED', 'Trip', p_trip_id, COALESCE(NULLIF(p_reason, ''), 'Cancelled by transport manager'));
  RETURN jsonb_build_object('ok', true, 'released', v_released);
END;
$$;

REVOKE ALL ON FUNCTION public.manager_update_run(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manager_add_run(TEXT, DATE, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manager_cancel_run(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manager_update_run(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.manager_add_run(TEXT, DATE, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.manager_cancel_run(TEXT, TEXT, TEXT, TEXT) TO service_role;
