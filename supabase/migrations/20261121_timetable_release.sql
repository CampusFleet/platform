-- Same-day timetable changes (see docs/CODEMAP.md → "Shift and timetable changes").
--
-- When a class's timetable for TODAY is switched off, or its incoming/outgoing shift is changed,
-- the boarding chart already booked its students on the old shift. release_off_timetable_seats()
-- releases those seats in one statement and tells each student:
--   * only today's seats the chart made (assigned_by = 'AI_AUTO'): leave-early and manager bookings stay;
--   * only seats not boarded, on runs whose final chart is not locked yet;
--   * only shifts that are no longer the class's incoming or outgoing shift today.
-- The 5-minute chart then books them on the new shift (if the class still rides today).
-- Switching back revives the seats released earlier (see below).
-- Needs 20261117_seat_notifications.sql (_ride_label).

CREATE OR REPLACE FUNCTION public.release_off_timetable_seats(p_class_ids TEXT[], p_actor TEXT, p_actor_role TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local TIMESTAMP := now() AT TIME ZONE 'Asia/Kolkata';
  v_day DATE := v_local::date;
  v_dow TEXT := to_char(v_local::date, 'FMDAY');
  v_count INT := 0;
  v_revived INT := 0;
BEGIN
  -- Switched back: seats this function released earlier today whose shift is in the timetable
  -- again become ASSIGNED again (the unique (student, shift, date) row would otherwise stop the
  -- chart from re-booking them). Seat numbers are given again by the chart.
  UPDATE bus_reservations r
     SET status = 'ASSIGNED', cancel_reason = NULL, cancelled_at = NULL
    FROM students s, trips t, class_shift_schedules css
   WHERE s.id = r.student_id
     AND t.id::text = r.trip_id
     AND css.class_id::text = s.class_id::text AND css.day_of_week = v_dow
     AND s.class_id::text = ANY (p_class_ids)
     AND r.reservation_date = v_day
     AND r.status = 'CANCELLED' AND r.cancel_reason = 'TIMETABLE_CHANGED'
     AND NOT css.is_today_off
     AND r.shift_id::text IN (COALESCE(css.incoming_shift_id::text, ''), COALESCE(css.outgoing_shift_id::text, ''))
     AND t.status::text <> 'CANCELLED'
     AND NOT COALESCE(t.manifest_locked, false);
  GET DIAGNOSTICS v_revived = ROW_COUNT;

  WITH stale AS (
    SELECT r.id, r.trip_id, r.boarding_stop_id, s.user_id, css.is_today_off
      FROM bus_reservations r
      JOIN students s ON s.id = r.student_id
      JOIN trips t ON t.id::text = r.trip_id
      LEFT JOIN class_shift_schedules css
        ON css.class_id::text = s.class_id::text AND css.day_of_week = v_dow
     WHERE s.class_id::text = ANY (p_class_ids)
       AND r.reservation_date = v_day
       AND r.assigned_by = 'AI_AUTO'
       AND r.status IN ('ASSIGNED', 'SEAT_SELECTED')
       AND r.boarded_at IS NULL
       AND NOT COALESCE(t.manifest_locked, false)
       AND (css.class_id IS NULL
            OR css.is_today_off
            OR r.shift_id::text NOT IN (COALESCE(css.incoming_shift_id::text, ''), COALESCE(css.outgoing_shift_id::text, '')))
     FOR UPDATE OF r
  ), released AS (
    UPDATE bus_reservations r
       SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'TIMETABLE_CHANGED', chosen_seat = NULL
      FROM stale
     WHERE r.id = stale.id
    RETURNING stale.user_id, stale.trip_id, stale.boarding_stop_id, stale.is_today_off
  ), told AS (
    INSERT INTO notifications (user_id, title, message, type, is_read, url)
    SELECT user_id,
           'Your bus today changed',
           CASE WHEN is_today_off
                THEN 'Your class has no transport today, so your seat on ' || COALESCE(_ride_label(trip_id, boarding_stop_id), 'the bus') || ' was released.'
                ELSE 'Your class timetable changed today, so your seat on ' || COALESCE(_ride_label(trip_id, boarding_stop_id), 'the bus') || ' was released. You''ll be put on the new bus in a few minutes.'
           END,
           'SEAT_RELEASED', false, '/portal'
      FROM released
     WHERE user_id IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM released;

  IF v_count > 0 THEN
    INSERT INTO audit_logs (user_id, user_role, action, entity, entity_id, reason, new_value)
    VALUES (p_actor, p_actor_role, 'TIMETABLE_SEATS_RELEASED', 'Class', array_to_string(p_class_ids, ','),
            format('%s seat(s) released after a same-day timetable change', v_count),
            jsonb_build_object('released', v_count, 'revived', v_revived, 'date', v_day));
  END IF;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_off_timetable_seats(TEXT[], TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_off_timetable_seats(TEXT[], TEXT, TEXT) TO service_role;
