-- ==============================================================================
-- Face ID v2 (hybrid): consents, templates, gate devices, captures, match function.
-- Additive only. Legacy student_face_profiles (512-d, non-commercial model) is
-- left untouched and is never read by v2 code.
-- ==============================================================================
BEGIN;

-- ── Consent (DPDP Act 2023: explicit, versioned, purpose-bound, withdrawable) ──
CREATE TABLE IF NOT EXISTS public.biometric_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'BUS_BOARDING_ATTENDANCE',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  withdrawn_at TIMESTAMPTZ,
  withdrawal_reason TEXT,
  client_ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_biometric_consents_student ON public.biometric_consents (student_id, granted_at DESC);

-- ── Face templates (128-d SFace, server-generated only) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.face_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  consent_id UUID NOT NULL REFERENCES public.biometric_consents(id) ON DELETE CASCADE,
  embedding vector(128) NOT NULL,
  model_version TEXT NOT NULL,
  quality_score DOUBLE PRECISION NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
  pad_score DOUBLE PRECISION NOT NULL CHECK (pad_score BETWEEN 0 AND 1),
  source TEXT NOT NULL DEFAULT 'ENROLLMENT' CHECK (source IN ('ENROLLMENT', 'CALIBRATION')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_face_templates_student_active
  ON public.face_templates (student_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_face_templates_hnsw
  ON public.face_templates USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ── Server-side match threshold per model version (from calibration) ───────────
CREATE TABLE IF NOT EXISTS public.face_match_config (
  model_version TEXT PRIMARY KEY,
  threshold DOUBLE PRECISION NOT NULL CHECK (threshold > 0 AND threshold < 1),
  fmr_target DOUBLE PRECISION,
  fnmr_measured DOUBLE PRECISION,
  calibration_pairs INTEGER,
  calibrated_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Provisional value until Task 11 calibration (cosine distance; lower = stricter)
INSERT INTO public.face_match_config (model_version, threshold, notes)
VALUES ('yunet2023mar+sface2021dec+minifasnet-v2v1se/1', 0.50, 'Provisional pre-calibration threshold')
ON CONFLICT (model_version) DO NOTHING;

-- ── Gate devices (MAC → bus pairing, same workflow as RFID) ────────────────────
-- No secret stored: device key = HMAC(GATE_DEVICE_MASTER_KEY, mac:key_version).
-- Re-pairing bumps key_version, which revokes the old key.
CREATE TABLE IF NOT EXISTS public.gate_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_mac TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'PI_GATE' CHECK (kind IN ('PI_GATE', 'ESP32_RFID', 'PHONE')),
  bus_id BIGINT REFERENCES public.buses(id) ON DELETE SET NULL,
  door TEXT NOT NULL DEFAULT 'BOTH' CHECK (door IN ('IN', 'OUT', 'BOTH')),
  label TEXT,
  key_version INTEGER NOT NULL DEFAULT 1,
  paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paired_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  last_ip TEXT,
  firmware_version TEXT,
  health JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_gate_devices_bus ON public.gate_devices (bus_id) WHERE revoked_at IS NULL;

-- ── Gate captures (one best crop per door crossing) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.gate_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.gate_devices(id) ON DELETE RESTRICT,
  bus_id BIGINT NOT NULL REFERENCES public.buses(id) ON DELETE RESTRICT,
  trip_id TEXT REFERENCES public.trips(id) ON DELETE SET NULL,
  door TEXT NOT NULL CHECK (door IN ('IN', 'OUT')),
  idempotency_key TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  gps_accuracy_m DOUBLE PRECISION,
  track_id TEXT,
  evidence_blob_key TEXT NOT NULL,
  evidence_purged_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'DECIDED', 'REJECTED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  model_version TEXT,
  quality JSONB,
  pad JSONB,
  matched_student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
  match_distance DOUBLE PRECISION,
  match_scope TEXT CHECK (match_scope IN ('BUS_ROSTER', 'CAMPUS')),
  outcome TEXT,
  decision JSONB,
  error TEXT,
  processed_at TIMESTAMPTZ,
  UNIQUE (device_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_gate_captures_queue ON public.gate_captures (status, captured_at) WHERE status IN ('PENDING', 'PROCESSING', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_gate_captures_bus_time ON public.gate_captures (bus_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_gate_captures_student ON public.gate_captures (matched_student_id, captured_at DESC);

-- ── Incidents: new types + link to capture/template so an exit can resolve them ─
ALTER TABLE public.bus_security_incidents DROP CONSTRAINT IF EXISTS bus_security_incidents_incident_type_check;
ALTER TABLE public.bus_security_incidents ADD CONSTRAINT bus_security_incidents_incident_type_check CHECK (
  incident_type IN ('UNAUTHORIZED_INTRUDER', 'WRONG_BUS_BOARDING', 'UNREGISTERED_COMMUTER',
                    'LIVENESS_SPOOF_ATTEMPT', 'TAILGATING_DETECTED', 'UNEXPECTED_EXIT', 'UNKNOWN_DEBOARDER')
);
ALTER TABLE public.bus_security_incidents
  ADD COLUMN IF NOT EXISTS capture_id UUID REFERENCES public.gate_captures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_blob_key TEXT,
  ADD COLUMN IF NOT EXISTS face_embedding vector(128);
CREATE INDEX IF NOT EXISTS idx_bus_security_open_bus ON public.bus_security_incidents (bus_id, created_at DESC) WHERE status <> 'RESOLVED';

-- ── Alighting details on reservations ──────────────────────────────────────────
ALTER TABLE public.bus_reservations
  ADD COLUMN IF NOT EXISTS alighted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alighted_stop_id TEXT REFERENCES public.stops(id) ON DELETE SET NULL;

-- ── Biometric access audit (who viewed evidence / changed templates) ───────────
CREATE TABLE IF NOT EXISTS public.biometric_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  subject_student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
  incident_id UUID REFERENCES public.bus_security_incidents(id) ON DELETE SET NULL,
  capture_id UUID REFERENCES public.gate_captures(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biometric_access_log_time ON public.biometric_access_log (created_at DESC);

-- ── Matching: candidate-scoped first, campus-wide fallback ─────────────────────
-- p_candidates NULL → search every active template (HNSW); otherwise exact scan of the list.
CREATE OR REPLACE FUNCTION public.match_face_v2(
  p_embedding vector(128),
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

-- ── Lock down: server (service role) only ──────────────────────────────────────
ALTER TABLE public.biometric_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_match_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.biometric_consents, public.face_templates, public.face_match_config,
  public.gate_devices, public.gate_captures, public.biometric_access_log FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_face_v2(vector, TEXT, DOUBLE PRECISION, TEXT[], INTEGER) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.match_face_v2(vector, TEXT, DOUBLE PRECISION, TEXT[], INTEGER) TO service_role;

COMMIT;
