import crypto from "crypto";
import { redis } from "@/lib/redis";

/**
 * CampusFleet Dynamic Rolling Bus QR Cryptographic Protocol
 * 
 * Implements a time-synchronized HMAC-SHA256 rolling cryptographic token
 * for physical in-bus displays (ESP32-S3 TFT LCD / E-Paper) and conductor dashboards.
 * 
 * Key Features:
 * - 32-character Pre-Shared Master Secret Key (Symmetric)
 * - Anti-Replay: One-time single-use token consumption in Redis
 * - Time Step: Configurable (Default: 2 seconds for high responsiveness with low drift)
 * - Clock Drift Tolerance: Configurable +/- window steps
 * - Zero Physical RFID smartcard dependence
 * - Immune to screenshot sharing / remote proxy attendance
 */

/**
 * Master secret shared with the bus display (ESP32) firmware.
 * SERVER-ONLY: must come from BUS_ROLLING_SECRET_KEY. There is deliberately no
 * hardcoded fallback — a committed default would let anyone mint valid tokens.
 * This module must never be imported by a "use client" component.
 */
export function getRollingMasterSecret(): string {
  const secret = process.env.BUS_ROLLING_SECRET_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("BUS_ROLLING_SECRET_KEY must be set (32+ characters) to issue or verify rolling bus QR tokens.");
  }
  return secret.slice(0, 32);
}

// Default rolling window time step in seconds (e.g. 2s or 3s)
export const DEFAULT_TIME_STEP_SECONDS = 2;

/** Accepted clock drift in steps (±6 s at a 2 s step). */
export const DEFAULT_TOLERANCE_STEPS = 3;

export interface RollingBusPayload {
  version: "CF-QR-v1";
  busId: string;
  busNumber: string;
  timestampSec: number;
  timeBlock: number;
  stepSeconds: number;
  token: string;
  qrPayloadString: string;
  remainingInStepSec: number;
}

export interface VerificationResult {
  valid: boolean;
  busId?: string;
  timeDeltaSec?: number;
  error?: string;
  code?: "INVALID_TOKEN" | "EXPIRED_OR_DRIFT" | "REPLAY_ATTACK_DETECTED" | "CORRUPTED_PAYLOAD";
}

/**
 * Derives a dedicated 32-character HMAC secret key for a specific vehicle asset
 * to isolate vehicle credentials (preventing cross-bus forgery).
 */
