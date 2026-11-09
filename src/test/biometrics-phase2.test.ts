import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/biometrics/enroll/route";
import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { saveStudentFaceProfile } from "@/lib/biometrics";
import { supabaseAdmin } from "@/lib/supabaseClient";

vi.mock("@/lib/jwt", () => ({
  getSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/biometrics", () => ({
  saveStudentFaceProfile: vi.fn(),
  normalizeVector: vi.fn((v) => v),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe("Phase 2: Biometric Face ID Enrollment API (/api/biometrics/enroll)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    (getSessionFromRequest as any).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/biometrics/enroll", {
      method: "POST",
      body: JSON.stringify({
        embedding: Array.from({ length: 512 }, () => 0.1),
        consentGiven: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns 400 when embedding length is not exactly 512 dimensions", async () => {
    (getSessionFromRequest as any).mockResolvedValue({
      userId: "user-123",
      role: "student",
      email: "student@campusfleet.com",
    });

    const req = new NextRequest("http://localhost:3000/api/biometrics/enroll", {
      method: "POST",
      body: JSON.stringify({
        embedding: [0.1, 0.2, 0.3], // Invalid: only 3 dimensions
        consentGiven: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/512 dimensions/);
  });

  it("returns 400 when explicit biometric consent is not granted (DPDP Act Compliance)", async () => {
    (getSessionFromRequest as any).mockResolvedValue({
      userId: "user-123",
      role: "student",
      email: "student@campusfleet.com",
    });

    const req = new NextRequest("http://localhost:3000/api/biometrics/enroll", {
      method: "POST",
      body: JSON.stringify({
        embedding: Array.from({ length: 512 }, () => 0.1),
        consentGiven: false, // Refused consent
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/consent is required/i);
  });

  it("successfully enrolls student face profile and locks official photo", async () => {
    (getSessionFromRequest as any).mockResolvedValue({
      userId: "user-test-789",
      role: "student",
      email: "aarav@campusfleet.com",
    });

    // Mock student resolution
    const mockStudentSelect = vi.fn().mockReturnValue({
      or: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: [{ id: "stu-uuid-999", user_id: "user-test-789", full_name: "Aarav Sharma" }],
          error: null,
        }),
      }),
    });

    // Mock user & student update
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === "students") {
        return {
          select: mockStudentSelect,
          update: mockUpdate,
        };
      }
      if (table === "users") {
        return {
          update: mockUpdate,
        };
      }
      return {};
    });

    (saveStudentFaceProfile as any).mockResolvedValue({
      id: "profile-id-123",
      studentId: "stu-uuid-999",
      qualityScore: 0.98,
      livenessScore: 0.99,
      enrolledAt: new Date().toISOString(),
      biometricConsentGiven: true,
      isActive: true,
    });

    const validEmbedding = Array.from({ length: 512 }, () => 0.05);
    const avatarDataUrl = "data:image/jpeg;base64,samplebase64data";

    const req = new NextRequest("http://localhost:3000/api/biometrics/enroll", {
      method: "POST",
      body: JSON.stringify({
        embedding: validEmbedding,
        qualityScore: 0.98,
        livenessScore: 0.99,
        consentGiven: true,
        avatarDataUrl,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.profile.studentId).toBe("stu-uuid-999");
    expect(json.profile.qualityScore).toBe(0.98);
    expect(json.profile.avatarUrl).toBe(avatarDataUrl);

    expect(saveStudentFaceProfile).toHaveBeenCalledWith(
      "stu-uuid-999",
      validEmbedding,
      expect.objectContaining({
        qualityScore: 0.98,
        livenessScore: 0.99,
        biometricConsent: true,
      })
    );
  });
});

