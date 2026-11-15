-- Seat notifications (see docs/CODEMAP.md → "Notifications").
--
-- Triggers write rows into public.notifications when:
--   1. A trip's final boarding chart is ready (trips.manifest_locked false → true):
--      every student and teacher still on the trip is told their bus, shift, route and departure time.
--   2. A student missed the morning bus and must confirm the ride home
--      (bus_reservations.needs_confirmation false → true).
--   3. A seat is released by the system (bus_reservations.status → CANCELLED with
--      cancel_reason NOT_CONFIRMED_AFTER_ABSENCE or RUN_CANCELLED).
-- Student-initiated cancellations have no cancel_reason and are not notified here.
-- Messages use public labels only (bus number, shift name, route name, time); never trip codes.
-- notifications.user_id is users.id (students: students.user_id).

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS url TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);

-- Older API routes (payments, boarding scan, roaming, bookings cancel) insert the student id
-- (students.id) as user_id, so those rows never reached the student. Map a student id to the
-- student's user id on insert, and fix rows already written.
CREATE OR REPLACE FUNCTION public._notifications_owner_fix()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id::text) THEN
    SELECT user_id INTO v_user FROM students WHERE id = NEW.user_id::text;
    IF v_user IS NOT NULL THEN
      NEW.user_id := v_user;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_owner_fix ON public.notifications;
CREATE TRIGGER trg_notifications_owner_fix
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public._notifications_owner_fix();

UPDATE public.notifications n
   SET user_id = s.user_id
  FROM public.students s
 WHERE n.user_id::text = s.id
   AND s.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = n.user_id::text);

-- "Bus 37 · Morning Pick-Up · Ganna Center Corridor · leaves Laldant at 07:45 AM"
CREATE OR REPLACE FUNCTION public._ride_label(p_trip_id TEXT, p_stop_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT concat_ws(' · ',
           CASE WHEN b.bus_number IS NOT NULL THEN 'Bus ' || b.bus_number ELSE 'Bus not assigned yet' END,
           NULLIF(sh.name, ''),
           NULLIF(r.name, ''),
           CASE WHEN sh.start_time IS NOT NULL THEN
             concat('leaves ', COALESCE(st.name || ' ', ''), 'at ',
                    to_char(sh.start_time + make_interval(mins => COALESCE(rs.arrival_offset_minutes, 0)), 'HH12:MI AM'))
           END)
  FROM trips t
  LEFT JOIN buses b ON b.id = t.bus_id
  LEFT JOIN shifts sh ON sh.id = t.shift_id
  LEFT JOIN routes r ON r.id = t.route_id
  LEFT JOIN stops st ON st.id = p_stop_id
  LEFT JOIN LATERAL (
    SELECT x.arrival_offset_minutes FROM route_stops x
     WHERE x.route_id = t.route_id AND x.stop_id = p_stop_id
     ORDER BY x.stop_order LIMIT 1
  ) rs ON true
  WHERE t.id = p_trip_id;
$$;

-- 1. Final chart ready.
CREATE OR REPLACE FUNCTION public._notify_chart_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (user_id, title, message, type, is_read, url)
  SELECT s.user_id,
         'Boarding chart ready',
         'You''re on the bus today: ' || COALESCE(_ride_label(NEW.id, r.boarding_stop_id), 'your bus') || '.',
         'CHART_READY', false, '/portal'
    FROM bus_reservations r
    JOIN students s ON s.id = r.student_id
   WHERE r.trip_id = NEW.id
     AND r.status NOT IN ('CANCELLED', 'SWITCHED', 'ABSENT')
     AND s.user_id IS NOT NULL;

  INSERT INTO notifications (user_id, title, message, type, is_read, url)
  SELECT tr.user_id,
         'Boarding chart ready',
         'You''re on the bus today: ' || COALESCE(_ride_label(NEW.id, tr.boarding_stop_id), 'your bus') || '.',
         'CHART_READY', false, '/teacher'
    FROM teacher_reservations tr
   WHERE tr.trip_id = NEW.id
     AND tr.status <> 'CANCELLED';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chart_ready ON public.trips;
CREATE TRIGGER trg_notify_chart_ready
  AFTER UPDATE OF manifest_locked ON public.trips
  FOR EACH ROW
  WHEN (NEW.manifest_locked AND NOT COALESCE(OLD.manifest_locked, false) AND NEW.status IS DISTINCT FROM 'CANCELLED')
  EXECUTE FUNCTION public._notify_chart_ready();

-- 2 + 3. Confirmation needed / seat released.
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
              'The transport office cancelled ' || v_label || '. Contact them for another ride.',
              'SEAT_RELEASED', false, '/portal');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_seat_change ON public.bus_reservations;
CREATE TRIGGER trg_notify_seat_change
  AFTER UPDATE OF needs_confirmation, status ON public.bus_reservations
  FOR EACH ROW
  WHEN ((NEW.needs_confirmation AND NOT COALESCE(OLD.needs_confirmation, false))
     OR (NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED'
         AND NEW.cancel_reason IN ('NOT_CONFIRMED_AFTER_ABSENCE', 'RUN_CANCELLED')))
  EXECUTE FUNCTION public._notify_seat_change();

REVOKE ALL ON FUNCTION public._notifications_owner_fix() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ride_label(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._notify_chart_ready() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._notify_seat_change() FROM PUBLIC, anon, authenticated;