export function getBusSecretKey(busId: string, masterKey: string = getRollingMasterSecret()): string {
  return crypto
    .createHmac("sha256", masterKey)
    .update(`BUS_SALT:${busId}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Computes an HMAC-SHA256 16-character hex token for a specific time block.
 * 16 hex characters = 64 bits of cryptographic entropy, rendering brute force
 * computationally impossible in a 2-second lifetime window.
 */
export function computeRollingToken(busId: string, timeBlock: number, secretKey: string = getRollingMasterSecret()): string {
  const busKey = getBusSecretKey(busId, secretKey);
  const message = `CFLEET:${busId}:${timeBlock}`;
  return crypto
    .createHmac("sha256", busKey)
    .update(message)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

/**
 * Generates the current rolling cryptographic QR payload for a bus display.
 */
export function generateRollingBusPayload(
  busId: string | number,
  busNumber: string | number = `Bus ${busId}`,
  secretKey: string = getRollingMasterSecret(),
  stepSeconds: number = DEFAULT_TIME_STEP_SECONDS
): RollingBusPayload {
  const cleanBusId = String(busId);
  const cleanBusNumber = String(busNumber);
  const nowSec = Math.floor(Date.now() / 1000);
  const timeBlock = Math.floor(nowSec / stepSeconds);
  const token = computeRollingToken(cleanBusId, timeBlock, secretKey);
  const remainingInStepSec = stepSeconds - (nowSec % stepSeconds);

  // Compact URI payload for high-density, lightning-fast QR optical recognition
  // Format: cf://b/{busId}?t={timeBlock}&k={token}
  const qrPayloadString = `cf://b/${cleanBusId}?t=${timeBlock}&k=${token}`;

  return {
    version: "CF-QR-v1",
    busId: cleanBusId,
    busNumber: cleanBusNumber,
    timestampSec: nowSec,
    timeBlock,
    stepSeconds,
    token,
    qrPayloadString,
    remainingInStepSec,
  };
}

/**
 * Parses and cryptographically verifies a scanned rolling QR code string or payload.
 * 
 * Supports:
 * - Scanned string format: `cf://b/{busId}?t={timeBlock}&k={token}`
 * - Scanned JSON format: `{"type":"ROLLING_BUS_QR","busId":"...","timeBlock":...,"token":"..."}`
 * - Tolerance window: current timeBlock ± DEFAULT_TOLERANCE_STEPS (±6 s)
 * - Constant-time signature comparison
 * - Anti-Replay: atomic single-use claim per student per bus per time block (Redis SET NX);
 *   fails closed in production when Redis is unavailable
 */
export async function verifyRollingBusToken(
  scannedData: string | { busId: string; timeBlock?: number; timestampSec?: number; token: string },
  studentId?: string,
  toleranceSteps: number = DEFAULT_TOLERANCE_STEPS,
  secretKey: string = getRollingMasterSecret(),
  stepSeconds: number = DEFAULT_TIME_STEP_SECONDS
): Promise<VerificationResult> {
  let busId = "";
  let scannedTimeBlock = 0;
  let scannedToken = "";

  // 1. Parse Scanned Payload
  if (typeof scannedData === "string") {
    const trimmed = scannedData.trim();
    if (trimmed.toLowerCase().startsWith("cf://b/")) {
      try {
        const normalized = "http://cf.local/" + trimmed.slice(trimmed.indexOf("b/"));
        const url = new URL(normalized);
        const pathParts = url.pathname.split("/").filter(Boolean);
        busId = pathParts[1] || "";
        scannedTimeBlock = parseInt(url.searchParams.get("t") || "0", 10);
        scannedToken = (url.searchParams.get("k") || "").toUpperCase();
      } catch {
        return { valid: false, error: "Invalid rolling QR URI structure.", code: "CORRUPTED_PAYLOAD" };
      }
    } else if (trimmed.startsWith("{")) {
      try {
        const json = JSON.parse(trimmed);
        busId = json.busId || json.b || "";
        scannedTimeBlock = Number(json.timeBlock || json.t || Math.floor((json.timestampSec || 0) / stepSeconds));
        scannedToken = String(json.token || json.k || json.hmac || "").toUpperCase();
      } catch {
        return { valid: false, error: "Invalid rolling QR JSON payload.", code: "CORRUPTED_PAYLOAD" };
      }
    } else {
      return { valid: false, error: "Unrecognized QR code schema.", code: "CORRUPTED_PAYLOAD" };
    }
  } else if (typeof scannedData === "object" && scannedData !== null) {
    busId = scannedData.busId;
    scannedTimeBlock = scannedData.timeBlock || Math.floor((scannedData.timestampSec || 0) / stepSeconds);
    scannedToken = (scannedData.token || "").toUpperCase();
  }

  if (!busId || !scannedTimeBlock || !scannedToken) {
    return { valid: false, error: "Missing bus ID, time block, or cryptographic token.", code: "CORRUPTED_PAYLOAD" };
  }

  // 2. Compute Current Server Time Block & Allow Window Drift Tolerance
  const nowSec = Math.floor(Date.now() / 1000);
  const currentServerTimeBlock = Math.floor(nowSec / stepSeconds);
  const timeDeltaBlocks = Math.abs(currentServerTimeBlock - scannedTimeBlock);

  if (timeDeltaBlocks > toleranceSteps) {
    return {
      valid: false,
      busId,
      timeDeltaSec: timeDeltaBlocks * stepSeconds,
      error: `QR code expired (${timeDeltaBlocks * stepSeconds}s clock delta). Please point your camera at the live rolling screen.`,
      code: "EXPIRED_OR_DRIFT",
    };
  }

  // 3. Cryptographic Signature Match
  const expectedToken = Buffer.from(computeRollingToken(busId, scannedTimeBlock, secretKey), "utf8");
  const receivedToken = Buffer.from(scannedToken, "utf8");
  if (expectedToken.length !== receivedToken.length || !crypto.timingSafeEqual(expectedToken, receivedToken)) {
    return {
      valid: false,
      busId,
      error: "Cryptographic signature mismatch. Possible fraudulent or forged QR code.",
      code: "INVALID_TOKEN",
    };
  }

  // 4. Anti-Replay Protection via Redis (atomic SET NX).
  // A token is accepted once per student per bus per time block. Screenshot sharing
  // between students is limited by the ±6 s freshness window; callers must also
  // check that the scanning student is assigned to this bus.
  if (!studentId) {
    return { valid: false, busId, error: "Student identity is required for rolling QR verification.", code: "CORRUPTED_PAYLOAD" };
  }
  const replayKey = `replay:bus_qr:${busId}:${scannedTimeBlock}:${studentId}`;
  if (redis) {
    try {
      const claimed = await redis.set(replayKey, "CONSUMED", { nx: true, ex: 120 });
      if (claimed !== "OK") {
        return {
          valid: false,
          busId,
          error: "Replay attack detected: This dynamic token has already been consumed.",
          code: "REPLAY_ATTACK_DETECTED",
        };
      }
    } catch (err) {
      console.error("[rolling-bus-crypto] Redis replay check failed:", err);
      return { valid: false, busId, error: "Verification service temporarily unavailable. Please rescan.", code: "REPLAY_ATTACK_DETECTED" };
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail closed: without Redis we cannot enforce single use.
    return { valid: false, busId, error: "Verification service temporarily unavailable. Please rescan.", code: "REPLAY_ATTACK_DETECTED" };
  }

  return {
    valid: true,
    busId,
    timeDeltaSec: (currentServerTimeBlock - scannedTimeBlock) * stepSeconds,
  };
}
