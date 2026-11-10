import { describe, it, expect, vi, beforeEach } from "vitest";

// Test-only secret (the module has no hardcoded fallback and requires the env var)
const DEFAULT_32_CHAR_SECRET = "test-rolling-secret-0123456789ab"; // exactly 32 chars
process.env.BUS_ROLLING_SECRET_KEY = DEFAULT_32_CHAR_SECRET;

import {
  generateRollingBusPayload,
  verifyRollingBusToken,
  computeRollingToken,
  getBusSecretKey,
  getRollingMasterSecret,
} from "@/lib/rolling-bus-crypto";

// Mock Redis (atomic SET NX semantics)
const mockRedisStore = new Map<string, any>();
vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(async (key: string, val: any, opts?: { nx?: boolean }) => {
      if (opts?.nx && mockRedisStore.has(key)) return null;
      mockRedisStore.set(key, val);
      return "OK";
    }),
  },
}));

describe("CampusFleet Dynamic Rolling Bus QR Cryptography", () => {
  beforeEach(() => {
    mockRedisStore.clear();
    vi.clearAllMocks();
  });

  it("should derive deterministic 32-character bus-specific keys", () => {
    const keyBus1 = getBusSecretKey("bus-1", DEFAULT_32_CHAR_SECRET);
    const keyBus2 = getBusSecretKey("bus-2", DEFAULT_32_CHAR_SECRET);

    expect(keyBus1).toHaveLength(32);
    expect(keyBus2).toHaveLength(32);
    expect(keyBus1).not.toBe(keyBus2);
  });

  it("should generate a valid rolling payload with compact URI and 16-hex HMAC token", () => {
    const payload = generateRollingBusPayload("42", "Bus 42", DEFAULT_32_CHAR_SECRET, 2);

    expect(payload.busId).toBe("42");
    expect(payload.token).toMatch(/^[0-9A-F]{16}$/);
    expect(payload.qrPayloadString).toContain("cf://b/42?t=");
    expect(payload.qrPayloadString).toContain(`&k=${payload.token}`);
    expect(payload.stepSeconds).toBe(2);
  });

  it("should verify authentic rolling tokens within tolerance window", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const timeBlock = Math.floor(nowSec / 2);
    const token = computeRollingToken("42", timeBlock, DEFAULT_32_CHAR_SECRET);

    const result = await verifyRollingBusToken({
      busId: "42",
      timeBlock,
      token,
    }, "stud-123");

    expect(result.valid).toBe(true);
    expect(result.busId).toBe("42");
  });

  it("should parse and verify URI format cf://b/42?t=...&k=...", async () => {
    const payload = generateRollingBusPayload("42", "Bus 42");
    const result = await verifyRollingBusToken(payload.qrPayloadString, "stud-456");

    expect(result.valid).toBe(true);
    expect(result.busId).toBe("42");
  });

  it("should reject tampered or fraudulent tokens", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const timeBlock = Math.floor(nowSec / 2);

    const result = await verifyRollingBusToken({
      busId: "42",
      timeBlock,
      token: "BAD_FRAUD_TOKEN1",
    }, "stud-123");

    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID_TOKEN");
  });

  it("should reject expired tokens beyond tolerance window", async () => {
    const oldTimeBlock = Math.floor(Date.now() / 1000 / 2) - 100; // 200 seconds in the past
    const token = computeRollingToken("42", oldTimeBlock, DEFAULT_32_CHAR_SECRET);

    const result = await verifyRollingBusToken({
      busId: "42",
      timeBlock: oldTimeBlock,
      token,
    }, "stud-123", 2);

    expect(result.valid).toBe(false);
    expect(result.code).toBe("EXPIRED_OR_DRIFT");
  });

  it("should block anti-replay token reuse via Redis cache lock", async () => {
    const payload = generateRollingBusPayload("42", "Bus 42");

    // First scan succeeds
    const res1 = await verifyRollingBusToken(payload.qrPayloadString, "stud-999");
    expect(res1.valid).toBe(true);

    // Second scan with same token by same student fails
    const res2 = await verifyRollingBusToken(payload.qrPayloadString, "stud-999");
    expect(res2.valid).toBe(false);
    expect(res2.code).toBe("REPLAY_ATTACK_DETECTED");
  });
});

describe("Rolling QR hardening", () => {
  beforeEach(() => mockRedisStore.clear());

  it("uses the configured secret, never a hardcoded default", () => {
    expect(getRollingMasterSecret()).toBe(DEFAULT_32_CHAR_SECRET.slice(0, 32));
    const saved = process.env.BUS_ROLLING_SECRET_KEY;
    delete process.env.BUS_ROLLING_SECRET_KEY;
    expect(() => getRollingMasterSecret()).toThrow(/BUS_ROLLING_SECRET_KEY/);
    process.env.BUS_ROLLING_SECRET_KEY = saved;
  });

  it("rejects tokens signed with a different key", async () => {
    const timeBlock = Math.floor(Date.now() / 1000 / 2);
    const forged = computeRollingToken("42", timeBlock, "attacker-key-attacker-key-attacker!");
    const result = await verifyRollingBusToken({ busId: "42", timeBlock, token: forged }, "stud-1");
    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID_TOKEN");
  });

  it("rejects tokens older than the default ±6 s window", async () => {
    const timeBlock = Math.floor(Date.now() / 1000 / 2) - 10; // ~20 s old
    const token = computeRollingToken("42", timeBlock);
    const result = await verifyRollingBusToken({ busId: "42", timeBlock, token }, "stud-1");
    expect(result.code).toBe("EXPIRED_OR_DRIFT");
  });

  it("requires a student identity for replay protection", async () => {
    const payload = generateRollingBusPayload("42", "Bus 42");
    const result = await verifyRollingBusToken(payload.qrPayloadString);
    expect(result.valid).toBe(false);
  });
});
