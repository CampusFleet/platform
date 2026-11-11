import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/biometrics/verify-gate/route";

// v1 gate verification trusted client embeddings + client threshold; replaced by the hybrid
// pipeline (gate-device-auth, gate-ingest and gate-decision tests).
describe("POST /api/biometrics/verify-gate (retired)", () => {
  it("returns 410 Gone and points to /api/gate/captures", async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    expect((await res.json()).message).toMatch(/\/api\/gate\/captures/);
  });
});
