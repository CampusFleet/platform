import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { chain } from "./helpers/supabase-chain";

const session = { userId: "user-1", role: "student", email: "s@x" };
const faceResults: any[] = [];
const inserted: Record<string, any[]> = {};

vi.mock("@/lib/jwt", () => ({ getSessionFromRequest: vi.fn(async () => session) }));
vi.mock("@/lib/gate/evidence", async () => ({
  ...(await vi.importActual<any>("@/lib/gate/evidence")),
  storeEvidence: vi.fn(async (p: string) => p),
}));
vi.mock("@/lib/gate/processor", () => ({ getMatchThreshold: vi.fn(async () => 0.5) }));
vi.mock("@/lib/face/client", async () => ({
  ...(await vi.importActual<any>("@/lib/face/client")),
  createFaceTemplate: vi.fn(async () => faceResults.shift()),
}));
vi.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const c = chain({ data: table === "students" ? { id: "stu-1", user_id: "user-1" } : { id: `${table}-id` } });
      const orig = c.insert;
      return new Proxy(c, {
        get(t, p) {
          if (p === "insert") return (row: any) => ((inserted[table] ||= []).push(row), orig(row));
          return (t as any)[p];
        },
      });
    }),
  },
}));

import { POST } from "@/app/api/biometrics/enroll-v2/route";
import { CONSENT_VERSION } from "@/lib/biometrics-consent";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 2)]).toString("base64");
const unit = (i: number) => Array.from({ length: 128 }, (_, k) => (k === i ? 1 : 0));
const near = (i: number, j: number) => Array.from({ length: 128 }, (_, k) => (k === i ? 0.95 : k === j ? 0.31 : 0));
const ok = (template: number[]) => ({
  model_version: "m1", faces_detected: 1, accepted: true, rejection_reasons: [], template,
  quality: { score: 0.9, passed: true }, pad: { real_score: 0.99, passed: true },
});
const req = (body: any) => new NextRequest("http://localhost/api/biometrics/enroll-v2", { method: "POST", body: JSON.stringify(body) });
const valid = { consentGiven: true, consentVersion: CONSENT_VERSION, frames: [JPEG, JPEG, JPEG] };

describe("POST /api/biometrics/enroll-v2", () => {
  beforeEach(() => {
    faceResults.length = 0;
    for (const k of Object.keys(inserted)) delete inserted[k];
    session.role = "student";
  });

  it("requires the current consent version", async () => {
    const r = await POST(req({ ...valid, consentGiven: false }));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("CONSENT_REQUIRED");
    const r2 = await POST(req({ ...valid, consentVersion: "old-v0" }));
    expect(r2.status).toBe(400);
  });

  it("rejects attempts to enroll another student", async () => {
    const r = await POST(req({ ...valid, studentId: "someone-else" }));
    expect(r.status).toBe(400);
    expect(faceResults.length).toBe(0);
  });

  it("only students may enroll", async () => {
    session.role = "driver";
    expect((await POST(req(valid))).status).toBe(403);
  });

  it("rejects a spoof frame and stores nothing", async () => {
    faceResults.push(ok(unit(0)), { ...ok(unit(0)), accepted: false, rejection_reasons: ["PRESENTATION_ATTACK_SUSPECTED"] }, ok(unit(0)));
    const r = await POST(req(valid));
    expect(r.status).toBe(422);
    expect((await r.json()).code).toBe("SPOOF_SUSPECTED");
    expect(inserted.face_templates).toBeUndefined();
    expect(inserted.biometric_consents).toBeUndefined();
  });

  it("rejects frames of different people", async () => {
    faceResults.push(ok(unit(0)), ok(unit(1)), ok(unit(0)));
    const r = await POST(req(valid));
    expect((await r.json()).code).toBe("INCONSISTENT_FACES");
  });

  it("enrolls: records consent then stores server-generated templates", async () => {
    faceResults.push(ok(unit(0)), ok(near(0, 1)), ok(unit(0)));
    const r = await POST(req({ ...valid, qualityScore: 1, livenessScore: 1 }));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.templates).toBe(3);
    expect(inserted.biometric_consents[0]).toMatchObject({ student_id: "stu-1", consent_version: CONSENT_VERSION });
    const rows = inserted.face_templates[0];
    expect(rows).toHaveLength(3);
    // Client-supplied scores are ignored; stored scores come from the face service
    expect(rows[0]).toMatchObject({ student_id: "stu-1", quality_score: 0.9, pad_score: 0.99, model_version: "m1" });
  });
});
