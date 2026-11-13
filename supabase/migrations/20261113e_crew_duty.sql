-- Crew duty: link crew logins to their staff rows, and record conductor attendance atomically.
--
-- trips.driver_id / trips.conductor_id reference staff(id) (set by the transport manager / rollover).
-- Most crew staff rows had no user_id, so a signed-in driver or conductor could not be matched to
-- their trips. Seeded crew users follow the pattern usr-drv-bus-<n> ↔ staff-drv-<nn>.

UPDATE public.staff s
   SET user_id = u.id
  FROM public.users u
 WHERE s.user_id IS NULL
   AND s.id ~ '^staff-(drv|cnd)-'
   AND u.id = 'usr-' || split_part(s.id, '-', 2) || '-bus-' ||
              COALESCE(NULLIF(ltrim(split_part(s.id, '-', 3), '0'), ''), '0')
   AND NOT EXISTS (SELECT 1 FROM public.staff s2 WHERE s2.user_id = u.id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_user_id ON public.staff (user_id) WHERE user_id IS NOT NULL;

-- Conductor marks a rider BOARDED or ABSENT on a trip (manual tap, seat map).
-- Writes the attendance row and the reservation in one transaction; creates a walk-on
-- reservation if the student was not on the chart.
CREATE OR REPLACE FUNCTION public.crew_mark_attendance(
  p_trip_id TEXT,
  p_student_id TEXT,
  p_status TEXT,
  p_method TEXT,
  p_verified_by TEXT,
  p_seat TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip RECORD;
  v_res_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_status NOT IN ('BOARDED', 'ABSENT') THEN
    RAISE EXCEPTION 'invalid status %', p_status;
  END IF;

  SELECT id, bus_id, shift_id, trip_date INTO v_trip FROM trips WHERE id = p_trip_id;
  IF v_trip.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TRIP_NOT_FOUND');
  END IF;

  SELECT id INTO v_res_id FROM bus_reservations
   WHERE student_id = p_student_id AND shift_id = v_trip.shift_id AND reservation_date = v_trip.trip_date
   FOR UPDATE;

  IF v_res_id IS NULL AND p_status = 'BOARDED' THEN
    INSERT INTO bus_reservations (student_id, trip_id, bus_id, boarding_stop_id, shift_id, reservation_date, assigned_by, status)
    SELECT p_student_id, v_trip.id, v_trip.bus_id,
           COALESCE(s.auto_assigned_stop_id, s.primary_stop_id,
                    (SELECT rs.stop_id FROM route_stops rs JOIN trips t ON t.route_id = rs.route_id
                      WHERE t.id = v_trip.id ORDER BY rs.stop_order LIMIT 1)),
           v_trip.shift_id, v_trip.trip_date, 'MANUAL', 'ASSIGNED'
      FROM students s WHERE s.id = p_student_id
    RETURNING id INTO v_res_id;
  END IF;

  IF v_res_id IS NOT NULL THEN
    UPDATE bus_reservations
       SET status = p_status,
           trip_id = v_trip.id,
           bus_id = v_trip.bus_id,
           boarded_at = CASE WHEN p_status = 'BOARDED' THEN COALESCE(boarded_at, v_now) ELSE NULL END,
           chosen_seat = CASE WHEN p_status = 'BOARDED' THEN COALESCE(p_seat, chosen_seat) ELSE chosen_seat END,
           seat_chosen_at = CASE WHEN p_status = 'BOARDED' AND p_seat IS NOT NULL THEN v_now ELSE seat_chosen_at END,
           lock_status = CASE WHEN p_status = 'BOARDED' THEN 'UNLOCKED' ELSE lock_status END,
           unlocked_by = CASE WHEN p_status = 'BOARDED' THEN 'MANUAL_OVERRIDE' ELSE unlocked_by END,
           unlock_timestamp = CASE WHEN p_status = 'BOARDED' THEN v_now ELSE unlock_timestamp END,
           needs_confirmation = false
     WHERE id = v_res_id;
  END IF;

  DELETE FROM attendance_records WHERE trip_id = v_trip.id AND student_id = p_student_id;
  INSERT INTO attendance_records (id, student_id, trip_id, bus_id, reservation_id, method, status, verified_by, notes, timestamp,
                                  lock_status, unlocked_by, unlock_timestamp)
  VALUES ('att_' || replace(gen_random_uuid()::text, '-', ''), p_student_id, v_trip.id, v_trip.bus_id, v_res_id,
          p_method, p_status, p_verified_by, CASE WHEN p_seat IS NOT NULL THEN 'Seat ' || p_seat END, v_now,
          CASE WHEN p_status = 'BOARDED' THEN 'UNLOCKED' END, CASE WHEN p_status = 'BOARDED' THEN 'MANUAL_OVERRIDE' END,
          CASE WHEN p_status = 'BOARDED' THEN v_now END);

  RETURN jsonb_build_object('ok', true, 'reservationId', v_res_id);
END;
$$;

REVOKE ALL ON FUNCTION public.crew_mark_attendance(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_mark_attendance(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
