-- ==============================================================================
-- CampusFleet: Railway-Inspired Algorithmic Seat Preferences & Partner Allocation
-- Adds row zone preference (FRONT, MIDDLE, BACK), seat position (WINDOW, AISLE),
-- and two-way mutual consent companion/partner request system.
-- ==============================================================================

-- 1. Add seat preference columns to students table
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS seat_row_preference TEXT DEFAULT 'NO_PREFERENCE'
    CHECK (seat_row_preference IN ('FRONT', 'MIDDLE', 'BACK', 'NO_PREFERENCE')),
  ADD COLUMN IF NOT EXISTS seat_position_preference TEXT DEFAULT 'NO_PREFERENCE'
    CHECK (seat_position_preference IN ('WINDOW', 'AISLE', 'NO_PREFERENCE')),
  ADD COLUMN IF NOT EXISTS preferred_partner_student_id TEXT,
  ADD COLUMN IF NOT EXISTS preferred_partner_name TEXT;

-- 2. Add auto-assigned seat metadata to bus_reservations table
ALTER TABLE public.bus_reservations
  ADD COLUMN IF NOT EXISTS auto_assigned_seat TEXT,
  ADD COLUMN IF NOT EXISTS seat_preference_applied BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS seat_partner_matched BOOLEAN DEFAULT false;

-- 3. Dedicated Seat Partner Requests Table for Mutual Consent Handshake
CREATE TABLE IF NOT EXISTS public.seat_partner_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  receiver_id TEXT NOT NULL,
  receiver_name TEXT,
  bus_id TEXT NOT NULL,
  trip_id TEXT,
  shift_id TEXT,
  reservation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'UNLINKED', 'EXPIRED')),
  preferred_row_zone TEXT DEFAULT 'NO_PREFERENCE',
  allocated_pair JSONB, -- Stores {"sender_seat": "4A", "receiver_seat": "4B", "relation": "SIDE_BY_SIDE"}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  UNIQUE(sender_id, receiver_id, reservation_date, shift_id)
);

-- 4. Fast query indexes
CREATE INDEX IF NOT EXISTS idx_seat_partner_receiver ON public.seat_partner_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_partner_sender ON public.seat_partner_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_partner_trip ON public.seat_partner_requests(bus_id, reservation_date, status);
CREATE INDEX IF NOT EXISTS idx_students_preferred_partner ON public.students(preferred_partner_student_id);
CREATE INDEX IF NOT EXISTS idx_bus_reservations_auto_seat ON public.bus_reservations(auto_assigned_seat);
