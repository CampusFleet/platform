import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AttendanceEngine,
  FaceIdStrategy,
  DynamicQrStrategy,
  RfidStrategy,
  StaticQrStrategy,
} from "@/lib/attendance";
import {
  matchStudentFace,
  recordBusGateEvent,
  reportSecurityIncident,
} from "@/lib/biometrics";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { currentPassWindow, signStudentPass } from "@/lib/security/student-pass";
import { chain } from "./helpers/supabase-chain";

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

describe("Step 2: Modular Multi-Modal Attendance Strategy Architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseContext = {
    busId: 40,
    tripId: "trip-alpha",
    stopName: "Campus Terminal",
    latitude: 29.0222,
    longitude: 79.4897,
    gateType: "GATE_IN" as const,
  };

  // ── 1. FaceIdStrategy ───────────────────────────────────────────────────────
  describe("FaceIdStrategy", () => {
    const strategy = new FaceIdStrategy();

    it("identifies modality as BIOMETRIC_FACE_ID", () => {
      expect(strategy.modality).toBe("BIOMETRIC_FACE_ID");
    });

    it("rejects invalid embedding dimensions", async () => {
      const outcome = await strategy.validate(
        { embedding: [0.1, 0.2] },
        baseContext
      );
      expect(outcome.isValid).toBe(false);
      expect(outcome.status).toBe("INVALID_CREDENTIAL");
    });

    it("detects and flags spoof attempts when liveness check fails", async () => {
      const outcome = await strategy.validate(
        {
          embedding: Array.from({ length: 512 }, () => 0.05),
          livenessPassed: false,
        },
        baseContext
      );
      expect(outcome.isValid).toBe(false);
      expect(outcome.status).toBe("LIVENESS_FAILED");
    });

    it("authorizes commuter on cosine distance match", async () => {
      (matchStudentFace as any).mockResolvedValue([
        {
          studentId: "stu-101",
          studentName: "Aditya Pandey",
          studentIdCode: "STU-001",
          primaryRouteId: "route-1",
          distance: 0.12,
          confidence: 88,
        },
      ]);

      const outcome = await strategy.validate(
        { embedding: Array.from({ length: 512 }, () => 0.05) },
        baseContext
      );
      expect(outcome.isValid).toBe(true);
      expect(outcome.status).toBe("AUTHORIZED");
      if (outcome.isValid) {
        expect(outcome.student.id).toBe("stu-101");
        expect(outcome.student.name).toBe("Aditya Pandey");
        expect(outcome.confidence).toBe(88);
      }
    });

    it("identifies unauthorized intruder when no face matches threshold", async () => {
      (matchStudentFace as any).mockResolvedValue([]);

      const outcome = await strategy.validate(
        { embedding: Array.from({ length: 512 }, () => 0.05) },
        baseContext
      );
      expect(outcome.isValid).toBe(false);
      expect(outcome.status).toBe("UNAUTHORIZED_INTRUDER");
    });
  });

  // ── 2. DynamicQrStrategy ───────────────────────────────────────────────────
  describe("DynamicQrStrategy", () => {
    const strategy = new DynamicQrStrategy();

    it("identifies modality as DYNAMIC_QR", () => {
      expect(strategy.modality).toBe("DYNAMIC_QR");
    });

    it("rejects expired dynamic tokens (>2 min old screenshot)", async () => {
      const oldWindow = currentPassWindow() - 5; // 5 minutes ago, correctly signed
      const outcome = await strategy.validate(
        {
          rawToken: JSON.stringify({ studentId: "stu-101", window: oldWindow, sig: signStudentPass("stu-101", oldWindow) }),
        },
        baseContext
      );
      expect(outcome.isValid).toBe(false);
      expect(outcome.status).toBe("EXPIRED_PASS");
      expect((outcome as any).reason).toContain("Expired dynamic pass");
    });

    it("rejects an unsigned or forged dynamic pass", async () => {
      const w = currentPassWindow();
      const unsigned = await strategy.validate({ rawToken: JSON.stringify({ studentId: "stu-101", window: w }) }, baseContext);
      expect(unsigned.isValid).toBe(false);
      const forged = await strategy.validate(
        { rawToken: JSON.stringify({ studentId: "stu-101", window: w, sig: signStudentPass("stu-999", w) }) },
        baseContext
      );
      expect(forged.isValid).toBe(false);
    });

    it("authenticates live dynamic pass for active student", async () => {
      const currentWindow = currentPassWindow();
      const mockSelect = vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "stu-101",
              full_name: "Rohan Verma",
              student_id_code: "STU-042",
              primary_route_id: "route-2",
              transport_access_suspended: false,
            },
            error: null,
          }),
        }),
      });
      (supabaseAdmin.from as any).mockReturnValue({ select: mockSelect });

      const outcome = await strategy.validate(
        {
          rawToken: JSON.stringify({ studentId: "stu-101", window: currentWindow, sig: signStudentPass("stu-101", currentWindow) }),
        },
        baseContext
      );

      expect(outcome.isValid).toBe(true);
      expect(outcome.status).toBe("AUTHORIZED");
      if (outcome.isValid) {
        expect(outcome.student.name).toBe("Rohan Verma");
      }
    });
  });

  // ── 3. RfidStrategy ────────────────────────────────────────────────────────
  describe("RfidStrategy", () => {
    const strategy = new RfidStrategy();

    it("identifies modality as RFID", () => {
      expect(strategy.modality).toBe("RFID");
    });

    it("rejects unassigned RFID card UID", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });
      (supabaseAdmin.from as any).mockReturnValue({ select: mockSelect });

      const outcome = await strategy.validate(
        { cardUid: "E4A567B1" },
        baseContext
      );
      expect(outcome.isValid).toBe(false);
      expect(outcome.status).toBe("INVALID_CREDENTIAL");
      if (!outcome.isValid) expect(outcome.reason).toContain("Unpaired RFID card");
    });

    it("authorizes student paired with physical RFID UID", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "stu-202",
              full_name: "Priya Sharma",
              student_id: "STU-202",
              primary_route_id: "route-1",
              rfid_card_id: "E4A567B1",
              is_active: true,
            },
            error: null,
          }),
        }),
      });
      (supabaseAdmin.from as any).mockReturnValue({ select: mockSelect });

      const outcome = await strategy.validate(
        { cardUid: "E4A567B1" },
        baseContext
      );
      expect(outcome.isValid).toBe(true);
      expect(outcome.status).toBe("AUTHORIZED");
      if (outcome.isValid) {
        expect(outcome.student.rfidCardId).toBe("E4A567B1");
      }
    });
  });

  // ── 4. StaticQrStrategy ────────────────────────────────────────────────────
  describe("StaticQrStrategy", () => {
    const strategy = new StaticQrStrategy();

    it("identifies modality as STATIC_QR", () => {
      expect(strategy.modality).toBe("STATIC_QR");
    });

    it("rejects when commuter scans QR of a different bus", async () => {
      const outcome = await strategy.validate(
        {
          busIdScanned: 99, // Wrong bus
          studentId: "stu-101",
          commuterLat: 29.0222,
          commuterLng: 79.4897,
        },
        baseContext // Duty bus is 40
      );
      expect(outcome.isValid).toBe(false);
      expect(outcome.status).toBe("WRONG_BUS");
    });

    it("rejects when commuter is outside the geofence radius", async () => {
      const outcome = await strategy.validate(
        {
          busIdScanned: 40,
          studentId: "stu-101",
          commuterLat: 28.5355, // Noida coordinates (far away from campus 29.0222, 79.4897)
          commuterLng: 77.3910,
          maxRadiusMeters: 150,
        },
        baseContext
      );
      expect(outcome.isValid).toBe(false);
      expect(outcome.status).toBe("OUT_OF_GEOFENCE");
      if (!outcome.isValid) expect(outcome.reason).toContain("exceeds 150m geofence");
    });
  });

  // ── 5. AttendanceEngine Orchestrator ───────────────────────────────────────
  describe("AttendanceEngine Orchestrator", () => {
    it("registers all 4 production modalities by default", () => {
      const engine = new AttendanceEngine();
      const modalities = engine.getSupportedModalities();
      expect(modalities).toContain("BIOMETRIC_FACE_ID");
      expect(modalities).toContain("DYNAMIC_QR");
      expect(modalities).toContain("RFID");
      expect(modalities).toContain("STATIC_QR");
    });

    it("orchestrates full boarding lifecycle on authorized match", async () => {
      const engine = new AttendanceEngine();

      (matchStudentFace as any).mockResolvedValue([
        {
          studentId: "stu-101",
          studentName: "Aditya Pandey",
          studentIdCode: "STU-001",
          primaryRouteId: "route-1",
          distance: 0.1,
          confidence: 90,
        },
      ]);

      (recordBusGateEvent as any).mockResolvedValue({
        id: "gate-event-1",
        busId: 40,
        gateType: "GATE_IN",
        studentId: "stu-101",
        isAuthorized: true,
      });

      // Live schema: today's reservation on bus 40 exists; no prior attendance row.
      const reservations = chain({ data: [{ id: "res-1", bus_id: 40, trip_id: null, status: "ASSIGNED" }] });
      const attendance = chain({ data: null });
      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === "attendance_records") return attendance;
        if (table === "bus_reservations") return reservations;
        return chain();
      });

      const result = await engine.execute(
        "BIOMETRIC_FACE_ID",
        { embedding: Array.from({ length: 512 }, () => 0.05) },
        baseContext
      );

      expect(result.outcome.isValid).toBe(true);
      expect(result.attendanceMarked).toBe(true);
      expect(result.reservationUpdated).toBe(true);
      expect(recordBusGateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          busId: 40,
          gateType: "GATE_IN",
          studentId: "stu-101",
          isAuthorized: true,
        })
      );
    });

    it("dispatches critical security incident on unauthorized GATE_IN", async () => {
      const engine = new AttendanceEngine();

      (matchStudentFace as any).mockResolvedValue([]);
      (recordBusGateEvent as any).mockResolvedValue({
        id: "gate-unauth-1",
        busId: 40,
        gateType: "GATE_IN",
        isAuthorized: false,
      });
      (reportSecurityIncident as any).mockResolvedValue({
        id: "sec-incident-99",
        incidentType: "UNAUTHORIZED_INTRUDER",
        severity: "CRITICAL",
      });

      const result = await engine.execute(
        "BIOMETRIC_FACE_ID",
        { embedding: Array.from({ length: 512 }, () => 0.05) },
        baseContext
      );

      expect(result.outcome.isValid).toBe(false);
      expect(result.outcome.status).toBe("UNAUTHORIZED_INTRUDER");
      expect(reportSecurityIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          busId: 40,
          incidentType: "UNAUTHORIZED_INTRUDER",
          severity: "CRITICAL",
        })
      );
    });
  });
});
