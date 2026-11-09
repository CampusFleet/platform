import { supabaseAdmin } from "@/lib/supabaseClient";
import {
  StudentFaceProfile,
  BusGateEvent,
  BusSecurityIncident,
  FaceMatchCandidate,
  BusGateType,
  SecurityIncidentType,
  SecuritySeverity,
  IncidentStatus,
} from "@/lib/types";

/** Cosine distance matching threshold (Lower = stricter). 0.32 is high confidence */
export const DEFAULT_FACE_MATCH_THRESHOLD = 0.35;

/**
 * Validates and normalizes a 512-dimensional face embedding vector.
 */
export function normalizeVector(vector: number[]): number[] {
  if (!Array.isArray(vector) || vector.length !== 512) {
    throw new Error(`Invalid face vector: Expected 512 dimensions, got ${vector?.length || 0}`);
  }

  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    const val = vector[i];
    if (typeof val !== "number" || isNaN(val) || !isFinite(val)) {
      throw new Error(`Corrupted face vector at index ${i}: invalid number`);
    }
    sumSq += val * val;
  }

  const norm = Math.sqrt(sumSq);
  if (norm < 1e-6) {
    throw new Error("Zero-magnitude face vector cannot be normalized");
  }

  return vector.map((v) => v / norm);
}

/**
 * Computes cosine distance between two 512-d unit vectors: 1.0 - (A . B)
 * Range: 0.0 (identical) to 2.0 (opposite). Match threshold is typically <= 0.35.
 */
export function computeCosineDistance(vecA: number[], vecB: number[]): number {
  if (vecA.length !== 512 || vecB.length !== 512) {
    throw new Error("Vectors must both be 512 dimensions");
  }

  let dotProduct = 0;
  for (let i = 0; i < 512; i++) {
    dotProduct += vecA[i] * vecB[i];
  }

  return Math.max(0, 1 - dotProduct);
}

/**
 * Saves or updates a student's enrolled face profile in PostgreSQL.
 * Compliance: One-way 512-d mathematical vector only. Raw images are never stored.
 */
export async function saveStudentFaceProfile(
  studentId: string,
  rawEmbedding: number[],
  options: {
    qualityScore?: number;
    livenessScore?: number;
    biometricConsent?: boolean;
    metadata?: Record<string, any>;
  } = {}
): Promise<StudentFaceProfile> {
  const normalized = normalizeVector(rawEmbedding);
  const vectorString = `[${normalized.join(",")}]`;

  const { data, error } = await (supabaseAdmin as any)
    .from("student_face_profiles")
    .upsert(
      {
        student_id: studentId,
        face_embedding: vectorString,
        quality_score: Math.max(0, Math.min(1, options.qualityScore ?? 1.0)),
        liveness_score: Math.max(0, Math.min(1, options.livenessScore ?? 1.0)),
        biometric_consent_given: options.biometricConsent ?? true,
        consent_timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        metadata: options.metadata || {},
      },
      { onConflict: "student_id" }
    )
    .select("id, student_id, quality_score, liveness_score, enrolled_at, updated_at, biometric_consent_given, is_active")
    .single();

  if (error) {
    throw new Error(`Failed to save face profile: ${error.message}`);
  }

  return {
    id: data.id,
    studentId: data.student_id,
    qualityScore: data.quality_score,
    livenessScore: data.liveness_score,
    enrolledAt: data.enrolled_at,
    updatedAt: data.updated_at,
    biometricConsentGiven: data.biometric_consent_given,
    consentTimestamp: data.enrolled_at,
    isActive: data.is_active,
  };
}

/**
 * Searches for matching enrolled students via PostgreSQL HNSW Approximate Nearest Neighbor index.
 */
export async function matchStudentFace(
  queryEmbedding: number[],
  threshold: number = DEFAULT_FACE_MATCH_THRESHOLD,
  options: {
    matchCount?: number;
    filterRouteId?: string;
  } = {}
): Promise<FaceMatchCandidate[]> {
  const normalized = normalizeVector(queryEmbedding);
  const vectorString = `[${normalized.join(",")}]`;

  const { data, error } = await (supabaseAdmin as any).rpc("match_student_face", {
    query_embedding: vectorString,
    match_threshold: threshold,
    match_count: options.matchCount || 1,
    filter_route_id: options.filterRouteId || null,
  });

  if (error) {
    throw new Error(`Face matching failed: ${error.message}`);
  }

  if (!Array.isArray(data)) return [];

  return data.map((row: any) => ({
    studentId: row.student_id,
    studentName: row.student_name,
    studentIdCode: row.student_id_code,
    primaryRouteId: row.primary_route_id,
    distance: Number(row.distance),
    confidence: Number(row.confidence),
  }));
}

/**
 * Records an autonomous Gate Event (GATE_IN / BOARDED or GATE_OUT / ALIGHTED)
 */
