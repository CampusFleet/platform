import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/biometrics/verify-gate/route";
import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import {
  matchStudentFace,
  recordBusGateEvent,
  reportSecurityIncident,
} from "@/lib/biometrics";
import { supabaseAdmin } from "@/lib/supabaseClient";

vi.mock("@/lib/jwt", () => ({
  getSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/biometrics", () => ({
  DEFAULT_FACE_MATCH_THRESHOLD: 0.35,
  matchStudentFace: vi.fn(),
  recordBusGateEvent: vi.fn(),
  reportSecurityIncident: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe("Phase 3: Autonomous Dual-Gate Telematics API (/api/biometrics/verify-gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if request is unauthenticated", async () => {
    (getSessionFromRequest as any).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/biometrics/verify-gate", {
      method: "POST",
      body: JSON.stringify({
        busId: 40,
        gateType: "GATE_IN",
        embedding: Array.from({ length: 512 }, () => 0.05),
        latitude: 28.5355,
        longitude: 77.3910,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects invalid gateType or corrupted embedding dimensions", async () => {
    (getSessionFromRequest as any).mockResolvedValue({
      userId: "driver-123",
      role: "driver",
    });

    const req = new NextRequest("http://localhost:3000/api/biometrics/verify-gate", {
      method: "POST",
      body: JSON.stringify({
        busId: 40,
        gateType: "INVALID_GATE", // Invalid
        embedding: [0.1, 0.2], // Invalid length
        latitude: 28.5355,
        longitude: 77.3910,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("processes GATE_IN boarding for authorized student, marks attendance & reservations", async () => {
    (getSessionFromRequest as any).mockResolvedValue({
      userId: "driver-123",
      role: "driver",
    });

    (matchStudentFace as any).mockResolvedValue([
      {
        studentId: "stu-101",
        studentName: "Rohan Verma",
        studentIdCode: "STU-042",
        primaryRouteId: "route-1",
        distance: 0.14,
        confidence: 86.0,
      },
    ]);

    (recordBusGateEvent as any).mockResolvedValue({
      id: "event-uuid-1",
      busId: 40,
      gateType: "GATE_IN",
      studentId: "stu-101",
      stopName: "Ganna Center",
      createdAt: new Date().toISOString(),
    });

    // Mock attendance & reservation upserts
    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === "attendance_records") {
        return { upsert: mockUpsert };
      }
      if (table === "bus_reservations") {
        return { update: mockUpdate };
      }
      return {};
    });

    const validEmbedding = Array.from({ length: 512 }, () => 0.05);

    const req = new NextRequest("http://localhost:3000/api/biometrics/verify-gate", {
      method: "POST",
      body: JSON.stringify({
        busId: 40,
        tripId: "trip-bus-40-today",
        gateType: "GATE_IN",
        embedding: validEmbedding,
        latitude: 28.5355,
        longitude: 77.3910,
        stopName: "Ganna Center",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.matched).toBe(true);
    expect(json.isAuthorized).toBe(true);
    expect(json.student.name).toBe("Rohan Verma");
    expect(json.student.studentIdCode).toBe("STU-042");

    expect(recordBusGateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        busId: 40,
        gateType: "GATE_IN",
        studentId: "stu-101",
        isAuthorized: true,
        stopName: "Ganna Center",
      })
    );
  });

  it("triggers CRITICAL security incident when unknown person boards through GATE_IN", async () => {
    (getSessionFromRequest as any).mockResolvedValue({
      userId: "driver-123",
      role: "driver",
    });

    // No match found in database
    (matchStudentFace as any).mockResolvedValue([]);

    (recordBusGateEvent as any).mockResolvedValue({
      id: "unauthorized-event-uuid",
      busId: 40,
      gateType: "GATE_IN",
      studentId: null,
      stopName: "Ganna Center",
      createdAt: new Date().toISOString(),
    });

    (reportSecurityIncident as any).mockResolvedValue({
      id: "incident-999",
      busId: 40,
      incidentType: "UNAUTHORIZED_INTRUDER",
      severity: "CRITICAL",
      status: "ACTIVE",
    });

    const strangerEmbedding = Array.from({ length: 512 }, () => 0.05);

    const req = new NextRequest("http://localhost:3000/api/biometrics/verify-gate", {
      method: "POST",
      body: JSON.stringify({
        busId: 40,
        tripId: "trip-bus-40-today",
        gateType: "GATE_IN",
        embedding: strangerEmbedding,
        latitude: 28.5355,
        longitude: 77.3910,
        stopName: "Ganna Center",
        evidenceThumbnail: "data:image/jpeg;base64,strangerthumb",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.matched).toBe(false);
    expect(json.isAuthorized).toBe(false);
    expect(json.alert).toBe("UNAUTHORIZED_INTRUDER");
    expect(json.incidentId).toBe("incident-999");

    expect(reportSecurityIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        busId: 40,
        incidentType: "UNAUTHORIZED_INTRUDER",
        severity: "CRITICAL",
        stopName: "Ganna Center",
      })
    );
  });

  it("processes GATE_OUT deboarding cleanly", async () => {
    (getSessionFromRequest as any).mockResolvedValue({
      userId: "driver-123",
      role: "driver",
    });

    (matchStudentFace as any).mockResolvedValue([
      {
        studentId: "stu-101",
        studentName: "Rohan Verma",
        studentIdCode: "STU-042",
        distance: 0.12,
        confidence: 88.0,
      },
    ]);

    (recordBusGateEvent as any).mockResolvedValue({
      id: "alight-event-uuid",
      busId: 40,
      gateType: "GATE_OUT",
      studentId: "stu-101",
      stopName: "City Hospital",
      createdAt: new Date().toISOString(),
    });

    const req = new NextRequest("http://localhost:3000/api/biometrics/verify-gate", {
      method: "POST",
      body: JSON.stringify({
        busId: 40,
        gateType: "GATE_OUT",
        embedding: Array.from({ length: 512 }, () => 0.05),
        latitude: 28.5400,
        longitude: 77.3950,
        stopName: "City Hospital",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.gateType).toBe("GATE_OUT");
    expect(json.student.name).toBe("Rohan Verma");
  });
});
