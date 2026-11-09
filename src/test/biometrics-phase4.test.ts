import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/transport-manager/incidents/route";
import { PATCH } from "@/app/api/transport-manager/incidents/[id]/route";
import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import {
  getSecurityIncidents,
  updateSecurityIncidentStatus,
} from "@/lib/biometrics";

vi.mock("@/lib/jwt", () => ({
  getSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/biometrics", () => ({
  getSecurityIncidents: vi.fn(),
  updateSecurityIncidentStatus: vi.fn(),
}));

describe("Phase 4: Autonomous Transit Security Incidents & Alert Dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/transport-manager/incidents", () => {
    it("returns 401 when request is unauthenticated", async () => {
      (getSessionFromRequest as any).mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/transport-manager/incidents");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("returns 403 when user has insufficient privileges (e.g., student or driver)", async () => {
      (getSessionFromRequest as any).mockResolvedValue({
        userId: "stu-101",
        role: "student",
      });

      const req = new NextRequest("http://localhost:3000/api/transport-manager/incidents");
      const res = await GET(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.message).toContain("Forbidden");
    });

    it("returns 200 with incidents when role is transport_manager", async () => {
      (getSessionFromRequest as any).mockResolvedValue({
        userId: "mgr-42",
        role: "transport_manager",
      });

      const mockIncidents = [
        {
          id: "inc-1",
          busId: 40,
          busNumber: "40",
          incidentType: "UNAUTHORIZED_INTRUDER",
          severity: "CRITICAL",
          stopName: "Ganna Center",
          latitude: 29.0222,
          longitude: 79.4897,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        },
      ];

      (getSecurityIncidents as any).mockResolvedValue(mockIncidents);

      const req = new NextRequest("http://localhost:3000/api/transport-manager/incidents?status=ACTIVE&severity=CRITICAL");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      expect(json.incidents[0].id).toBe("inc-1");
      expect(getSecurityIncidents).toHaveBeenCalledWith({
        status: "ACTIVE",
        severity: "CRITICAL",
        busId: undefined,
        limit: 50,
      });
    });
  });

  describe("PATCH /api/transport-manager/incidents/[id]", () => {
    it("returns 401 when request is unauthenticated", async () => {
      (getSessionFromRequest as any).mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/transport-manager/incidents/inc-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "ACKNOWLEDGED" }),
      });
      const res = await PATCH(req, { params: { id: "inc-1" } });
      expect(res.status).toBe(401);
    });

    it("returns 400 when status is invalid", async () => {
      (getSessionFromRequest as any).mockResolvedValue({
        userId: "mgr-42",
        role: "transport_manager",
      });

      const req = new NextRequest("http://localhost:3000/api/transport-manager/incidents/inc-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "INVALID_STATUS" }),
      });
      const res = await PATCH(req, { params: { id: "inc-1" } });
      expect(res.status).toBe(400);
    });

    it("successfully acknowledges an active incident with operator notes", async () => {
      (getSessionFromRequest as any).mockResolvedValue({
        userId: "mgr-42",
        role: "transport_manager",
      });

      (updateSecurityIncidentStatus as any).mockResolvedValue({
        id: "inc-1",
        busId: 40,
        status: "ACKNOWLEDGED",
        resolvedBy: "mgr-42",
        resolutionNotes: "Reviewing gate video",
      });

      const req = new NextRequest("http://localhost:3000/api/transport-manager/incidents/inc-1", {
        method: "PATCH",
        body: JSON.stringify({
          status: "ACKNOWLEDGED",
          resolutionNotes: "Reviewing gate video",
        }),
      });

      const res = await PATCH(req, { params: { id: "inc-1" } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.incident.status).toBe("ACKNOWLEDGED");
      expect(updateSecurityIncidentStatus).toHaveBeenCalledWith("inc-1", {
        status: "ACKNOWLEDGED",
        resolvedBy: "mgr-42",
        resolutionNotes: "Reviewing gate video",
      });
    });

    it("successfully resolves and closes a security incident", async () => {
      (getSessionFromRequest as any).mockResolvedValue({
        userId: "mgr-42",
        role: "transport_manager",
      });

      (updateSecurityIncidentStatus as any).mockResolvedValue({
        id: "inc-1",
        busId: 40,
        status: "RESOLVED",
        resolvedBy: "mgr-42",
        resolvedAt: new Date().toISOString(),
        resolutionNotes: "Student verified with physical ID badge by driver",
      });

      const req = new NextRequest("http://localhost:3000/api/transport-manager/incidents/inc-1", {
        method: "PATCH",
        body: JSON.stringify({
          status: "RESOLVED",
          resolutionNotes: "Student verified with physical ID badge by driver",
        }),
      });

      const res = await PATCH(req, { params: { id: "inc-1" } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.incident.status).toBe("RESOLVED");
      expect(updateSecurityIncidentStatus).toHaveBeenCalledWith("inc-1", {
        status: "RESOLVED",
        resolvedBy: "mgr-42",
        resolutionNotes: "Student verified with physical ID badge by driver",
      });
    });
  });
});
