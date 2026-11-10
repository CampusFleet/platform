-- ==============================================================================
-- CampusFleet: Schema integrity bug fixes (safe to apply before or after the code deploy)
--   B2  bus_reservations.status must allow ALIGHTED (Out-camera / gate-out events)
--   B5  seat preference & partner columns/table (20261103 migration was never applied)
--   B7  payment_submissions.student_id had two conflicting FKs (CASCADE + SET NULL)
--   +   match_student_face had two overloads (text / bigint filter) → PostgREST could
--       not resolve calls with a NULL filter, breaking Face ID matching
-- Every statement is idempotent.
-- ==============================================================================

BEGIN;

-- B2 ---------------------------------------------------------------------------
ALTER TABLE public.bus_reservations DROP CONSTRAINT IF EXISTS bus_reservations_status_check;
ALTER TABLE public.bus_reservations ADD CONSTRAINT bus_reservations_status_check
  CHECK (status = ANY (ARRAY['ASSIGNED','SEAT_SELECTED','BOARDED','ALIGHTED','ABSENT','CANCELLED','SWITCHED']));

-- B5 ---------------------------------------------------------------------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS seat_row_preference TEXT DEFAULT 'NO_PREFERENCE'
    CHECK (seat_row_preference IN ('FRONT', 'MIDDLE', 'BACK', 'NO_PREFERENCE')),
  ADD COLUMN IF NOT EXISTS seat_position_preference TEXT DEFAULT 'NO_PREFERENCE'
    CHECK (seat_position_preference IN ('WINDOW', 'AISLE', 'NO_PREFERENCE')),
  ADD COLUMN IF NOT EXISTS preferred_partner_student_id TEXT,
  ADD COLUMN IF NOT EXISTS preferred_partner_name TEXT;

ALTER TABLE public.bus_reservations
  ADD COLUMN IF NOT EXISTS auto_assigned_seat TEXT,
  ADD COLUMN IF NOT EXISTS seat_preference_applied BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS seat_partner_matched BOOLEAN DEFAULT false;

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
  allocated_pair JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  UNIQUE(sender_id, receiver_id, reservation_date, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_seat_partner_receiver ON public.seat_partner_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_partner_sender ON public.seat_partner_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_partner_trip ON public.seat_partner_requests(bus_id, reservation_date, status);
CREATE INDEX IF NOT EXISTS idx_students_preferred_partner ON public.students(preferred_partner_student_id);
CREATE INDEX IF NOT EXISTS idx_bus_reservations_auto_seat ON public.bus_reservations(auto_assigned_seat);

-- B7 ---------------------------------------------------------------------------
-- Keep ON DELETE SET NULL so payment history survives student deletion.
ALTER TABLE public.payment_submissions DROP CONSTRAINT IF EXISTS fk_payment_submissions_student;

-- Face match overload -----------------------------------------------------------
-- routes.id is TEXT, so the bigint-filter overload is wrong and makes calls ambiguous.
DROP FUNCTION IF EXISTS public.match_student_face(vector, double precision, integer, bigint);

-- Index used by merges / RFID anti-passback date-scoped lookups
CREATE INDEX IF NOT EXISTS idx_bus_reservations_bus_date_status
  ON public.bus_reservations (bus_id, reservation_date, status);

COMMIT;
