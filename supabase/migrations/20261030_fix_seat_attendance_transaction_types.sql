-- ============================================================================
-- Migration: Fix Seat Attendance Transaction Types and Aggregate Lock
-- Date: 2026-10-30
-- Description:
--   1. Changes p_student_id parameter from UUID to TEXT across all 3 RPCs
--      (seat_attendance_transaction, cancel_seat_transaction, switch_seat_transaction)
--      resolving Postgres "operator does not exist: text = uuid" when comparing
--      with text column student_id.
--   2. Replaces "SELECT COUNT(*) ... FOR UPDATE" with "PERFORM 1 ... FOR UPDATE"
--      to eliminate Postgres "FOR UPDATE is not allowed with aggregate functions".
-- ============================================================================

-- Drop old functions with UUID signature
DROP FUNCTION IF EXISTS public.seat_attendance_transaction(UUID, UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cancel_seat_transaction(UUID, UUID);
DROP FUNCTION IF EXISTS public.switch_seat_transaction(UUID, UUID, TEXT);

-- RPC 1: seat_attendance_transaction
CREATE OR REPLACE FUNCTION public.seat_attendance_transaction(
  p_reservation_id UUID,
  p_student_id TEXT,
  p_seat_number TEXT,
  p_unlock_method TEXT,
  p_verified_by TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation RECORD;
  v_attendance_id TEXT;
  v_booking_id TEXT;
  v_existing_attendance RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Lock the reservation row (prevents concurrent modifications)
  SELECT * INTO v_reservation
  FROM bus_reservations
  WHERE id = p_reservation_id
    AND student_id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Reservation not found for this student.');
  END IF;

  -- 2. Check for seat conflicts on this trip (double-booking prevention)
  --    Lock competing row to prevent TOCTOU race condition
  PERFORM 1
  FROM bus_reservations
  WHERE trip_id = v_reservation.trip_id
    AND chosen_seat = p_seat_number
    AND id != p_reservation_id
    AND status NOT IN ('CANCELLED', 'SWITCHED')
  FOR UPDATE;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error',
      format('Seat %s is already taken by another student on this trip.', p_seat_number));
  END IF;

  -- Also check seat_attendance (bookings) table for conflicts
  PERFORM 1
  FROM seat_attendance
  WHERE trip_id = v_reservation.trip_id
    AND seat_number = p_seat_number
    AND student_id != p_student_id
    AND status IN ('CONFIRMED', 'BOARDED')
  FOR UPDATE;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error',
      format('Seat %s is already booked by another passenger.', p_seat_number));
  END IF;

  -- 3. Atomically update reservation
  UPDATE bus_reservations SET
    chosen_seat = p_seat_number,
    seat_chosen_at = v_now,
    status = 'BOARDED',
    boarded_at = v_now,
    lock_status = 'UNLOCKED',
    unlocked_by = CASE
      WHEN p_unlock_method ILIKE '%RFID%' THEN 'RFID'
      ELSE 'LOCATION_DISTANCE'
    END,
    unlock_timestamp = v_now
  WHERE id = p_reservation_id;

  -- 4. Sync seat_attendance (bookings) table + capture booking_id for FK
  UPDATE seat_attendance SET
    seat_number = p_seat_number,
    status = 'BOARDED',
    boarded_at = v_now
  WHERE trip_id = v_reservation.trip_id
    AND student_id = p_student_id
  RETURNING id INTO v_booking_id;

  -- 5. Check if an attendance record already exists for this student and trip (e.g. from prior RFID tap or distance unlock)
  SELECT * INTO v_existing_attendance
  FROM attendance_records
  WHERE student_id = p_student_id
    AND (
      trip_id = v_reservation.trip_id
      OR reservation_id = p_reservation_id
    )
  ORDER BY timestamp DESC
  LIMIT 1;

  IF v_existing_attendance.id IS NOT NULL THEN
    v_attendance_id := v_existing_attendance.id;
    UPDATE attendance_records SET
      status = 'BOARDED',
      reservation_id = p_reservation_id,
      booking_id = COALESCE(booking_id, v_booking_id),
      notes = CASE
        WHEN notes IS NOT NULL AND notes != '' THEN notes || ' | ' || COALESCE(p_notes, format('Seat %s confirmed', p_seat_number))
        ELSE COALESCE(p_notes, format('Seat %s confirmed', p_seat_number))
      END,
      lock_status = 'UNLOCKED',
      unlocked_by = COALESCE(unlocked_by, CASE WHEN p_unlock_method ILIKE '%RFID%' THEN 'RFID' ELSE 'LOCATION_DISTANCE' END),
      unlock_timestamp = COALESCE(unlock_timestamp, v_now)
    WHERE id = v_attendance_id;
  ELSE
    -- Insert new attendance record with all FK references populated
    v_attendance_id := 'att-txn-' || (EXTRACT(EPOCH FROM v_now) * 1000)::BIGINT || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6);
    INSERT INTO attendance_records (
      id, student_id, trip_id, bus_id, method, status,
      verified_by, notes, signature_token, timestamp,
      lock_status, unlocked_by, unlock_timestamp,
      reservation_id, booking_id
    ) VALUES (
      v_attendance_id, p_student_id, v_reservation.trip_id,
      v_reservation.bus_id, p_unlock_method, 'BOARDED',
      p_verified_by, COALESCE(p_notes, 'Atomic seat attendance transaction'),
      'TXN-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 8)),
      v_now, 'UNLOCKED',
      CASE WHEN p_unlock_method ILIKE '%RFID%' THEN 'RFID' ELSE 'LOCATION_DISTANCE' END,
      v_now,
      p_reservation_id,
      v_booking_id
    );
  END IF;

  -- 6. Return success
  RETURN json_build_object(
    'success', true,
    'reservationId', p_reservation_id,
    'seatNumber', p_seat_number,
    'attendanceId', v_attendance_id,
    'bookingId', v_booking_id,
    'message', format('✓ Seat %s confirmed & attendance marked.', p_seat_number)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- RPC 2: cancel_seat_transaction
CREATE OR REPLACE FUNCTION public.cancel_seat_transaction(
  p_reservation_id UUID,
  p_student_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation RECORD;
BEGIN
  -- 1. Lock reservation + check trip status in one query
  SELECT r.*, t.status AS trip_status
  INTO v_reservation
  FROM bus_reservations r
  LEFT JOIN trips t ON t.id = r.trip_id
  WHERE r.id = p_reservation_id
    AND r.student_id = p_student_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Reservation not found.');
  END IF;

  -- 2. CONDUCTOR LOCK: Block cancellation if trip is IN_PROGRESS or COMPLETED
  IF v_reservation.trip_status IN ('IN_PROGRESS', 'COMPLETED') THEN
    RETURN json_build_object('success', false, 'error',
      'Trip is in progress or completed — the bus has departed. Attendance cannot be cancelled after the conductor departs. You can still switch your seat.',
      'tripLocked', true);
  END IF;

  -- 3. Rollback reservation to pre-attendance state
  UPDATE bus_reservations SET
    chosen_seat = NULL,
    seat_chosen_at = NULL,
    status = 'ASSIGNED',
    boarded_at = NULL,
    lock_status = 'LOCKED',
    unlocked_by = NULL,
    unlock_timestamp = NULL,
    distance_meters = NULL
  WHERE id = p_reservation_id;

  -- 4. Delete today's attendance records for this student+trip / reservation
  DELETE FROM attendance_records
  WHERE (reservation_id = p_reservation_id)
     OR (student_id = p_student_id
         AND trip_id = v_reservation.trip_id
         AND timestamp >= CURRENT_DATE::TIMESTAMPTZ);

  -- 5. Reset seat_attendance (bookings) table entry
  UPDATE seat_attendance SET
    seat_number = NULL,
    status = 'CONFIRMED',
    boarded_at = NULL
  WHERE trip_id = v_reservation.trip_id
    AND student_id = p_student_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Seat cancelled and attendance rolled back successfully. You can re-select a seat.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- RPC 3: switch_seat_transaction
CREATE OR REPLACE FUNCTION public.switch_seat_transaction(
  p_reservation_id UUID,
  p_student_id TEXT,
  p_new_seat_number TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation RECORD;
  v_old_seat TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Lock reservation
  SELECT * INTO v_reservation
  FROM bus_reservations
  WHERE id = p_reservation_id
    AND student_id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Reservation not found.');
  END IF;

  v_old_seat := v_reservation.chosen_seat;

  IF v_old_seat IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No current seat to switch from. Use seat selection instead.');
  END IF;

  IF v_old_seat = p_new_seat_number THEN
    RETURN json_build_object('success', true, 'message', 'Already on this seat.', 'oldSeat', v_old_seat, 'newSeat', p_new_seat_number);
  END IF;

  -- 2. Check new seat availability (lock competing row to prevent race)
  PERFORM 1
  FROM bus_reservations
  WHERE trip_id = v_reservation.trip_id
    AND chosen_seat = p_new_seat_number
    AND id != p_reservation_id
    AND status NOT IN ('CANCELLED', 'SWITCHED')
  FOR UPDATE;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error',
      format('Seat %s is already occupied. Please choose another seat.', p_new_seat_number));
  END IF;

  -- Also check seat_attendance (bookings)
  PERFORM 1
  FROM seat_attendance
  WHERE trip_id = v_reservation.trip_id
    AND seat_number = p_new_seat_number
    AND student_id != p_student_id
    AND status IN ('CONFIRMED', 'BOARDED')
  FOR UPDATE;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error',
      format('Seat %s is taken in bookings. Choose another.', p_new_seat_number));
  END IF;

  -- 3. Atomic swap: update reservation seat
  UPDATE bus_reservations SET
    chosen_seat = p_new_seat_number,
    seat_chosen_at = v_now
  WHERE id = p_reservation_id;

  -- 4. Update latest attendance record notes
  UPDATE attendance_records SET
    notes = format('Seat switched: %s → %s at %s', v_old_seat, p_new_seat_number, v_now)
  WHERE (reservation_id = p_reservation_id)
     OR (student_id = p_student_id
         AND trip_id = v_reservation.trip_id
         AND timestamp >= CURRENT_DATE::TIMESTAMPTZ);

  -- 5. Sync seat_attendance (bookings)
  UPDATE seat_attendance SET
    seat_number = p_new_seat_number
  WHERE trip_id = v_reservation.trip_id
    AND student_id = p_student_id;

  RETURN json_build_object(
    'success', true,
    'oldSeat', v_old_seat,
    'newSeat', p_new_seat_number,
    'message', format('✓ Seat switched from %s → %s', v_old_seat, p_new_seat_number)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
