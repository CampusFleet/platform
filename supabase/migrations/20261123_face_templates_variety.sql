-- Face ID accuracy with glasses and real gate conditions (see docs/CODEMAP.md section 9).
-- Needs 20261120_face_enroll_atomic.sql first.
--
-- Matching already takes the closest of a student's templates (match_face_v2: MIN distance), so the
-- way to handle glasses, lighting and the door camera is more templates of different looks:
--   ENROLLMENT_EXTRA  a second scan by the student (e.g. with glasses on, then off). Kept with the
--                     first scan; capped at 8 extra templates (oldest revoked).
--   GATE_ADAPTIVE     the door-camera crop of a very confident boarding on the student's own bus
--                     (well inside the threshold, quality and liveness passed). Newest 3 kept.
-- Following the public Amazon Rekognition guidance to index several images of one person with
-- different attributes, and to feed reviewed real-world matches back in.

DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.face_templates'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%source%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.face_templates DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.face_templates
  ADD CONSTRAINT face_templates_source_check CHECK (source IN ('ENROLLMENT', 'CALIBRATION', 'ENROLLMENT_EXTRA', 'GATE_ADAPTIVE'));

-- Enrollment with an "append" mode (second look). The 8-argument version stays callable by name
-- because p_append has a default.
DROP FUNCTION IF EXISTS public.enroll_face_templates(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.enroll_face_templates(
  p_student_id TEXT,
  p_user_id TEXT,
  p_consent_version TEXT,
  p_purpose TEXT,
  p_client_ip TEXT,
  p_user_agent TEXT,
  p_model_version TEXT,
  p_templates JSONB,
  p_append BOOLEAN DEFAULT false
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
  IF p_append AND NOT EXISTS (
    SELECT 1 FROM face_templates t JOIN biometric_consents c ON c.id = t.consent_id AND c.withdrawn_at IS NULL
     WHERE t.student_id = p_student_id AND t.revoked_at IS NULL AND t.source = 'ENROLLMENT'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Set up Face ID first, then add another look.');
  END IF;

  INSERT INTO biometric_consents (student_id, consent_version, purpose, granted_by_user_id, client_ip, user_agent)
  VALUES (p_student_id, p_consent_version, p_purpose, p_user_id, p_client_ip, left(COALESCE(p_user_agent, ''), 200))
  RETURNING id INTO v_consent_id;

  IF NOT p_append THEN
    -- A fresh scan replaces every earlier look, including learned gate templates.
    UPDATE face_templates SET revoked_at = now(), revoked_reason = 'RE_ENROLLED'
     WHERE student_id = p_student_id AND revoked_at IS NULL;
  END IF;

  INSERT INTO face_templates (student_id, consent_id, embedding, model_version, quality_score, pad_score, source)
  SELECT p_student_id, v_consent_id, (t->'embedding')::text::vector, p_model_version,
         greatest(0, least(1, COALESCE((t->>'quality')::float, 0))),
         greatest(0, least(1, COALESCE((t->>'pad')::float, 0))),
         CASE WHEN p_append THEN 'ENROLLMENT_EXTRA' ELSE 'ENROLLMENT' END
    FROM jsonb_array_elements(p_templates) t;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_append THEN
    UPDATE face_templates SET revoked_at = now(), revoked_reason = 'EXTRA_LIMIT'
     WHERE id IN (
       SELECT id FROM face_templates
        WHERE student_id = p_student_id AND revoked_at IS NULL AND source = 'ENROLLMENT_EXTRA'
        ORDER BY created_at DESC OFFSET 8
     );
  END IF;
  RETURN jsonb_build_object('ok', true, 'consent_id', v_consent_id, 'templates', v_count);
END;
$$;

-- Learned template from a confident gate match. Silently does nothing without an active consent.
CREATE OR REPLACE FUNCTION public.add_gate_face_template(
  p_student_id TEXT, p_embedding TEXT, p_model_version TEXT, p_quality DOUBLE PRECISION, p_pad DOUBLE PRECISION
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_consent UUID;
BEGIN
  SELECT c.id INTO v_consent FROM biometric_consents c
   WHERE c.student_id = p_student_id AND c.withdrawn_at IS NULL
   ORDER BY c.granted_at DESC LIMIT 1;
  IF v_consent IS NULL THEN RETURN false; END IF;
  -- At most one learned template per student per day.
  IF EXISTS (SELECT 1 FROM face_templates WHERE student_id = p_student_id AND source = 'GATE_ADAPTIVE'
              AND revoked_at IS NULL AND created_at > now() - interval '20 hours') THEN
    RETURN false;
  END IF;
  INSERT INTO face_templates (student_id, consent_id, embedding, model_version, quality_score, pad_score, source)
  VALUES (p_student_id, v_consent, p_embedding::vector, p_model_version,
          greatest(0, least(1, COALESCE(p_quality, 0))), greatest(0, least(1, COALESCE(p_pad, 0))), 'GATE_ADAPTIVE');
  UPDATE face_templates SET revoked_at = now(), revoked_reason = 'ADAPTIVE_LIMIT'
   WHERE id IN (SELECT id FROM face_templates WHERE student_id = p_student_id AND revoked_at IS NULL
                 AND source = 'GATE_ADAPTIVE' ORDER BY created_at DESC OFFSET 3);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_face_templates(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_face_templates(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.add_gate_face_template(TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_gate_face_template(TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;
