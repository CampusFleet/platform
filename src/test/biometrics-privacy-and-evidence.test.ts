import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { chain } from "./helpers/supabase-chain";

const session: any = { userId: "u-1", role: "transport_manager" };
const calls: { table: string; method: string; args: any[] }[] = [];
const deletedBlobs: string[] = [];

vi.mock("@/lib/jwt", () => ({ getSessionFromRequest: vi.fn(async () => session) }));
vi.mock("@/lib/gate/evidence", () => ({
  readEvidence: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])),
  deleteEvidence: vi.fn(async (keys: string[]) => void deletedBlobs.push(...keys)),
}));
vi.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const data =
        table === "bus_security_incidents"
          ? { id: "11111111-1111-1111-1111-111111111111", evidence_blob_key: "gate-evidence/x.jpg", matched_student_id: null, capture_id: "c1" }
          : table === "gate_captures"
          ? [{ id: "c1", evidence_blob_key: "gate-evidence/a.jpg" }, { id: "c2", evidence_blob_key: "gate-evidence/b.jpg" }]
          : table === "students"
          ? { id: "stu-1" }
          : null;
      const c = chain({ data, count: 3 });
      return new Proxy(c, {
        get(t, p: string) {
          const fn = (t as any)[p];
          if (typeof fn !== "function" || p === "then") return fn;
          return (...args: any[]) => (calls.push({ table, method: p, args }), fn(...args));
        },
      });
    }),
  },
}));

import { GET as evidenceGet } from "@/app/api/biometrics/evidence/[incidentId]/route";
import { DELETE as consentDelete } from "@/app/api/biometrics/consent/route";

const INC = "11111111-1111-1111-1111-111111111111";
const evReq = () => new NextRequest(`http://localhost/api/biometrics/evidence/${INC}`);

describe("evidence access", () => {
  beforeEach(() => {
    calls.length = 0;
    deletedBlobs.length = 0;
  });

  it.each(["student", "driver", "conductor", "teacher"])("denies %s", async (role) => {
    session.role = role;
    const r = await evidenceGet(evReq(), { params: { incidentId: INC } });
    expect(r.status).toBe(403);
    expect(calls.find((c) => c.table === "biometric_access_log")).toBeUndefined();
  });

  it("serves the image to transport managers and audits the view", async () => {
    session.role = "transport_manager";
    const r = await evidenceGet(evReq(), { params: { incidentId: INC } });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const audit = calls.find((c) => c.table === "biometric_access_log" && c.method === "insert");
    expect(audit?.args[0]).toMatchObject({ actor_user_id: "u-1", action: "EVIDENCE_VIEWED", incident_id: INC });
  });
});

describe("consent withdrawal", () => {
  beforeEach(() => {
    calls.length = 0;
    deletedBlobs.length = 0;
  });

  it("only students can withdraw their own consent", async () => {
    session.role = "transport_admin";
    expect((await consentDelete(new NextRequest("http://localhost/api/biometrics/consent", { method: "DELETE" }))).status).toBe(403);
  });

  it("withdraws consent, deletes templates and purges camera crops (so matching stops)", async () => {
    session.role = "student";
    const r = await consentDelete(new NextRequest("http://localhost/api/biometrics/consent", { method: "DELETE" }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ success: true, templatesDeleted: 3, evidenceDeleted: 2 });
    expect(calls.some((c) => c.table === "biometric_consents" && c.method === "update" && c.args[0].withdrawn_at)).toBe(true);
    expect(calls.some((c) => c.table === "face_templates" && c.method === "delete")).toBe(true);
    expect(deletedBlobs).toEqual(["gate-evidence/a.jpg", "gate-evidence/b.jpg"]);
  });
});
