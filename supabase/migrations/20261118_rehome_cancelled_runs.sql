-- Move students off a cancelled run (see docs/CODEMAP.md → "Boarding chart").
--
-- Problem: bus_reservations is unique per (student, shift, date). When a manager cancels a run, its
-- reservations become CANCELLED / RUN_CANCELLED, and boarding_chart_tick's ON CONFLICT DO NOTHING then
-- skips those students for every other run on that shift and day.
--
-- Fix: a RUN_CANCELLED reservation is moved to another run on the SAME route, shift and day when one
-- exists (or appears later), as long as that run's final chart is not locked yet.
--   * At cancel time: _notify_seat_change tries the move first; the student gets "moved" instead of
--     "cancelled" when it works.
--   * Later: a new run, a bus assigned to a run, or the 5-minute cron moves anyone still waiting.
-- Only RUN_CANCELLED rows move. Seats the student gave up, or lost by not confirming, stay cancelled.
-- Another route is never chosen (its stops may not include the student's).
-- The run with the most free seats wins. If that bus is full the student is still added; they get no
-- seat (assignTripSeats stops at capacity) and show as unseated to the conductor.

-- Move one reservation. Returns true when it was moved (and the student notified).
CREATE OR REPLACE FUNCTION public._rehome_reservation(p_res_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local TIMESTAMP := now() AT TIME ZONE 'Asia/Kolkata';
  r RECORD;
  v_route TEXT;
  v_target RECORD;
  v_user TEXT;
BEGIN
  SELECT * INTO r FROM bus_reservations
   WHERE id = p_res_id AND status = 'CANCELLED' AND cancel_reason = 'RUN_CANCELLED' AND boarded_at IS NULL
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR r.reservation_date < v_local::date THEN
    RETURN false;
  END IF;
  SELECT route_id::text INTO v_route FROM trips WHERE id::text = r.trip_id;
  IF v_route IS NULL THEN
    RETURN false;
  END IF;

  SELECT t.id::text AS id, t.bus_id
    INTO v_target
    FROM trips t
    JOIN shifts sh ON sh.id = t.shift_id
    LEFT JOIN buses b ON b.id = t.bus_id
   WHERE t.route_id::text = v_route
     AND t.shift_id::text = r.shift_id::text
     AND t.trip_date = r.reservation_date
     AND t.id::text <> r.trip_id
     AND t.status::text <> 'CANCELLED'
     AND NOT COALESCE(t.manifest_locked, false)
     AND t.bus_id IS NOT NULL
     -- before that run's final chart (today); any time for a later day
     AND (r.reservation_date > v_local::date
          OR (sh.start_time IS NOT NULL
              AND v_local::time < sh.start_time - make_interval(mins => COALESCE(sh.booking_cutoff_minutes, 30))))
   ORDER BY COALESCE(b.capacity, 0) - (
              SELECT count(*) FROM bus_reservations x
               WHERE x.trip_id = t.id::text AND x.status NOT IN ('CANCELLED', 'SWITCHED')
            ) DESC,
            t.id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE bus_reservations
     SET trip_id = v_target.id, bus_id = v_target.bus_id, status = 'ASSIGNED',
         cancel_reason = NULL, cancelled_at = NULL, chosen_seat = NULL
   WHERE id = r.id;

  SELECT user_id INTO v_user FROM students WHERE id = r.student_id;
  IF v_user IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, type, is_read, url)
    VALUES (v_user, 'You''ve been moved to another bus',
            'Your run was cancelled, so you''re now on ' || COALESCE(_ride_label(v_target.id, r.boarding_stop_id), 'another bus') || '.',
            'SEAT_MOVED', false, '/portal');
  END IF;
  RETURN true;
END;
$$;

-- Move everyone still waiting (today and later). Returns how many moved.
CREATE OR REPLACE FUNCTION public.rehome_cancelled_riders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_moved INT := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM bus_reservations
     WHERE status = 'CANCELLED' AND cancel_reason = 'RUN_CANCELLED' AND boarded_at IS NULL
       AND reservation_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
     ORDER BY reservation_date, cancelled_at
  LOOP
    IF _rehome_reservation(v_id) THEN
      v_moved := v_moved + 1;
    END IF;
  END LOOP;
  RETURN v_moved;
END;
$$;

-- At cancel time: try the move before telling the student their bus is gone.
CREATE OR REPLACE FUNCTION public._notify_seat_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_label TEXT;
  v_cutoff TEXT;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' AND NEW.cancel_reason = 'RUN_CANCELLED' THEN
    IF _rehome_reservation(NEW.id) THEN
      RETURN NEW; -- moved; the "moved" notification is already written
    END IF;
  END IF;

  SELECT user_id INTO v_user FROM students WHERE id = NEW.student_id;
  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;
  v_label := COALESCE(_ride_label(NEW.trip_id, NEW.boarding_stop_id), 'your bus home');

  IF NEW.needs_confirmation AND NOT COALESCE(OLD.needs_confirmation, false) THEN
    SELECT to_char(sh.start_time - make_interval(mins => COALESCE(sh.booking_cutoff_minutes, 30)), 'HH12:MI AM')
      INTO v_cutoff FROM shifts sh WHERE sh.id = NEW.shift_id;
    INSERT INTO notifications (user_id, title, message, type, is_read, url)
    VALUES (v_user, 'Do you need the bus home today?',
            'You missed the morning bus. Open My Commute and confirm your seat on ' || v_label
              || COALESCE(' before ' || v_cutoff, '') || ', or it will be released.',
            'SEAT_CONFIRM', false, '/portal');
  ELSIF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
    IF NEW.cancel_reason = 'NOT_CONFIRMED_AFTER_ABSENCE' THEN
      INSERT INTO notifications (user_id, title, message, type, is_read, url)
      VALUES (v_user, 'Your seat home was released',
              'You didn''t confirm in time, so your seat on ' || v_label || ' was released. Contact the transport office if you still need a ride.',
              'SEAT_RELEASED', false, '/portal');
    ELSIF NEW.cancel_reason = 'RUN_CANCELLED' THEN
      INSERT INTO notifications (user_id, title, message, type, is_read, url)
      VALUES (v_user, 'Your bus was cancelled',
              'The transport office cancelled ' || v_label || '. If another bus is added on your route before boarding closes, you''ll be moved to it automatically.',
              'SEAT_RELEASED', false, '/portal');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Later: a run is added, gets a bus, or is changed → move anyone waiting.
CREATE OR REPLACE FUNCTION public._rehome_after_trip_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM rehome_cancelled_riders();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_rehome_after_trip_insert ON public.trips;
CREATE TRIGGER trg_rehome_after_trip_insert
  AFTER INSERT ON public.trips
  FOR EACH STATEMENT EXECUTE FUNCTION public._rehome_after_trip_change();

DROP TRIGGER IF EXISTS trg_rehome_after_trip_bus ON public.trips;
CREATE TRIGGER trg_rehome_after_trip_bus
  AFTER UPDATE OF bus_id ON public.trips
  FOR EACH STATEMENT EXECUTE FUNCTION public._rehome_after_trip_change();

-- Backup: every 5 minutes (also catches a run whose chart time is still open after a restart).
SELECT cron.unschedule('rehome-cancelled-riders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rehome-cancelled-riders');
SELECT cron.schedule('rehome-cancelled-riders', '*/5 * * * *', $cron$SELECT public.rehome_cancelled_riders()$cron$);

REVOKE ALL ON FUNCTION public._rehome_reservation(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rehome_cancelled_riders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rehome_after_trip_change() FROM PUBLIC, anon, authenticated;
