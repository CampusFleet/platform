import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateRollingBusPayload,
  verifyRollingBusToken,
  computeRollingToken,
  getBusSecretKey,
  DEFAULT_32_CHAR_SECRET,
} from "@/lib/rolling-bus-crypto";

// Mock Redis
const mockRedisStore = new Map<string, any>();
vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn(async (key: string) => mockRedisStore.get(key) || null),
  cacheSet: vi.fn(async (key: string, val: any) => {
    mockRedisStore.set(key, val);
    return "OK";
  }),
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
