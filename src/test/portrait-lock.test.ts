import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { paymentStatus: "UNPAID" as string | null, oldUrl: null as string | null, updates: [] as any[], deleted: [] as string[] };

vi.mock("@/lib/redis", () => ({ cacheDel: vi.fn(), invalidateCachedStudentProfile: vi.fn() }));
vi.mock("@/lib/gate/evidence", async () => ({
  ...(await vi.importActual<any>("@/lib/gate/evidence")),
  storeEvidence: vi.fn(async (p: string) => `${p.replace(".jpg", "")}-new.jpg`),
  deleteEvidence: vi.fn(async (keys: string[]) => void state.deleted.push(...keys)),
}));
vi.mock("@/lib/supabaseClient", () => {
  const q = (table: string) => {
    const api: any = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () =>
        table === "students_full" ? { data: { payment_status: state.paymentStatus } } : { data: { photo_url: state.oldUrl } },
      update: (row: any) => (state.updates.push(row), { eq: async () => ({ error: null }) }),
    };
    return api;
  };
  return { db: { from: q } };
});

import { savePortrait, PortraitLockedError, portraitKeyFromUrl } from "@/lib/students/portrait";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString("base64");

describe("pass photo (savePortrait)", () => {
  beforeEach(() => {
    state.paymentStatus = "UNPAID";
    state.oldUrl = null;
    state.updates = [];
    state.deleted = [];
  });

  it("stores privately and points photo_url at the access-controlled route", async () => {
    const url = await savePortrait({ studentId: "stu-1", userId: "u-1", image: JPEG });
    expect(url).toBe(`/api/biometrics/portrait/stu-1?k=${encodeURIComponent("portraits/stu-1-new.jpg")}`);
    expect(state.updates[0]).toEqual({ photo_url: url });
  });

  it("a student cannot replace the photo after payment", async () => {
    state.paymentStatus = "APPROVED";
    await expect(savePortrait({ studentId: "stu-1", userId: "u-1", image: JPEG })).rejects.toBeInstanceOf(PortraitLockedError);
    expect(state.updates).toHaveLength(0);
  });

  it("staff can replace it after payment, and the old blob is deleted", async () => {
    state.paymentStatus = "APPROVED";
    state.oldUrl = "/api/biometrics/portrait/stu-1?k=portraits%2Fstu-1-old.jpg";
    await savePortrait({ studentId: "stu-1", userId: "u-1", image: JPEG, byStaff: true });
    expect(state.deleted).toEqual(["portraits/stu-1-old.jpg"]);
  });

  it("rejects anything that is not a JPEG", async () => {
    await expect(savePortrait({ studentId: "stu-1", userId: "u-1", image: Buffer.from("hello").toString("base64") })).rejects.toThrow(/JPEG/);
  });

  it("only reads keys from our own portrait URLs", () => {
    expect(portraitKeyFromUrl("https://evil.example/x?k=a")).toBeNull();
    expect(portraitKeyFromUrl("data:image/jpeg;base64,xx")).toBeNull();
  });
});
