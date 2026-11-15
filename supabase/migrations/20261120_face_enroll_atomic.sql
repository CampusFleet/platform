-- Face ID enrollment in one transaction (see docs/CODEMAP.md section 9).
-- Before: consent insert, revoke of old templates and insert of new templates were three separate
-- writes, so a failed insert could leave a student with no active Face ID and an orphan consent.
-- enroll_face_templates() does all three or nothing.
--
-- p_templates: JSON array of { "embedding": [128 numbers], "quality": 0..1, "pad": 0..1 }.

CREATE OR REPLACE FUNCTION public.enroll_face_templates(
  p_student_id TEXT,
  p_user_id TEXT,
  p_consent_version TEXT,
  p_purpose TEXT,
  p_client_ip TEXT,
  p_user_agent TEXT,
  p_model_version TEXT,
  p_templates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_consent_id UUID;
  v_count INT;
BEGIN
  IF jsonb_typeof(p_templates) <> 'array' OR jsonb_array_length(p_templates) = 0 THEN
    RAISE EXCEPTION 'p_templates must be a non-empty array';
  END IF;

  INSERT INTO biometric_consents (student_id, consent_version, purpose, granted_by_user_id, client_ip, user_agent)
  VALUES (p_student_id, p_consent_version, p_purpose, p_user_id, p_client_ip, left(COALESCE(p_user_agent, ''), 200))
  RETURNING id INTO v_consent_id;

  UPDATE face_templates
     SET revoked_at = now(), revoked_reason = 'RE_ENROLLED'
   WHERE student_id = p_student_id AND revoked_at IS NULL;

  INSERT INTO face_templates (student_id, consent_id, embedding, model_version, quality_score, pad_score, source)
  SELECT p_student_id, v_consent_id,
         (t->'embedding')::text::vector,
         p_model_version,
         greatest(0, least(1, COALESCE((t->>'quality')::float, 0))),
         greatest(0, least(1, COALESCE((t->>'pad')::float, 0))),
         'ENROLLMENT'
    FROM jsonb_array_elements(p_templates) t;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('consent_id', v_consent_id, 'templates', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_face_templates(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_face_templates(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
