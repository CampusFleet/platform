-- Teachers on the boarding chart.
--
-- teacher_rides: what a teacher rides (pickup stop, route, incoming/outgoing shift, weekdays). Set by the
--   teacher in Settings (/api/teacher/ride-settings); the transport manager may edit it.
-- teacher_reservations: one row per teacher per trip, created by teacher_chart_tick() every 5 minutes
--   until the trip's final chart (same cutoff as students). Seats are given by the app
--   (src/lib/students/seating.ts): teachers first, in the bus's front teacher seats.
-- trg_*_seat_unique: one seat per trip across students AND teachers (the two tables share the bus).
-- Ids are TEXT without foreign keys because older tables mix id types; the app validates them.

CREATE TABLE IF NOT EXISTS public.teacher_rides (
  user_id TEXT PRIMARY KEY,
  stop_id TEXT,
  route_id TEXT,
  incoming_shift_id TEXT,
  outgoing_shift_id TEXT,
  days TEXT[] NOT NULL DEFAULT ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teacher_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  bus_id INTEGER,
  shift_id TEXT NOT NULL,
  reservation_date DATE NOT NULL,
  boarding_stop_id TEXT,
  chosen_seat TEXT,
  status TEXT NOT NULL DEFAULT 'ASSIGNED',   -- ASSIGNED | BOARDED | ABSENT | CANCELLED
  boarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, shift_id, reservation_date)
);
CREATE INDEX IF NOT EXISTS idx_teacher_reservations_trip ON public.teacher_reservations (trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_reservations_trip_seat
  ON public.teacher_reservations (trip_id, chosen_seat)
  WHERE chosen_seat IS NOT NULL AND status <> 'CANCELLED';

-- Only the server (service role) touches these tables.
ALTER TABLE public.teacher_rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_reservations ENABLE ROW LEVEL SECURITY;

-- One seat per trip across both tables. The advisory lock serialises seat writes per trip.
CREATE OR REPLACE FUNCTION public.check_trip_seat_unique()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.chosen_seat IS NULL OR NEW.trip_id IS NULL OR NEW.status IN ('CANCELLED', 'SWITCHED') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('trip-seat:' || NEW.trip_id));
  IF TG_TABLE_NAME = 'bus_reservations' THEN
    IF EXISTS (SELECT 1 FROM teacher_reservations t
                WHERE t.trip_id = NEW.trip_id AND t.chosen_seat = NEW.chosen_seat AND t.status <> 'CANCELLED') THEN
      RAISE EXCEPTION 'seat % on trip is taken by a teacher', NEW.chosen_seat USING ERRCODE = 'unique_violation';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM bus_reservations r
                WHERE r.trip_id = NEW.trip_id AND r.chosen_seat = NEW.chosen_seat AND r.status NOT IN ('CANCELLED', 'SWITCHED')) THEN
      RAISE EXCEPTION 'seat % on trip is taken by a student', NEW.chosen_seat USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bus_reservations_seat_unique ON public.bus_reservations;
CREATE TRIGGER trg_bus_reservations_seat_unique
  BEFORE INSERT OR UPDATE OF chosen_seat, status ON public.bus_reservations
  FOR EACH ROW EXECUTE FUNCTION public.check_trip_seat_unique();

DROP TRIGGER IF EXISTS trg_teacher_reservations_seat_unique ON public.teacher_reservations;
CREATE TRIGGER trg_teacher_reservations_seat_unique
  BEFORE INSERT OR UPDATE OF chosen_seat, status ON public.teacher_reservations
  FOR EACH ROW EXECUTE FUNCTION public.check_trip_seat_unique();

-- Chart for teachers: same timing rules as boarding_chart_tick() for students.
CREATE OR REPLACE FUNCTION public.teacher_chart_tick(p_now TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
DECLARE
  v_local TIMESTAMP := p_now AT TIME ZONE 'Asia/Kolkata';
  v_day DATE := v_local::date;
  v_time TIME := v_local::time;
  v_dow TEXT := to_char(v_local::date, 'FMDAY');
  v_added INT := 0;
  v_absent INT := 0;
BEGIN
  -- 1. Add teachers to today's trips on their route + shift, until the final chart.
  INSERT INTO teacher_reservations (user_id, trip_id, bus_id, shift_id, reservation_date, boarding_stop_id)
  SELECT DISTINCT ON (tr.user_id, t.shift_id)
         tr.user_id, t.id, t.bus_id, t.shift_id, v_day, tr.stop_id
  FROM teacher_rides tr
  JOIN trips t ON t.route_id = tr.route_id
              AND t.shift_id IN (tr.incoming_shift_id, tr.outgoing_shift_id)
  JOIN shifts sh ON sh.id = t.shift_id AND sh.is_active
  WHERE tr.is_active
    AND v_dow = ANY (tr.days)
    AND t.trip_date = v_day
    AND t.status <> 'CANCELLED'
    AND t.bus_id IS NOT NULL
    AND NOT COALESCE(t.manifest_locked, false)
    AND sh.start_time IS NOT NULL
    AND v_time < sh.start_time - make_interval(mins => COALESCE(sh.booking_cutoff_minutes, 30))
  ORDER BY tr.user_id, t.shift_id, t.id
  ON CONFLICT (user_id, shift_id, reservation_date) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  -- 2. After the shift ends, teachers who did not board are ABSENT.
  UPDATE teacher_reservations r
     SET status = 'ABSENT'
    FROM shifts sh
   WHERE r.shift_id = sh.id
     AND r.reservation_date = v_day
     AND r.status = 'ASSIGNED'
     AND sh.end_time IS NOT NULL
     AND v_time > sh.end_time;
  GET DIAGNOSTICS v_absent = ROW_COUNT;

  RETURN jsonb_build_object('added', v_added, 'absent', v_absent);
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_chart_tick(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_chart_tick(TIMESTAMPTZ) TO service_role;

SELECT cron.unschedule('teacher-chart-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'teacher-chart-tick');
SELECT cron.schedule('teacher-chart-tick', '*/5 * * * *', $cron$SELECT public.teacher_chart_tick()$cron$);
