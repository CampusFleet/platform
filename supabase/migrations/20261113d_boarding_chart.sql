-- Two-stage boarding chart (see docs/CODEMAP.md → "Boarding chart").
--
-- boarding_chart_tick() runs every 5 minutes (pg_cron) and is idempotent:
--   1. Provisional chart: every paid, non-suspended student whose class has today's shift gets a
--      reservation on the trip for their route (ON CONFLICT DO NOTHING: never duplicates, never
--      resurrects a seat the student gave up).
--   2. Close: after a shift ends, unboarded reservations become ABSENT.
--   3. Absent in the morning → that student's evening reservation needs_confirmation = true.
--      My Commute shows a popup; respond_outgoing_seat() records the answer.
--   4. Final chart at (departure − shifts.booking_cutoff_minutes): unconfirmed seats are released
--      and trips.manifest_locked = true.
-- Times are IST.

ALTER TABLE public.bus_reservations
  ADD COLUMN IF NOT EXISTS needs_confirmation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rider_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_bus_reservations_date_shift ON public.bus_reservations (reservation_date, shift_id);
CREATE INDEX IF NOT EXISTS idx_trips_date_shift ON public.trips (trip_date, shift_id);

CREATE OR REPLACE FUNCTION public.boarding_chart_tick(p_now TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  v_local TIMESTAMP := p_now AT TIME ZONE 'Asia/Kolkata';
  v_day DATE := v_local::date;
  v_time TIME := v_local::time;
  v_dow TEXT := to_char(v_local::date, 'FMDAY');
  v_provisional INT := 0;
  v_absent INT := 0;
  v_flagged INT := 0;
  v_released INT := 0;
  v_locked INT := 0;
BEGIN
  -- 1. Provisional chart for today's trips that are not locked yet.
  INSERT INTO bus_reservations (student_id, trip_id, bus_id, boarding_stop_id, shift_id, reservation_date, assigned_by, status)
  SELECT DISTINCT ON (s.id, t.shift_id)
         s.id, t.id, t.bus_id,
         CASE WHEN sh.direction = 'CAMPUS_TO_HOME' THEN COALESCE(cs.id, s.stop_id) ELSE s.stop_id END,
         t.shift_id, v_day, 'AI_AUTO', 'ASSIGNED'
  FROM trips t
  JOIN shifts sh ON sh.id = t.shift_id AND sh.is_active
  JOIN (
    SELECT sf.id, sf.class_id,
           COALESCE(sf.auto_assigned_stop_id, sf.primary_stop_id) AS stop_id,
           COALESCE(sf.primary_route_id,
                    (SELECT rs.route_id FROM route_stops rs
                      WHERE rs.stop_id = COALESCE(sf.auto_assigned_stop_id, sf.primary_stop_id) LIMIT 1)) AS route_id
    FROM students_full sf
    WHERE NOT COALESCE(sf.transport_access_suspended, false)
      AND (sf.has_active_subscription OR sf.payment_status IN ('APPROVED', 'COMPLETED'))
      AND (sf.subscription_expiry_date IS NULL OR sf.subscription_expiry_date::date >= v_day)
  ) s ON s.route_id = t.route_id AND s.stop_id IS NOT NULL
  JOIN class_shift_schedules css
    ON css.class_id = s.class_id AND css.day_of_week = v_dow AND NOT css.is_today_off
   AND t.shift_id IN (css.incoming_shift_id, css.outgoing_shift_id)
  LEFT JOIN LATERAL (SELECT st.id FROM stops st WHERE st.name ILIKE '%campus%' ORDER BY st.id LIMIT 1) cs ON true
  WHERE t.trip_date = v_day
    AND t.status <> 'CANCELLED'
    AND NOT COALESCE(t.manifest_locked, false)
    AND t.bus_id IS NOT NULL
    -- only before the final-chart time; never build a chart for a shift that already left
    AND sh.start_time IS NOT NULL
    AND v_time < sh.start_time - make_interval(mins => COALESCE(sh.booking_cutoff_minutes, 30))
  ORDER BY s.id, t.shift_id, t.id
  ON CONFLICT (student_id, shift_id, reservation_date) DO NOTHING;
  GET DIAGNOSTICS v_provisional = ROW_COUNT;

  -- 2. Close finished shifts (today after end time, and any earlier day).
  UPDATE bus_reservations r
     SET status = 'ABSENT'
    FROM shifts sh
   WHERE r.shift_id = sh.id
     AND r.status IN ('ASSIGNED', 'SEAT_SELECTED')
     AND r.boarded_at IS NULL
     AND (r.reservation_date < v_day OR (r.reservation_date = v_day AND sh.end_time IS NOT NULL AND sh.end_time <= v_time));
  GET DIAGNOSTICS v_absent = ROW_COUNT;

  -- 3. Absent on the incoming trip → evening seat must be confirmed by the student.
  UPDATE bus_reservations o
     SET needs_confirmation = true
    FROM bus_reservations i
    JOIN shifts si ON si.id = i.shift_id AND si.direction = 'HOME_TO_CAMPUS'
   WHERE i.student_id = o.student_id
     AND i.reservation_date = v_day
     AND i.status = 'ABSENT'
     AND o.reservation_date = v_day
     AND o.shift_id <> i.shift_id
     AND o.shift_id IN (SELECT id FROM shifts WHERE direction = 'CAMPUS_TO_HOME')
     AND o.status IN ('ASSIGNED', 'SEAT_SELECTED')
     AND o.boarded_at IS NULL
     AND o.rider_confirmed_at IS NULL
     AND NOT o.needs_confirmation;
  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  -- 4. Final chart for shifts whose cutoff has passed.
  WITH due AS (
    SELECT id FROM shifts
     WHERE start_time IS NOT NULL
       AND start_time > make_interval(mins => COALESCE(booking_cutoff_minutes, 30))::time
       AND v_time >= start_time - make_interval(mins => COALESCE(booking_cutoff_minutes, 30))
  )
  UPDATE bus_reservations r
     SET status = 'CANCELLED', cancelled_at = p_now, cancel_reason = 'NOT_CONFIRMED_AFTER_ABSENCE'
   WHERE r.reservation_date = v_day
     AND r.shift_id IN (SELECT id FROM due)
     AND r.needs_confirmation
     AND r.rider_confirmed_at IS NULL
     AND r.status IN ('ASSIGNED', 'SEAT_SELECTED')
     AND r.boarded_at IS NULL;
  GET DIAGNOSTICS v_released = ROW_COUNT;

  UPDATE trips t
     SET manifest_locked = true, manifest_locked_at = p_now
    FROM shifts sh
   WHERE t.shift_id = sh.id
     AND t.trip_date = v_day
     AND NOT COALESCE(t.manifest_locked, false)
     AND t.status <> 'CANCELLED'
     AND sh.start_time IS NOT NULL
     AND sh.start_time > make_interval(mins => COALESCE(sh.booking_cutoff_minutes, 30))::time
     AND v_time >= sh.start_time - make_interval(mins => COALESCE(sh.booking_cutoff_minutes, 30));
  GET DIAGNOSTICS v_locked = ROW_COUNT;

  IF v_locked > 0 OR v_released > 0 THEN
    INSERT INTO audit_logs (user_role, action, entity, entity_id, reason, new_value)
    VALUES ('system', 'BOARDING_CHART_FINALIZED', 'Trip', v_day::text,
            format('%s trip(s) locked, %s unconfirmed seat(s) released', v_locked, v_released),
            jsonb_build_object('locked', v_locked, 'released', v_released));
  END IF;

  RETURN jsonb_build_object('date', v_day, 'time', v_time, 'provisional', v_provisional,
                            'absent', v_absent, 'flagged', v_flagged, 'released', v_released, 'locked', v_locked);
END;
$$;

-- Student answers the "do you still need the bus home?" popup.
CREATE OR REPLACE FUNCTION public.respond_outgoing_seat(p_student_id TEXT, p_confirm BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_res RECORD;
BEGIN
  SELECT r.id, COALESCE(t.manifest_locked, false) AS locked
    INTO v_res
    FROM bus_reservations r
    LEFT JOIN trips t ON t.id = r.trip_id
   WHERE r.student_id = p_student_id
     AND r.reservation_date = v_day
     AND r.needs_confirmation
     AND r.rider_confirmed_at IS NULL
     AND r.status IN ('ASSIGNED', 'SEAT_SELECTED')
   ORDER BY r.created_at DESC
   LIMIT 1
   FOR UPDATE OF r;

  IF v_res.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOTHING_PENDING');
  END IF;
  IF v_res.locked THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHART_FINAL');
  END IF;

  IF p_confirm THEN
    UPDATE bus_reservations SET rider_confirmed_at = now(), needs_confirmation = false WHERE id = v_res.id;
  ELSE
    UPDATE bus_reservations
       SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'RIDER_DECLINED', needs_confirmation = false
     WHERE id = v_res.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'confirmed', p_confirm);
END;
$$;

REVOKE ALL ON FUNCTION public.boarding_chart_tick(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_outgoing_seat(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.boarding_chart_tick(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_outgoing_seat(TEXT, BOOLEAN) TO service_role;

-- Schedule (Vercel Hobby only allows daily crons, so the frequent tick runs inside Postgres).
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('boarding-chart-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'boarding-chart-tick');
SELECT cron.schedule('boarding-chart-tick', '*/5 * * * *', $cron$SELECT public.boarding_chart_tick()$cron$);
