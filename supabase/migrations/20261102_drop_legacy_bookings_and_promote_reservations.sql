-- ═══════════════════════════════════════════════════════════════════════════════
-- DEPRECATE AND DROP LEGACY BOOKING SYSTEM
-- Shift permanently to Smart Transit Auto-Reservation System (bus_reservations)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Drop dependent views
DROP VIEW IF EXISTS public.bookings_full CASCADE;
DROP VIEW IF EXISTS public.bookings CASCADE;

-- 2. Drop legacy dependent tables
DROP TABLE IF EXISTS public.booking_status_history CASCADE;
DROP TABLE IF EXISTS public.attendance_events CASCADE;
DROP TABLE IF EXISTS public.seat_attendance CASCADE;

-- 3. Enhance bus_reservations table
ALTER TABLE public.bus_reservations ADD COLUMN IF NOT EXISTS roaming_status text DEFAULT 'CONFIRMED';
ALTER TABLE public.bus_reservations ADD COLUMN IF NOT EXISTS running_grace_until timestamptz;
ALTER TABLE public.bus_reservations ADD COLUMN IF NOT EXISTS booking_code text;

-- 4. Create authoritative View on bus_reservations with joined trip, bus, student, and stop metadata
DROP VIEW IF EXISTS public.bus_reservations_full CASCADE;

CREATE VIEW public.bus_reservations_full AS
SELECT
    r.id,
    r.student_id,
    r.trip_id,
    r.bus_id,
    t.trip_code,
    r.shift_id,
    s.name AS shift_name,
    s.start_time AS shift_start_time,
    s.end_time AS shift_end_time,
    r.reservation_date,
    r.reservation_date AS booking_date,
    r.boarding_stop_id,
    st.name AS boarding_stop_name,
    st.landmark AS boarding_stop_landmark,
    r.assigned_by,
    r.assignment_score,
    r.chosen_seat,
    r.chosen_seat AS seat_number,
    COALESCE(r.booking_code, 'RES-' || COALESCE(r.chosen_seat, 'PASS') || '-' || SUBSTRING(r.id::text FROM 1 FOR 6)) AS booking_code,
    r.seat_chosen_at,
    r.status,
    r.boarded_at,
    r.cancelled_at,
    r.lock_status,
    r.unlocked_by,
    r.distance_meters,
    r.unlock_timestamp,
    COALESCE(r.roaming_status, CASE WHEN r.status = 'BOARDED' THEN 'ONBOARD_CONFIRMED' ELSE 'CONFIRMED' END) AS roaming_status,
    r.running_grace_until,
    CASE WHEN r.chosen_seat IS NOT NULL THEN 'SEATED' ELSE 'STANDING_TILL_MERGE' END AS passenger_type,
    b.bus_number,
    b.registration_no,
    b.capacity AS bus_capacity,
    stu.full_name AS student_name,
    stu.student_id_code,
    stu.photo_url AS student_photo_url,
    r.created_at
FROM public.bus_reservations r
LEFT JOIN public.trips t ON t.id = r.trip_id
LEFT JOIN public.shifts s ON s.id = r.shift_id
LEFT JOIN public.stops st ON st.id = r.boarding_stop_id
LEFT JOIN public.buses b ON b.id = r.bus_id
LEFT JOIN public.students_full stu ON stu.id = r.student_id;
