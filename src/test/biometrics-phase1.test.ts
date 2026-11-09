import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeVector,
  computeCosineDistance,
  DEFAULT_FACE_MATCH_THRESHOLD,
  saveStudentFaceProfile,
  matchStudentFace,
  recordBusGateEvent,
  reportSecurityIncident,
} from "@/lib/biometrics";
import { supabaseAdmin } from "@/lib/supabaseClient";

vi.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe("Phase 1: Biometric Vector Math & Validation Standards", () => {
  it("normalizes a 512-dimension vector to unit Euclidean length (L2 norm = 1.0)", () => {
    const rawVec = Array.from({ length: 512 }, (_, i) => i * 0.1);
    const normalized = normalizeVector(rawVec);

    expect(normalized).toHaveLength(512);

    const sumSq = normalized.reduce((acc, v) => acc + v * v, 0);
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it("throws descriptive error when vector is not 512 dimensions", () => {
    const shortVec = [0.1, 0.2, 0.3];
    expect(() => normalizeVector(shortVec)).toThrow(/Expected 512 dimensions/);

    const longVec = Array.from({ length: 513 }, () => 0.1);
    expect(() => normalizeVector(longVec)).toThrow(/Expected 512 dimensions/);
  });

  it("throws error when vector contains NaN or infinite values", () => {
    const corruptedVec = Array.from({ length: 512 }, () => 0.1);
    corruptedVec[42] = NaN;
    expect(() => normalizeVector(corruptedVec)).toThrow(/invalid number/);
  });

  it("computes cosine distance accurately", () => {
    // 1. Identical unit vectors must yield 0 distance
    const vecA = normalizeVector(Array.from({ length: 512 }, () => 1.0));
    expect(computeCosineDistance(vecA, vecA)).toBeCloseTo(0.0, 5);

    // 2. Orthogonal vectors yield distance 1.0
    const vec1 = Array.from({ length: 512 }, () => 0);
    const vec2 = Array.from({ length: 512 }, () => 0);
    vec1[0] = 1.0;
    vec2[1] = 1.0;
    expect(computeCosineDistance(vec1, vec2)).toBeCloseTo(1.0, 5);

    // 3. Opposite vectors yield distance 2.0
    const vecOpposite = vec1.map((v) => -v);
    expect(computeCosineDistance(vec1, vecOpposite)).toBeCloseTo(2.0, 5);
  });

  it("uses industry-standard 0.35 default threshold for face verification", () => {
    expect(DEFAULT_FACE_MATCH_THRESHOLD).toBe(0.35);
  });
});

describe("Phase 1: Database Operations & Biometrics RPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves student face profile to Supabase with one-way mathematical embedding", async () => {
    const mockStudentId = "student-test-uuid";
    const dummyEmbedding = Array.from({ length: 512 }, () => 0.5);

    const mockSelect = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: "profile-uuid-1",
          student_id: mockStudentId,
          quality_score: 0.96,
          liveness_score: 0.99,
          enrolled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          biometric_consent_given: true,
          is_active: true,
        },
        error: null,
      }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: mockSelect,
    });

    (supabaseAdmin.from as any).mockReturnValue({
      upsert: mockUpsert,
    });

    const result = await saveStudentFaceProfile(mockStudentId, dummyEmbedding, {
      qualityScore: 0.96,
      livenessScore: 0.99,
      biometricConsent: true,
    });

    expect(result.studentId).toBe(mockStudentId);
    expect(result.qualityScore).toBe(0.96);
    expect(result.livenessScore).toBe(0.99);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("calls match_student_face RPC and parses match candidates with confidence", async () => {
    const dummyQuery = Array.from({ length: 512 }, () => 0.5);

    (supabaseAdmin.rpc as any).mockResolvedValue({
      data: [
        {
          student_id: "student-101",
          student_name: "Aarav Sharma",
          student_id_code: "STU-2026-001",
          primary_route_id: "1",
          distance: 0.12,
          confidence: 88.0,
        },
      ],
      error: null,
    });

    const matches = await matchStudentFace(dummyQuery, 0.35, {
      matchCount: 1,
      filterRouteId: "1",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].studentName).toBe("Aarav Sharma");
    expect(matches[0].distance).toBe(0.12);
    expect(matches[0].confidence).toBe(88.0);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "match_student_face",
      expect.objectContaining({
        match_threshold: 0.35,
        match_count: 1,
        filter_route_id: "1",
      })
    );
  });

  it("records gate telematics events (GATE_IN / BOARDED)", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "event-uuid-1",
            bus_id: 40,
            trip_id: "trip-40",
            gate_type: "GATE_IN",
            student_id: "student-101",
            matched_distance: 0.15,
            confidence_score: 85.0,
            is_authorized: true,
            latitude: 28.5355,
            longitude: 77.3910,
            stop_name: "Ganna Center",
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      }),
    });

    (supabaseAdmin.from as any).mockReturnValue({
      insert: mockInsert,
    });

    const event = await recordBusGateEvent({
      busId: 40,
      tripId: "trip-40",
      gateType: "GATE_IN",
      studentId: "student-101",
      matchedDistance: 0.15,
      confidenceScore: 85.0,
      isAuthorized: true,
      latitude: 28.5355,
      longitude: 77.3910,
      stopName: "Ganna Center",
    });

    expect(event.busId).toBe(40);
    expect(event.gateType).toBe("GATE_IN");
    expect(event.isAuthorized).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("reports security incidents when an unauthorized intruder is detected", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "incident-uuid-1",
            bus_id: 40,
            trip_id: "trip-40",
            incident_type: "UNAUTHORIZED_INTRUDER",
            severity: "CRITICAL",
            stop_name: "Ganna Center",
            latitude: 28.5355,
            longitude: 77.3910,
            matched_student_id: null,
            evidence_url: null,
            status: "ACTIVE",
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      }),
    });

    (supabaseAdmin.from as any).mockReturnValue({
      insert: mockInsert,
    });

    const incident = await reportSecurityIncident({
      busId: 40,
      tripId: "trip-40",
      incidentType: "UNAUTHORIZED_INTRUDER",
      severity: "CRITICAL",
      stopName: "Ganna Center",
      latitude: 28.5355,
      longitude: 77.3910,
    });

    expect(incident.busId).toBe(40);
    expect(incident.incidentType).toBe("UNAUTHORIZED_INTRUDER");
    expect(incident.severity).toBe("CRITICAL");
    expect(incident.status).toBe("ACTIVE");
  });
});
