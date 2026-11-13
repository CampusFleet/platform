-- Every driver / conductor login gets exactly one linked staff row, so the transport manager can
-- assign them to trips (trips.driver_id / conductor_id → staff.id) and /api/crew/duty can find them.
-- Runs when a user is created with, or changed to, a crew role. Existing unlinked crew are backfilled.

CREATE OR REPLACE FUNCTION public.fn_ensure_crew_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := upper(left(md5(NEW.id), 6));
BEGIN
  IF NEW.role NOT IN ('driver', 'conductor') THEN
    RETURN NEW;
  END IF;

  UPDATE staff SET role = NEW.role, is_active = true WHERE user_id = NEW.id;
  IF NOT FOUND THEN
    INSERT INTO staff (id, user_id, role, full_name, email, phone, employee_code, category, is_active)
    VALUES (
      'staff-' || CASE NEW.role WHEN 'driver' THEN 'drv' ELSE 'cnd' END || '-u' || lower(v_code),
      NEW.id, NEW.role, NEW.full_name, NEW.email, NEW.phone,
      CASE NEW.role WHEN 'driver' THEN 'DRV-' ELSE 'CND-' END || v_code,
      'TRANSPORT_OPS', true
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_crew_staff ON public.users;
CREATE TRIGGER trg_ensure_crew_staff
  AFTER INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_crew_staff();

-- Backfill: touch unlinked crew users so the trigger creates their staff rows.
UPDATE public.users u SET role = u.role
 WHERE u.role IN ('driver', 'conductor')
   AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = u.id);
