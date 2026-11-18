-- One incident per unknown person (see docs/CODEMAP.md section 9 → "Unknown persons").
-- Needs 20261124_face_model_auraface.sql (vector(512)).
--
-- Before: every door crossing by an unregistered face created a new UNAUTHORIZED_INTRUDER incident
-- and alert, so one person seen twice looked like two people to the manager.
-- Now record_intruder_sighting() compares the face with the open intruder incidents on that bus
-- (stored face template, within the match threshold and time window) under a per-bus lock:
--   * same person  → a new row in bus_incident_sightings, sighting_count + 1, no new alert;
--   * new person   → a new incident with its first sighting (alert as before).
-- The face template stays only for INTRUDER_FACE_RETENTION_HOURS (retention job clears it).

ALTER TABLE public.bus_security_incidents
  ADD COLUMN IF NOT EXISTS sighting_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.bus_incident_sightings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.bus_security_incidents(id) ON DELETE CASCADE,
  capture_id UUID REFERENCES public.gate_captures(id) ON DELETE SET NULL,
  bus_id INTEGER,
  door TEXT,
  evidence_blob_key TEXT,
  distance DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, capture_id)
);
CREATE INDEX IF NOT EXISTS idx_incident_sightings_incident ON public.bus_incident_sightings (incident_id, captured_at DESC);
ALTER TABLE public.bus_incident_sightings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bus_incident_sightings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_intruder_sighting(
  p_bus_id INTEGER,
  p_trip_id TEXT,
  p_capture_id UUID,
  p_embedding TEXT,
  p_evidence_key TEXT,
  p_threshold DOUBLE PRECISION,
  p_window_hours INTEGER,
  p_door TEXT,
  p_captured_at TIMESTAMPTZ,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_emb vector := p_embedding::vector;
  v_inc RECORD;
  v_id UUID;
BEGIN
  -- Serialise per bus: two crossings processed at the same moment cannot both open an incident.
  PERFORM pg_advisory_xact_lock(918273, p_bus_id);

  -- Same capture retried after a later failure: return what was recorded.
  SELECT s.incident_id INTO v_id FROM bus_incident_sightings s WHERE s.capture_id = p_capture_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('incident_id', v_id, 'new', false, 'duplicate_capture', true);
  END IF;

  SELECT i.id, (i.face_embedding <=> v_emb) AS d INTO v_inc
    FROM bus_security_incidents i
   WHERE i.bus_id = p_bus_id
     AND i.incident_type = 'UNAUTHORIZED_INTRUDER'
     AND i.status <> 'RESOLVED'
     AND i.face_embedding IS NOT NULL
     AND i.created_at >= p_captured_at - make_interval(hours => p_window_hours)
     AND (i.face_embedding <=> v_emb) <= p_threshold
   ORDER BY i.face_embedding <=> v_emb
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO bus_incident_sightings (incident_id, capture_id, bus_id, door, evidence_blob_key, distance, captured_at)
    VALUES (v_inc.id, p_capture_id, p_bus_id, p_door, p_evidence_key, v_inc.d, p_captured_at)
    ON CONFLICT DO NOTHING;
    UPDATE bus_security_incidents
       SET sighting_count = sighting_count + 1,
           last_seen_at = greatest(COALESCE(last_seen_at, created_at), p_captured_at)
     WHERE id = v_inc.id;
    RETURN jsonb_build_object('incident_id', v_inc.id, 'new', false,
                              'sightings', (SELECT sighting_count FROM bus_security_incidents WHERE id = v_inc.id));
  END IF;

  INSERT INTO bus_security_incidents (bus_id, trip_id, incident_type, severity, stop_name, latitude, longitude,
                                      capture_id, evidence_blob_key, face_embedding, status, metadata,
                                      sighting_count, last_seen_at)
  VALUES (p_bus_id, p_trip_id, 'UNAUTHORIZED_INTRUDER', 'CRITICAL', NULL, COALESCE(p_latitude, 0), COALESCE(p_longitude, 0),
          p_capture_id, p_evidence_key, v_emb, 'ACTIVE', COALESCE(p_metadata, '{}'::jsonb), 1, p_captured_at)
  RETURNING id INTO v_id;
  INSERT INTO bus_incident_sightings (incident_id, capture_id, bus_id, door, evidence_blob_key, distance, captured_at)
  VALUES (v_id, p_capture_id, p_bus_id, p_door, p_evidence_key, 0, p_captured_at);
  RETURN jsonb_build_object('incident_id', v_id, 'new', true, 'sightings', 1);
END;
$$;

REVOKE ALL ON FUNCTION public.record_intruder_sighting(INTEGER, TEXT, UUID, TEXT, TEXT, DOUBLE PRECISION, INTEGER, TEXT, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_intruder_sighting(INTEGER, TEXT, UUID, TEXT, TEXT, DOUBLE PRECISION, INTEGER, TEXT, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, JSONB) TO service_role;
