import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/biometrics/enroll/route";

// v1 enrollment trusted client-computed embeddings; it is retired in favour of enroll-v2
// (see biometrics-enroll-v2.test.ts).
describe("POST /api/biometrics/enroll (retired)", () => {
  it("returns 410 Gone and points to enroll-v2", async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("ENDPOINT_RETIRED");
  });
});
