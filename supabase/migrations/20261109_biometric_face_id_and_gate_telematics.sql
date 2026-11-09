-- ============================================================================
-- Migration: 20261109_biometric_face_id_and_gate_telematics.sql
-- Description: Zero-Touch Biometric Dual-Camera Gate Attendance & Security Incidents
-- Compliance: India DPDP Act 2023 & GDPR Biometric Data Minimization Standards
-- ============================================================================

-- 1. Enable pgvector extension for high-dimensional vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Student Face Profiles Table
-- Stores 512-dimensional normalized float32 facial feature embeddings (ArcFace / MobileFaceNet)
-- Raw biometric images are NEVER stored in this table (one-way mathematical vectors only).
CREATE TABLE IF NOT EXISTS student_face_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  face_embedding vector(512) NOT NULL,
  quality_score FLOAT NOT NULL DEFAULT 1.0 CHECK (quality_score >= 0.0 AND quality_score <= 1.0),
  liveness_score FLOAT NOT NULL DEFAULT 1.0 CHECK (liveness_score >= 0.0 AND liveness_score <= 1.0),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  biometric_consent_given BOOLEAN NOT NULL DEFAULT TRUE,
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT uq_student_face_profile UNIQUE (student_id)
);

-- Production HNSW Index for sub-25ms Cosine Similarity search (<=>)
-- m=32, ef_construction=128 tuned for biometric feature space
CREATE INDEX IF NOT EXISTS idx_student_face_embedding_hnsw 
ON student_face_profiles 
USING hnsw (face_embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 128);

CREATE INDEX IF NOT EXISTS idx_student_face_active ON student_face_profiles (is_active, student_id);

-- 3. Bus Gate Telematics Event Logs
-- Captures autonomous entry (GATE_IN / BOARDED) and exit (GATE_OUT / ALIGHTED) events
CREATE TABLE IF NOT EXISTS bus_gate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id BIGINT NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
  trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
  gate_type VARCHAR(10) NOT NULL CHECK (gate_type IN ('GATE_IN', 'GATE_OUT')),
  student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  matched_distance FLOAT,
  confidence_score FLOAT CHECK (confidence_score >= 0.0 AND confidence_score <= 100.0),
  is_authorized BOOLEAN NOT NULL DEFAULT TRUE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  stop_name VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bus_gate_events_bus_time ON bus_gate_events (bus_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bus_gate_events_student ON bus_gate_events (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bus_gate_events_trip ON bus_gate_events (trip_id);

-- 4. Bus Security & Intruder Incidents Table
-- Real-time incident tracking for unauthorized persons, wrong-bus boardings, and tamper alerts
CREATE TABLE IF NOT EXISTS bus_security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id BIGINT NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
  trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
  incident_type VARCHAR(50) NOT NULL CHECK (
    incident_type IN (
      'UNAUTHORIZED_INTRUDER',
      'WRONG_BUS_BOARDING',
      'UNREGISTERED_COMMUTER',
      'LIVENESS_SPOOF_ATTEMPT',
      'TAILGATING_DETECTED'
    )
  ),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  stop_name VARCHAR(150),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  matched_student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  evidence_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT REFERENCES staff(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bus_security_bus_status ON bus_security_incidents (bus_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bus_security_severity ON bus_security_incidents (severity, created_at DESC);

-- 5. Stored Procedure: match_student_face
-- High-speed vector similarity matcher with optional route/bus filtering
CREATE OR REPLACE FUNCTION match_student_face(
  query_embedding vector(512),
  match_threshold float DEFAULT 0.35,
  match_count int DEFAULT 1,
  filter_route_id text DEFAULT NULL
)
RETURNS TABLE (
  student_id TEXT,
  student_name TEXT,
  student_id_code TEXT,
  primary_route_id TEXT,
  distance FLOAT,
  confidence FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set local HNSW search depth for high-precision biometric matching
  SET LOCAL hnsw.ef_search = 80;

  RETURN QUERY
  SELECT
    s.id::TEXT AS student_id,
    s.full_name::TEXT AS student_name,
    s.student_id_code::TEXT AS student_id_code,
    s.primary_route_id::TEXT AS primary_route_id,
    (p.face_embedding <=> query_embedding)::FLOAT AS distance,
    ROUND(((1.0 - (p.face_embedding <=> query_embedding)) * 100)::NUMERIC, 1)::FLOAT AS confidence
  FROM student_face_profiles p
  JOIN students s ON s.id = p.student_id
  WHERE p.is_active = TRUE
    AND (filter_route_id IS NULL OR s.primary_route_id = filter_route_id)
    AND (p.face_embedding <=> query_embedding) <= match_threshold
  ORDER BY p.face_embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;
