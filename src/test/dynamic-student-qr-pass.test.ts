import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as boardingScanPost } from "@/app/api/boarding/scan/route";
import { GET as studentVerifyGet } from "@/app/api/students/verify/route";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

vi.mock("@/lib/jwt", () => ({
  getSessionFromRequest: vi.fn(async () => ({ userId: "user-conductor", role: "conductor", fullName: "Test Conductor" })),
}));

// Helper to construct NextRequest with json body
function mockPostRequest(body: any): NextRequest {
  return new NextRequest("http://localhost:3000/api/boarding/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockGetRequest(url: string): NextRequest {
  return new NextRequest(url, {
    method: "GET",
  });
}

describe("Dynamic 1-Minute Student QR Pass & Anti-Screenshot Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Dynamic Window & Token Rotation Logic", () => {
    it("generates deterministic tokens that change every 60-second window", () => {
      const studentId = "student-12345";
      const window1 = 29849200; // e.g., T = 0
      const window2 = 29849201; // e.g., T = 60s

      const computeToken = (sId: string, wIndex: number) => {
        const seed = `${sId}:${wIndex}:cf_transit_secure_salt_2026`;
        let hash1 = 0x811c9dc5;
        let hash2 = 0x27d4eb2f;
        for (let i = 0; i < seed.length; i++) {
          const code = seed.charCodeAt(i);
          hash1 ^= code;
          hash1 = Math.imul(hash1, 0x01000193);
          hash2 ^= (code << 5) + code;
          hash2 = Math.imul(hash2, 0x5bd1e995);
        }
        const hex1 = ((hash1 >>> 0) & 0xffffff).toString(16).padStart(6, "0").toUpperCase();
        const hex2 = ((hash2 >>> 0) & 0xffffff).toString(16).padStart(6, "0").toUpperCase();
        return `${hex1.slice(0, 4)}-${hex2.slice(0, 4)}`;
      };

      const token1 = computeToken(studentId, window1);
      const token2 = computeToken(studentId, window2);

      expect(token1).toHaveLength(9); // Format: "XXXX-XXXX"
      expect(token2).toHaveLength(9);
      expect(token1).not.toBe(token2);
    });
  });

  describe("Anti-Screenshot Validation in Boarding Scanner (/api/boarding/scan)", () => {
    it("rejects an expired dynamic pass if the screenshot is older than 2 minutes", async () => {
      const currentWindow = Math.floor(Date.now() / 60000);
      const expiredWindow = currentWindow - 10; // 10 minutes ago (stale screenshot)

      const expiredPayload = JSON.stringify({
        v: 2,
        type: "STUDENT_IDENTITY",
        studentId: "stud-alice",
        studentName: "Alice Walker",
        window: expiredWindow,
        token: "DEAD-BEEF",
      });

      const req = mockPostRequest({
        qrData: expiredPayload,
        tripId: "trip-test-1",
        action: "PREVIEW_VERIFY",
      });

      const res = await boardingScanPost(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.code).toBe("EXPIRED_DYNAMIC_PASS");
      expect(json.message).toContain("SECURITY ALERT: Expired dynamic pass");
    });

    it("parses student ID when scanned as a Universal Verification URL", async () => {
      // Mock supabaseAdmin query
      vi.spyOn(supabaseAdmin, "from").mockImplementation((table: string) => {
        if (table === "students_full") {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "stud-verified-1",
                  full_name: "Verified Student",
                  photo_url: "https://photos.example.com/st1.jpg",
                  department: "CSE",
                  semester: "Semester 6",
                  payment_status: "APPROVED",
                  transport_access_suspended: false,
                },
              ],
              error: null,
            }),
          } as any;
        }
        if (table === "trips") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "trip-test-1",
                busId: "bus-1",
                buses: { id: "bus-1", bus_number: "Bus 12", capacity: 40, status: "ACTIVE" },
                routes: { id: "r-1", name: "Main Route", direction: "HOME_TO_CAMPUS" },
              },
            }),
          } as any;
        }
        if (table === "attendance_records") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [] }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        } as any;
      });

      const verificationUrl = "https://campusfleet.vercel.app/verify/student?id=stud-verified-1&token=ABCD-1234";

      const req = mockPostRequest({
        qrData: verificationUrl,
        tripId: "trip-test-1",
        action: "PREVIEW_VERIFY",
      });

      const res = await boardingScanPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.student.fullName).toBe("Verified Student");
    });
  });

  describe("Public Verification Endpoint (/api/students/verify)", () => {
    it("returns 400 when missing student identifier", async () => {
      const req = mockGetRequest("http://localhost:3000/api/students/verify");
      const res = await studentVerifyGet(req);
      expect(res.status).toBe(400);
    });

    it("returns official verified student pass data for valid studentId", async () => {
      vi.spyOn(supabaseAdmin, "from").mockImplementation((table: string) => {
        if (table === "students_full") {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "st-official-99",
                  full_name: "Aditya Pandey",
                  photo_url: "https://photos.example.com/aditya.jpg",
                  department: "Computer Science",
                  semester: "Semester 6",
                  class_name: "CSE-A",
                  payment_status: "APPROVED",
                  transport_access_suspended: false,
                  primary_route_id: "rt-1",
                  primary_stop_id: "stp-1",
                },
              ],
              error: null,
            }),
          } as any;
        }
        if (table === "routes") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Haldwani Express" } }),
          } as any;
        }
        if (table === "stops") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Ganna Center" } }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
        } as any;
      });

      const req = mockGetRequest("http://localhost:3000/api/students/verify?id=st-official-99");
      const res = await studentVerifyGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.verified).toBe(true);
      expect(json.student.fullName).toBe("Aditya Pandey");
      expect(json.student.routeName).toBe("Haldwani Express");
      expect(json.student.stopName).toBe("Ganna Center");
      expect(json.student.isPassValid).toBe(true);
    });
  });
});