export async function recordBusGateEvent(event: {
  busId: number;
  tripId?: string | null;
  gateType: BusGateType;
  studentId?: string | null;
  matchedDistance?: number | null;
  confidenceScore?: number | null;
  isAuthorized: boolean;
  latitude: number;
  longitude: number;
  stopName?: string | null;
  metadata?: Record<string, any>;
}): Promise<BusGateEvent> {
  const { data, error } = await (supabaseAdmin as any)
    .from("bus_gate_events")
    .insert({
      bus_id: event.busId,
      trip_id: event.tripId || null,
      gate_type: event.gateType,
      student_id: event.studentId || null,
      matched_distance: event.matchedDistance ?? null,
      confidence_score: event.confidenceScore ?? null,
      is_authorized: event.isAuthorized,
      latitude: event.latitude,
      longitude: event.longitude,
      stop_name: event.stopName || null,
      metadata: event.metadata || {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record gate event: ${error.message}`);
  }

  return {
    id: data.id,
    busId: data.bus_id,
    tripId: data.trip_id,
    gateType: data.gate_type,
    studentId: data.student_id,
    matchedDistance: data.matched_distance,
    confidenceScore: data.confidence_score,
    isAuthorized: data.is_authorized,
    latitude: data.latitude,
    longitude: data.longitude,
    stopName: data.stop_name,
    createdAt: data.created_at,
    metadata: data.metadata,
  };
}

/**
 * Dispatches a Security Incident (Unauthorized intruder, wrong bus, etc.)
 */
export async function reportSecurityIncident(incident: {
  busId: number;
  tripId?: string | null;
  incidentType: SecurityIncidentType;
  severity: SecuritySeverity;
  stopName?: string | null;
  latitude: number;
  longitude: number;
  matchedStudentId?: string | null;
  evidenceUrl?: string | null;
  metadata?: Record<string, any>;
}): Promise<BusSecurityIncident> {
  const { data, error } = await (supabaseAdmin as any)
    .from("bus_security_incidents")
    .insert({
      bus_id: incident.busId,
      trip_id: incident.tripId || null,
      incident_type: incident.incidentType,
      severity: incident.severity,
      stop_name: incident.stopName || null,
      latitude: incident.latitude,
      longitude: incident.longitude,
      matched_student_id: incident.matchedStudentId || null,
      evidence_url: incident.evidenceUrl || null,
      status: "ACTIVE",
      metadata: incident.metadata || {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to report security incident: ${error.message}`);
  }

  return {
    id: data.id,
    busId: data.bus_id,
    tripId: data.trip_id,
    incidentType: data.incident_type,
    severity: data.severity,
    stopName: data.stop_name,
    latitude: data.latitude,
    longitude: data.longitude,
    matchedStudentId: data.matched_student_id,
    evidenceUrl: data.evidence_url,
    status: data.status,
    createdAt: data.created_at,
    metadata: data.metadata,
  };
}

/**
 * Retrieves security incidents with optional filtering by status, severity, or bus.
 */
export async function getSecurityIncidents(options?: {
  status?: IncidentStatus;
  severity?: SecuritySeverity;
  busId?: number;
  limit?: number;
}): Promise<BusSecurityIncident[]> {
  let query = (supabaseAdmin as any)
    .from("bus_security_incidents")
    .select("*, buses(bus_number, registration_no)")
    .order("created_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.severity) {
    query = query.eq("severity", options.severity);
  }
  if (options?.busId) {
    query = query.eq("bus_id", options.busId);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  } else {
    query = query.limit(50);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch security incidents: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    busId: row.bus_id,
    busNumber: row.buses?.bus_number ? String(row.buses.bus_number) : undefined,
    busRegistrationNo: row.buses?.registration_no,
    tripId: row.trip_id,
    incidentType: row.incident_type,
    severity: row.severity,
    stopName: row.stop_name,
    latitude: row.latitude,
    longitude: row.longitude,
    matchedStudentId: row.matched_student_id,
    evidenceUrl: row.evidence_url,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    resolutionNotes: row.resolution_notes,
    metadata: row.metadata,
  }));
}

/**
 * Updates an incident's resolution lifecycle status (ACKNOWLEDGED / RESOLVED) with operator notes.
 */
export async function updateSecurityIncidentStatus(
  incidentId: string,
  update: {
    status: IncidentStatus;
    resolvedBy?: string;
    resolutionNotes?: string;
  }
): Promise<BusSecurityIncident> {
  const updatePayload: Record<string, any> = {
    status: update.status,
  };

  let validatedResolverId: string | null = null;
  if (update.resolvedBy) {
    const { data: userExists } = await (supabaseAdmin as any)
      .from("users")
      .select("id")
      .eq("id", update.resolvedBy)
      .maybeSingle();
    if (userExists?.id) {
      validatedResolverId = userExists.id;
    }
  }

  if (update.status === "RESOLVED") {
    updatePayload.resolved_at = new Date().toISOString();
    if (validatedResolverId) updatePayload.resolved_by = validatedResolverId;
    if (update.resolutionNotes) updatePayload.resolution_notes = update.resolutionNotes;
  } else if (update.status === "ACKNOWLEDGED") {
    if (validatedResolverId) updatePayload.resolved_by = validatedResolverId;
    if (update.resolutionNotes) updatePayload.resolution_notes = update.resolutionNotes;
  }

  const { data, error } = await (supabaseAdmin as any)
    .from("bus_security_incidents")
    .update(updatePayload)
    .eq("id", incidentId)
    .select("*, buses(bus_number, registration_no)")
    .single();

  if (error) {
    throw new Error(`Failed to update security incident: ${error.message}`);
  }

  return {
    id: data.id,
    busId: data.bus_id,
    busNumber: data.buses?.bus_number ? String(data.buses.bus_number) : undefined,
    busRegistrationNo: data.buses?.registration_no,
    tripId: data.trip_id,
    incidentType: data.incident_type,
    severity: data.severity,
    stopName: data.stop_name,
    latitude: data.latitude,
    longitude: data.longitude,
    matchedStudentId: data.matched_student_id,
    evidenceUrl: data.evidence_url,
    status: data.status,
    createdAt: data.created_at,
    resolvedAt: data.resolved_at,
    resolvedBy: data.resolved_by,
    resolutionNotes: data.resolution_notes,
    metadata: data.metadata,
  };
}
