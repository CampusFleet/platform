-- Face ID model upgrade: SFace (128-d) → AuraFace v1 (512-d, Apache-2.0). See docs/CODEMAP.md section 9.
-- Apply BEFORE deploying the new face-service. Needs 20261123_face_templates_variety.sql.
--
-- Templates of the two models cannot be compared, so every existing face template is deleted and
-- students set up Face ID again (the data is demo data). Consents are kept; the onboarding page asks
-- for the scan again because there is no active template.

BEGIN;

DELETE FROM public.face_templates;
UPDATE public.bus_security_incidents SET face_embedding = NULL WHERE face_embedding IS NOT NULL;

DROP INDEX IF EXISTS public.idx_face_templates_embedding_hnsw;
DO $$
DECLARE r RECORD;
BEGIN
  -- Drop any vector index on face_templates.embedding whatever its name.
  FOR r IN SELECT indexname FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'face_templates' AND indexdef ILIKE '%embedding%vector_cosine_ops%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;
END $$;

ALTER TABLE public.face_templates ALTER COLUMN embedding TYPE vector(512);
ALTER TABLE public.bus_security_incidents ALTER COLUMN face_embedding TYPE vector(512);
CREATE INDEX IF NOT EXISTS idx_face_templates_embedding_hnsw
  ON public.face_templates USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

DROP FUNCTION IF EXISTS public.match_face_v2(vector, TEXT, DOUBLE PRECISION, TEXT[], INTEGER);
CREATE FUNCTION public.match_face_v2(
  p_embedding vector(512),
  p_model_version TEXT,
  p_threshold DOUBLE PRECISION,
  p_candidates TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE (student_id TEXT, distance DOUBLE PRECISION)
LANGUAGE sql STABLE
AS $$
  SELECT t.student_id, MIN(t.embedding <=> p_embedding)::DOUBLE PRECISION AS distance
  FROM public.face_templates t
  JOIN public.biometric_consents c ON c.id = t.consent_id AND c.withdrawn_at IS NULL
  WHERE t.revoked_at IS NULL
    AND t.model_version = p_model_version
    AND (p_candidates IS NULL OR t.student_id = ANY (p_candidates))
    AND (t.embedding <=> p_embedding) <= p_threshold
  GROUP BY t.student_id
  ORDER BY distance ASC
  LIMIT p_limit;
$$;
REVOKE EXECUTE ON FUNCTION public.match_face_v2(vector, TEXT, DOUBLE PRECISION, TEXT[], INTEGER) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.match_face_v2(vector, TEXT, DOUBLE PRECISION, TEXT[], INTEGER) TO service_role;

-- Provisional threshold (cosine distance 0.55 = similarity 0.45; ArcFace-class models usually
-- separate genuine pairs below ~0.4 and impostors above ~0.8). Recalibrate with /api/biometrics/metrics.
INSERT INTO public.face_match_config (model_version, threshold, notes)
VALUES ('yunet2023mar+auraface-v1+minifasnet-v2v1se/1', 0.55, 'Provisional pre-calibration threshold (AuraFace v1, 512-d)')
ON CONFLICT (model_version) DO UPDATE SET threshold = EXCLUDED.threshold, notes = EXCLUDED.notes, updated_at = now();

COMMIT;
