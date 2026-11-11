import { describe, it, expect, vi, beforeEach } from "vitest";
import { chain } from "./helpers/supabase-chain";

process.env.GATE_DEVICE_MASTER_KEY = "vitest-gate-master-key-000000000000000";

const device = { id: "dev-1", device_mac: "AA:BB:CC:DD:EE:01", kind: "PI_GATE", bus_id: 7, door: "BOTH", key_version: 2, revoked_at: null as string | null };
const nonces = new Set<string>();

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(async (k: string, _v: any, o: any) => {
      if (o?.nx && nonces.has(k)) return null;
      nonces.add(k);
      return "OK";
    }),
  },
}));
vi.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: { from: vi.fn(() => chain({ data: device })) },
}));

import { authenticateDevice, deriveDeviceKey, signDeviceRequest, normalizeMac } from "@/lib/gate/device-auth";

const PATH = "/api/gate/captures";
function signed(body: string, opts: { ts?: number; nonce?: string; key?: string; mac?: string } = {}) {
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? `n${Math.random().toString(36).slice(2)}${Date.now()}`;
  const key = opts.key ?? deriveDeviceKey(device.device_mac, device.key_version);
  return new Headers({
    "x-cf-device": opts.mac ?? device.device_mac,
    "x-cf-timestamp": ts,
    "x-cf-nonce": nonce,
    "x-cf-signature": signDeviceRequest(key, ts, nonce, "POST", PATH, body),
  });
}

describe("gate device authentication", () => {
  beforeEach(() => {
    nonces.clear();
    device.revoked_at = null;
  });

  it("accepts a correctly signed request", async () => {
    const body = '{"captures":[]}';
    const r = await authenticateDevice(signed(body), "POST", PATH, Buffer.from(body));
    expect(r.ok).toBe(true);
  });

  it("derived key depends on MAC and key version", () => {
    expect(deriveDeviceKey("aa-bb-cc-dd-ee-01", 2)).toBe(deriveDeviceKey("AA:BB:CC:DD:EE:01", 2));
    expect(deriveDeviceKey(device.device_mac, 2)).not.toBe(deriveDeviceKey(device.device_mac, 3));
    expect(normalizeMac("aa-bb-cc-dd-ee-01")).toBe("AA:BB:CC:DD:EE:01");
  });

  it("rejects an expired timestamp (> 5 min skew)", async () => {
    const body = "{}";
    const r = await authenticateDevice(signed(body, { ts: Math.floor(Date.now() / 1000) - 400 }), "POST", PATH, Buffer.from(body));
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a replayed nonce", async () => {
    const body = "{}";
    const h = signed(body, { nonce: "fixednonce-1234567890" });
    expect((await authenticateDevice(h, "POST", PATH, Buffer.from(body))).ok).toBe(true);
    const again = await authenticateDevice(h, "POST", PATH, Buffer.from(body));
    expect(again).toMatchObject({ ok: false, error: "Replayed request." });
  });

  it("rejects a tampered body", async () => {
    const h = signed('{"captures":[1]}');
    const r = await authenticateDevice(h, "POST", PATH, Buffer.from('{"captures":[2]}'));
    expect(r).toMatchObject({ ok: false, error: "Bad signature." });
  });

  it("rejects the old key after re-pairing (key rotation)", async () => {
    const body = "{}";
    const oldKey = deriveDeviceKey(device.device_mac, 1);
    const r = await authenticateDevice(signed(body, { key: oldKey }), "POST", PATH, Buffer.from(body));
    expect(r.ok).toBe(false);
  });

  it("rejects a revoked device", async () => {
    device.revoked_at = new Date().toISOString();
    const body = "{}";
    const r = await authenticateDevice(signed(body), "POST", PATH, Buffer.from(body));
    expect(r).toMatchObject({ ok: false, error: "Unknown or revoked device." });
  });

  it("rejects requests without signature headers", async () => {
    const r = await authenticateDevice(new Headers(), "POST", PATH, Buffer.from(""));
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
});

// Same fixed vector as CampusFleet/face-gate-agent tests/test_agent.py. If this fails, the bus agents
// will be rejected: change both repos together.
describe("device signing vector shared with face-gate-agent", () => {
  it("derives the key and signature the agent expects", () => {
    const key = deriveDeviceKey("aa-bb-cc-dd-ee-01", 3, "test-master-key-for-vector-000000000");
    expect(key).toBe("b2591650c883d806098257a74c19c3fa8b00189ac269f022f62769081015e7af");
    const sig = signDeviceRequest(key, "1794300000", "nonce-abcdef0123456789", "POST", "/api/gate/captures", '{"captures":[]}');
    expect(sig).toBe("924dcf49e561c4cfadd5dce5541ca7738a24d5100423b78807c6e224a06a75d7");
  });
});
