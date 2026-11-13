import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/fleet/settings/route";
import { getSessionFromRequest } from "@/lib/jwt";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

vi.mock("@/lib/supabaseClient", () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

vi.mock("@/lib/jwt", () => {
  return {
    getSessionFromRequest: vi.fn(),
  };
});

describe("Transport Settings Foreign Key & Audit Integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("safely sanitizes non-existent string role 'transport_admin' to avoid foreign key violations", async () => {
    const mockFrom = vi.fn();
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }), // User does not exist
            }),
          }),
        };
      }
      if (table === "transport_settings") {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: { id: "bbcfc592-3423-48f1-a1d1-ef743fb2f778" },
              }),
            }),
          }),
          update: (payload: any) => {
            // CRITICAL TEST: payload.updated_by MUST NOT be "transport_admin"
            expect(payload.updated_by).toBeUndefined();
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: "bbcfc592-3423-48f1-a1d1-ef743fb2f778",
                      attendance_mode: "RFID",
                      max_walk_distance_km: 3.0,
                      auto_assignment_enabled: true,
                      seat_selection_mode: "AT_ATTENDANCE",
                      updated_by: null,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === "audit_logs") {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });

    const req = new NextRequest("http://localhost:3000/api/fleet/settings", {
      method: "POST",
      body: JSON.stringify({
        attendanceMode: "RFID",
        updatedBy: "transport_admin",
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.settings.attendanceMode).toBe("RFID");
    expect(json.settings.updatedBy).toBeNull();
  });

  it("persists valid users.id when candidate exists in users table", async () => {
    const validUserId = "ebdb874f-e96e-429e-a89d-1ba6ddfa821a";
    let capturedUpdatedBy: any = null;

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              maybeSingle: async () => {
                if (val === validUserId) return { data: { id: validUserId }, error: null };
                return { data: null, error: null };
              },
            }),
          }),
        };
      }
      if (table === "transport_settings") {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: { id: "bbcfc592-3423-48f1-a1d1-ef743fb2f778" },
              }),
            }),
          }),
          update: (payload: any) => {
            capturedUpdatedBy = payload.updated_by;
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: "bbcfc592-3423-48f1-a1d1-ef743fb2f778",
                      attendance_mode: "DYNAMIC_QR",
                      max_walk_distance_km: 3.0,
                      auto_assignment_enabled: true,
                      seat_selection_mode: "AT_ATTENDANCE",
                      updated_by: validUserId,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === "audit_logs") {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });

    // The actor comes from the session, not from a body field.
    (getSessionFromRequest as any).mockResolvedValue({ userId: validUserId, role: "transport_admin" });
    const req = new NextRequest("http://localhost:3000/api/fleet/settings", {
      method: "POST",
      body: JSON.stringify({ attendanceMode: "DYNAMIC_QR" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(capturedUpdatedBy).toBe(validUserId);
    expect(json.settings.updatedBy).toBe(validUserId);
  });
});

