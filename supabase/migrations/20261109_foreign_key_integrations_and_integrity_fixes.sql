-- ============================================================================
-- Migration: 20261109_foreign_key_integrations_and_integrity_fixes.sql
-- Description: Unifies Foreign Key Integrations across Attendance, Security,
--              Salary, and Transport Settings.
-- Standard: 3NF Relational Integrity with Safe ON DELETE SET NULL for Audit Columns
-- ============================================================================

-- 1. Fix bus_security_incidents.resolved_by
-- Resolvers are administrators and transport managers whose identities live in public.users.
DO $$ 
BEGIN
  -- Drop old reference to staff if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'bus_security_incidents_resolved_by_fkey'
  ) THEN
    ALTER TABLE public.bus_security_incidents 
    DROP CONSTRAINT bus_security_incidents_resolved_by_fkey;
  END IF;

  -- Add foreign key to public.users with ON DELETE SET NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_bus_security_incidents_resolved_by'
  ) THEN
    ALTER TABLE public.bus_security_incidents 
    ADD CONSTRAINT fk_bus_security_incidents_resolved_by 
    FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for resolved_by & matched_student_id on bus_security_incidents
CREATE INDEX IF NOT EXISTS idx_bus_security_resolved_by ON public.bus_security_incidents (resolved_by);
CREATE INDEX IF NOT EXISTS idx_bus_security_matched_student ON public.bus_security_incidents (matched_student_id);

-- 2. Link staff_salary_configs.user_id to public.users
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_staff_salary_configs_user_id'
  ) THEN
    ALTER TABLE public.staff_salary_configs 
    ADD CONSTRAINT fk_staff_salary_configs_user_id 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_salary_configs_user ON public.staff_salary_configs (user_id);

-- 3. Link staff_salary_payouts.processed_by to public.users
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_staff_salary_payouts_processed_by'
  ) THEN
    ALTER TABLE public.staff_salary_payouts 
    ADD CONSTRAINT fk_staff_salary_payouts_processed_by 
    FOREIGN KEY (processed_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_salary_payouts_processor ON public.staff_salary_payouts (processed_by);

-- 4. Link attendance_reconciliation_runs to public.users & shifts
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_attendance_reconciliation_reconciled_by'
  ) THEN
    ALTER TABLE public.attendance_reconciliation_runs 
    ADD CONSTRAINT fk_attendance_reconciliation_reconciled_by 
    FOREIGN KEY (reconciled_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_attendance_reconciliation_incoming_shift'
  ) THEN
    ALTER TABLE public.attendance_reconciliation_runs 
    ADD CONSTRAINT fk_attendance_reconciliation_incoming_shift 
    FOREIGN KEY (incoming_shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_attendance_reconciliation_outgoing_shift'
  ) THEN
    ALTER TABLE public.attendance_reconciliation_runs 
    ADD CONSTRAINT fk_attendance_reconciliation_outgoing_shift 
    FOREIGN KEY (outgoing_shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Add index on transport_settings.updated_by
CREATE INDEX IF NOT EXISTS idx_transport_settings_updated_by ON public.transport_settings (updated_by);

