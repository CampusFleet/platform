-- delete_user_account v2: also returns every stored file that belongs to the user so the API can erase it.
--   blob_urls     : public Blob URLs (payment receipts, profile photo, halt-request photos)
--   evidence_keys : private Blob pathnames (face portrait, door-camera crops)
-- Door-camera captures are marked purged and incident face data is cleared, mirroring withdrawAndErase().

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  v_student_ids TEXT[];
  v_blob_urls TEXT[];
  v_evidence_keys TEXT[];
  v_capture_ids UUID[];
  v_deleted INTEGER;
BEGIN
  IF p_user_id IS NULL OR length(p_user_id) = 0 THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT COALESCE(array_agg(id), '{}')
    INTO v_student_ids
    FROM students
   WHERE user_id = p_user_id OR id = p_user_id OR id = 'stud-' || p_user_id;

  -- Public files: receipts, profile photo, halt-request photos
  SELECT COALESCE(array_agg(DISTINCT u), '{}') INTO v_blob_urls FROM (
    SELECT receipt_url AS u FROM payment_submissions WHERE student_id = ANY (v_student_ids)
    UNION ALL SELECT photo_url FROM users WHERE id = p_user_id
    UNION ALL SELECT student_photo FROM halt_requests WHERE student_id = ANY (v_student_ids)
  ) f WHERE u LIKE 'https://%.blob.vercel-storage.com/%';

  -- Private files: portrait key from /api/biometrics/portrait/<id>?k=<key>, and door-camera crops
  SELECT COALESCE(array_agg(id), '{}') INTO v_capture_ids
    FROM gate_captures WHERE matched_student_id = ANY (v_student_ids) AND evidence_purged_at IS NULL;

  SELECT COALESCE(array_agg(DISTINCT k), '{}') INTO v_evidence_keys FROM (
    SELECT replace(substring(photo_url FROM '[?&]k=([^&]+)'), '%2F', '/') AS k
      FROM users WHERE id = p_user_id AND photo_url LIKE '/api/biometrics/portrait/%'
    UNION ALL SELECT evidence_blob_key FROM gate_captures WHERE id = ANY (v_capture_ids)
    UNION ALL SELECT evidence_blob_key FROM bus_security_incidents
      WHERE matched_student_id = ANY (v_student_ids) OR capture_id = ANY (v_capture_ids)
  ) k WHERE k IS NOT NULL AND k <> '';

  UPDATE gate_captures SET evidence_purged_at = NOW() WHERE id = ANY (v_capture_ids);
  UPDATE bus_security_incidents SET evidence_blob_key = NULL, face_embedding = NULL
   WHERE matched_student_id = ANY (v_student_ids) OR capture_id = ANY (v_capture_ids);

  -- payment_submissions has both a CASCADE and a SET NULL FK to students; delete explicitly.
  DELETE FROM payment_submissions WHERE student_id = ANY (v_student_ids);
  -- Remaining student-owned rows (face templates, consents, reservations, ...) cascade.
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
    'blob_urls', to_jsonb(v_blob_urls),
    'evidence_keys', to_jsonb(v_evidence_keys),
    -- kept for older API builds still reading this field
    'receipt_urls', to_jsonb(v_blob_urls)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account(TEXT) TO service_role;
