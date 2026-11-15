-- Leave early (teacher gate pass). See docs/CODEMAP.md → "Leave early".
-- Needs 20261117_seat_notifications.sql (_ride_label) first.
--
-- Student asks to leave on an earlier outgoing (CAMPUS_TO_HOME) shift today, with a reason.
-- The class teacher (or admin / transport admin / transport manager) reviews it with
-- review_early_departure(), which in one transaction:
--   * books the student on a run of that shift on their own route (most free seats), seat chosen
--     later by the boarding chart like everyone else;
--   * releases their usual outgoing seat for today (cancel_reason LEFT_EARLY);
--   * records the decision and notifies the student.
-- A trigger stops the 5-minute chart from re-adding the usual outgoing seat afterwards.
-- The boarding scan then accepts the student on the early run because they have a booking on it.

ALTER TABLE public.early_departure_requests ADD COLUMN IF NOT EXISTS booked_trip_id TEXT;

-- One open request (PENDING or APPROVED) per student per day. Skipped if old duplicates exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM early_departure_requests
     WHERE status IN ('PENDING', 'APPROVED')
     GROUP BY student_id, request_date HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_early_dep_open_per_day
      ON public.early_departure_requests (student_id, request_date)
      WHERE status IN ('PENDING', 'APPROVED');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.review_early_departure(
  p_request_id UUID, p_approve BOOLEAN, p_remarks TEXT, p_actor TEXT, p_actor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local TIMESTAMP := now() AT TIME ZONE 'Asia/Kolkata';
  v_day DATE := v_local::date;
  v_dow TEXT := to_char(v_local::date, 'FMDAY');
  q RECORD;
  s RECORD;
  v_route TEXT;
  v_campus_stop TEXT;
  v_trip RECORD;
  v_usual_shift TEXT;
  v_user TEXT;
  v_remarks TEXT := NULLIF(btrim(COALESCE(p_remarks, '')), '');
BEGIN
  SELECT * INTO q FROM early_departure_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found.');
  END IF;

  -- Who may decide: managers, or a teacher of the student's class.
  IF p_actor_role NOT IN ('admin', 'transport_admin', 'transport_manager') THEN
    IF p_actor_role NOT IN ('teacher', 'faculty')
       OR NOT EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.class_id::text = q.class_id::text AND ct.teacher_id = p_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only a teacher of this student''s class can decide this request.');
    END IF;
  END IF;

  IF q.status <> 'PENDING' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This request was already ' || lower(q.status) || '.');
  END IF;
  IF q.request_date <> v_day THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This request was for another day.');
  END IF;

  SELECT st.id, st.user_id, st.class_id,
         COALESCE(st.auto_assigned_stop_id, st.primary_stop_id) AS stop_id,
         st.primary_route_id
    INTO s FROM students st WHERE st.id = q.student_id;
  v_user := s.user_id;

  IF NOT p_approve THEN
    UPDATE early_departure_requests
       SET status = 'REJECTED', teacher_id = p_actor, teacher_remarks = v_remarks, reviewed_at = now()
     WHERE id = q.id;
    IF v_user IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, is_read, url)
      VALUES (v_user, 'Leave-early request not approved',
              'Your request to leave early today was not approved.' || COALESCE(' Teacher''s note: ' || v_remarks, '')
                || ' Your usual bus home is unchanged.',
              'LEAVE_EARLY', false, '/portal/leave-early');
    END IF;
    INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, reason)
    VALUES (p_actor, p_actor_role, 'EARLY_DEPARTURE_REJECTED', 'Student', q.student_id, v_remarks);
    RETURN jsonb_build_object('ok', true, 'status', 'REJECTED');
  END IF;

  -- Approve: find a run of the requested shift on the student's route that has not left.
  v_route := COALESCE(s.primary_route_id,
                      (SELECT rs.route_id FROM route_stops rs WHERE rs.stop_id = s.stop_id LIMIT 1));
  IF v_route IS NULL OR s.stop_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The student has no stop or route set, so no bus can be booked.');
  END IF;

  SELECT t.id::text AS id, t.bus_id, t.shift_id::text AS shift_id
    INTO v_trip
    FROM trips t
    JOIN shifts sh ON sh.id = t.shift_id
    LEFT JOIN buses b ON b.id = t.bus_id
   WHERE t.route_id::text = v_route::text
     AND t.shift_id::text = q.shift_id::text
     AND t.trip_date = v_day
     AND t.status::text IN ('SCHEDULED', 'DELAYED')
     AND t.bus_id IS NOT NULL
     AND sh.direction = 'CAMPUS_TO_HOME'
     AND sh.start_time > v_local::time
   ORDER BY COALESCE(b.capacity, 0) - (
              SELECT count(*) FROM bus_reservations x
               WHERE x.trip_id = t.id::text AND x.status NOT IN ('CANCELLED', 'SWITCHED')
            ) DESC,
            t.id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'That bus has already left or is no longer running. Reject this request so the student can pick another bus.');
  END IF;

  -- Same pick-up point the chart uses for rides home.
  SELECT st.id INTO v_campus_stop FROM stops st WHERE st.name ILIKE '%campus%' ORDER BY st.id LIMIT 1;

  -- Book the early run (re-use the row if the student already had one for that shift today).
  INSERT INTO bus_reservations (student_id, trip_id, bus_id, boarding_stop_id, shift_id, reservation_date, assigned_by, status)
  VALUES (q.student_id, v_trip.id, v_trip.bus_id, COALESCE(v_campus_stop, s.stop_id), v_trip.shift_id, v_day, 'MANUAL', 'ASSIGNED')
  ON CONFLICT (student_id, shift_id, reservation_date) DO UPDATE
     SET trip_id = EXCLUDED.trip_id, bus_id = EXCLUDED.bus_id, boarding_stop_id = EXCLUDED.boarding_stop_id,
         status = 'ASSIGNED', cancel_reason = NULL, cancelled_at = NULL, chosen_seat = NULL
   WHERE bus_reservations.status <> 'BOARDED';

  -- Release the usual ride home for today.
  SELECT css.outgoing_shift_id::text INTO v_usual_shift
    FROM class_shift_schedules css
   WHERE css.class_id::text = s.class_id::text AND css.day_of_week = v_dow AND NOT css.is_today_off
   LIMIT 1;
  UPDATE bus_reservations
     SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'LEFT_EARLY', chosen_seat = NULL
   WHERE student_id = q.student_id
     AND reservation_date = v_day
     AND shift_id::text <> v_trip.shift_id
     AND shift_id IN (SELECT id FROM shifts WHERE direction = 'CAMPUS_TO_HOME')
     AND status IN ('ASSIGNED', 'SEAT_SELECTED')
     AND boarded_at IS NULL;

  UPDATE early_departure_requests
     SET status = 'APPROVED', teacher_id = p_actor, teacher_remarks = v_remarks, reviewed_at = now(),
         booked_trip_id = v_trip.id
   WHERE id = q.id;

  IF v_user IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, type, is_read, url)
    VALUES (v_user, 'Leave early approved',
            'You''re booked on ' || COALESCE(_ride_label(v_trip.id, COALESCE(v_campus_stop, s.stop_id)), 'an earlier bus')
              || '. Board it like any other ride; your usual bus home today is released.'
              || COALESCE(' Teacher''s note: ' || v_remarks, ''),
            'LEAVE_EARLY', false, '/portal');
  END IF;
  INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, reason, new_value)
  VALUES (p_actor, p_actor_role, 'EARLY_DEPARTURE_APPROVED', 'Student', q.student_id, v_remarks,
          jsonb_build_object('trip_id', v_trip.id, 'shift_id', v_trip.shift_id, 'usual_shift_id', v_usual_shift));
  RETURN jsonb_build_object('ok', true, 'status', 'APPROVED');
END;
$$;

-- After an approved leave-early, the chart must not add the usual ride home back.
CREATE OR REPLACE FUNCTION public._skip_outgoing_after_leave_early()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_by = 'AI_AUTO'
     AND EXISTS (SELECT 1 FROM shifts sh WHERE sh.id = NEW.shift_id AND sh.direction = 'CAMPUS_TO_HOME')
     AND EXISTS (
       SELECT 1 FROM early_departure_requests q
        WHERE q.student_id = NEW.student_id
          AND q.request_date = NEW.reservation_date
          AND q.status = 'APPROVED'
          AND q.shift_id::text IS DISTINCT FROM NEW.shift_id::text
     ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skip_outgoing_after_leave_early ON public.bus_reservations;
CREATE TRIGGER trg_skip_outgoing_after_leave_early
  BEFORE INSERT ON public.bus_reservations
  FOR EACH ROW EXECUTE FUNCTION public._skip_outgoing_after_leave_early();

REVOKE ALL ON FUNCTION public.review_early_departure(UUID, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_early_departure(UUID, BOOLEAN, TEXT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public._skip_outgoing_after_leave_early() FROM PUBLIC, anon, authenticated;
