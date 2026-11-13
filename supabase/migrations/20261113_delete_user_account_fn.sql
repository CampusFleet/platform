-- Account deletion in a single transaction.
--
-- /api/auth/delete-account used to fire ~20 parallel PostgREST deletes, each with a 6s client
-- timeout. When they timed out, the client gave up but Postgres kept working and holding locks
-- on users/students, which made subsequent sign-ins (INSERT INTO users) time out as well.
-- This function does the same cleanup atomically and returns the receipt URLs so the API can
-- remove the blobs afterwards.

-- Indexes on FK columns that are scanned by the user/student cascades.
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_student_id ON public.subscriptions (student_id);

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  v_student_ids TEXT[];
  v_receipts TEXT[];
  v_deleted INTEGER;
BEGIN
  IF p_user_id IS NULL OR length(p_user_id) = 0 THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT COALESCE(array_agg(id), '{}')
    INTO v_student_ids
    FROM students
   WHERE user_id = p_user_id OR id = p_user_id OR id = 'stud-' || p_user_id;

  SELECT COALESCE(array_agg(receipt_url) FILTER (WHERE receipt_url IS NOT NULL), '{}')
    INTO v_receipts
    FROM payment_submissions
   WHERE student_id = ANY (v_student_ids);

  -- payment_submissions has both a CASCADE and a SET NULL FK to students; delete explicitly.
  DELETE FROM payment_submissions WHERE student_id = ANY (v_student_ids);
  -- Remaining student-owned rows are removed by ON DELETE CASCADE.
  DELETE FROM students WHERE id = ANY (v_student_ids);

  DELETE FROM audit_logs WHERE user_id = p_user_id;
  DELETE FROM notifications WHERE user_id = p_user_id;
  DELETE FROM staff WHERE user_id = p_user_id;
  DELETE FROM bus_switch_requests WHERE manager_id = p_user_id;
  DELETE FROM vehicle_issues WHERE reported_by = p_user_id;
  DELETE FROM maintenance_logs WHERE created_by = p_user_id;

  DELETE FROM users WHERE id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'user_deleted', v_deleted > 0,
    'student_ids', to_jsonb(v_student_ids),
    'receipt_urls', to_jsonb(v_receipts)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account(TEXT) TO service_role;
