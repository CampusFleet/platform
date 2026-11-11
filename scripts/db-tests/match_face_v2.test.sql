-- Self-checking test for match_face_v2. Runs inside a transaction and ROLLS BACK (no data left behind).
-- Usage: node scratch/db_query.mjs --write --file=scripts/db-tests/match_face_v2.test.sql
BEGIN;
DO $$
DECLARE
  s1 TEXT; s2 TEXT; s3 TEXT; c1 UUID; c2 UUID; c3 UUID;
  base FLOAT8[] := array_fill(0::float8, ARRAY[128]);
  v_a vector; v_b vector; v_c vector; q vector;
  r RECORD; n INT; first_id TEXT;
BEGIN
  SELECT id INTO s1 FROM students ORDER BY id LIMIT 1;
  SELECT id INTO s2 FROM students ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO s3 FROM students ORDER BY id OFFSET 2 LIMIT 1;

  -- unit vectors: a = e0, b = (e0 + e1)/√2, c = e2  ; query = e0
  v_a := (SELECT array_agg(CASE WHEN i = 1 THEN 1 ELSE 0 END ORDER BY i)::vector FROM generate_series(1,128) i);
  v_b := (SELECT array_agg(CASE WHEN i IN (1,2) THEN 0.70710678 ELSE 0 END ORDER BY i)::vector FROM generate_series(1,128) i);
  v_c := (SELECT array_agg(CASE WHEN i = 3 THEN 1 ELSE 0 END ORDER BY i)::vector FROM generate_series(1,128) i);
  q := v_a;

  INSERT INTO biometric_consents (student_id, consent_version) VALUES (s1, 'test') RETURNING id INTO c1;
  INSERT INTO biometric_consents (student_id, consent_version) VALUES (s2, 'test') RETURNING id INTO c2;
  INSERT INTO biometric_consents (student_id, consent_version) VALUES (s3, 'test') RETURNING id INTO c3;
  INSERT INTO face_templates (student_id, consent_id, embedding, model_version, quality_score, pad_score)
  VALUES (s1, c1, v_a, 'test-model', 0.9, 0.9), (s2, c2, v_b, 'test-model', 0.9, 0.9), (s3, c3, v_c, 'test-model', 0.9, 0.9);

  -- 1. ordering: s1 (d=0) before s2 (d≈0.293); s3 (d=1) excluded by threshold 0.5
  SELECT count(*) INTO n FROM match_face_v2(q, 'test-model', 0.5, NULL, 5);
  ASSERT n = 2, format('expected 2 matches, got %s', n);
  SELECT student_id INTO first_id FROM match_face_v2(q, 'test-model', 0.5, NULL, 5) LIMIT 1;
  ASSERT first_id = s1, 'closest match must come first';

  -- 2. candidate scope: only s2 allowed
  SELECT student_id INTO first_id FROM match_face_v2(q, 'test-model', 0.5, ARRAY[s2], 5) LIMIT 1;
  ASSERT first_id = s2, 'candidate list must restrict results';

  -- 3. model version isolation
  SELECT count(*) INTO n FROM match_face_v2(q, 'other-model', 0.5, NULL, 5);
  ASSERT n = 0, 'templates from another model version must never match';

  -- 4. withdrawn consent excluded
  UPDATE biometric_consents SET withdrawn_at = now() WHERE id = c1;
  SELECT student_id INTO first_id FROM match_face_v2(q, 'test-model', 0.5, NULL, 5) LIMIT 1;
  ASSERT first_id = s2, 'withdrawn consent must not match';

  -- 5. revoked template excluded
  UPDATE face_templates SET revoked_at = now() WHERE student_id = s2 AND model_version = 'test-model';
  SELECT count(*) INTO n FROM match_face_v2(q, 'test-model', 0.5, NULL, 5);
  ASSERT n = 0, 'revoked template must not match';

  RAISE NOTICE 'match_face_v2: all 5 assertions passed';
END $$;
ROLLBACK;
