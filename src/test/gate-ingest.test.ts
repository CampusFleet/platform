import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, { id: string; idempotency_key: string }>();
const blobs: string[] = [];

vi.mock("@/lib/gate/evidence", async () => {
  const real = await vi.importActual<any>("@/lib/gate/evidence");
  return {
    ...real,
    storeEvidence: vi.fn(async (p: string) => {
      blobs.push(p);
      return `${p}#${blobs.length}`;
    }),
  };
});

vi.mock("@/lib/supabaseClient", () => {
  const from = (table: string) => {
    const state: any = { table, filters: {} as Record<string, any>, inKeys: null as string[] | null, insert: null };
    const b: any = {
      select: () => b,
      eq: (k: string, v: any) => ((state.filters[k] = v), b),
      in: (_k: string, v: string[]) => ((state.inKeys = v), b),
      insert: (row: any) => ((state.insert = row), b),
      single: async () => {
        const row = state.insert;
        if (store.has(row.idempotency_key)) return { data: null, error: { code: "23505", message: "dup" } };
        const rec = { id: `cap-${store.size + 1}`, idempotency_key: row.idempotency_key };
        store.set(row.idempotency_key, rec);
        return { data: { id: rec.id }, error: null };
      },
      maybeSingle: async () => ({ data: store.get(state.filters.idempotency_key) || null, error: null }),
      then: (res: any) => res({ data: (state.inKeys || []).map((k: string) => store.get(k)).filter(Boolean), error: null }),
    };
    return b;
  };
  return { supabaseAdmin: { from } };
});

import { ingestCaptures } from "@/lib/gate/ingest";

const device: any = { id: "dev-1", device_mac: "AA:BB:CC:DD:EE:01", kind: "PI_GATE", bus_id: 7, door: "BOTH", key_version: 1, revoked_at: null };
// Smallest valid JPEG header + filler
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString("base64");
const cap = (key: string, extra: any = {}) => ({ idempotencyKey: key, door: "IN", capturedAt: new Date().toISOString(), latitude: 29.35, longitude: 79.55, image: JPEG, ...extra });

describe("gate capture ingest", () => {
  beforeEach(() => {
    store.clear();
    blobs.length = 0;
  });

  it("stores a new capture", async () => {
    const r = await ingestCaptures(device, [cap("cap-key-0001")]);
    expect(r.accepted).toEqual([{ idempotencyKey: "cap-key-0001", captureId: "cap-1", duplicate: false }]);
    expect(blobs).toHaveLength(1);
  });

  it("idempotent retry returns the original capture and stores no new evidence", async () => {
    await ingestCaptures(device, [cap("cap-key-0001")]);
    const again = await ingestCaptures(device, [cap("cap-key-0001")]);
    expect(again.accepted).toEqual([{ idempotencyKey: "cap-key-0001", captureId: "cap-1", duplicate: true }]);
    expect(blobs).toHaveLength(1);
  });

  it("accepts 48 h old offline captures but rejects anything older than 72 h", async () => {
    const r = await ingestCaptures(device, [
      cap("old-but-ok-01", { capturedAt: new Date(Date.now() - 48 * 3600_000).toISOString() }),
      cap("too-old-0001", { capturedAt: new Date(Date.now() - 80 * 3600_000).toISOString() }),
    ]);
    expect(r.accepted.map((a) => a.idempotencyKey)).toEqual(["old-but-ok-01"]);
    expect(r.rejected[0]).toMatchObject({ idempotencyKey: "too-old-0001" });
  });

  it("rejects non-JPEG images, bad doors and doors the device is not paired to", async () => {
    const outOnly = { ...device, door: "OUT" };
    const r = await ingestCaptures(outOnly, [
      cap("png-image-001", { door: "OUT", image: Buffer.from("not a jpeg").toString("base64") }),
      cap("bad-door-0001", { door: "SIDE" }),
      cap("wrong-door-01", { door: "IN" }),
    ]);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected.map((x) => x.error)).toEqual(["image must be a JPEG", "door must be IN or OUT", "device is paired to the OUT door"]);
  });

  it("refuses captures from a device without a bus", async () => {
    const r = await ingestCaptures({ ...device, bus_id: null }, [cap("cap-key-0002")]);
    expect(r.rejected[0].error).toMatch(/not paired to a bus/);
  });
});
