import pg from "pg";
const { Client } = pg;

async function run() {
  const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
  console.log("Connecting to Postgres...");

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to PostgreSQL successfully!");

  const updateFunctionSql = `
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
    boarded_at = COALESCE(boarded_at, v_now),
    lock_status = 'UNLOCKED',
    unlocked_by = CASE
      WHEN unlocked_by IS NOT NULL THEN unlocked_by
      WHEN p_unlock_method ILIKE '%RFID%' THEN 'RFID'
      ELSE 'LOCATION_DISTANCE'
    END,
    unlock_timestamp = COALESCE(unlock_timestamp, v_now)
  WHERE id = p_reservation_id;

  -- 4. Sync seat_attendance (bookings) table + capture booking_id for FK
  UPDATE seat_attendance SET
    seat_number = p_seat_number,
    status = 'BOARDED',
    boarded_at = COALESCE(boarded_at, v_now)
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
    -- Insert new attendance record
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
  `;

  await client.query(updateFunctionSql);
  console.log("✅ Updated seat_attendance_transaction function in PostgreSQL!");

  await client.end();
}

run().catch((err) => {
  console.error("❌ Migration error:", err);
  process.exit(1);
});
