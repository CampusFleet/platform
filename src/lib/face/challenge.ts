import crypto from "crypto";
import { redis } from "@/lib/redis";
import type { TurnSide } from "./pose";

/**
 * One-time Face ID enrollment challenge.
 *
 * GET /api/biometrics/challenge issues a signed token bound to the signed-in user, with a random
 * turn direction and a 5-minute expiry. enroll-v2 accepts frames only with a valid, unused token,
 * so a recorded request cannot be replayed later. Single use is enforced in Redis when it is configured.
 *
 * Server-only module.
 */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function secret(): string {
  const s = process.env.FACE_CHALLENGE_SECRET || process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("FACE_CHALLENGE_SECRET (or JWT_SECRET) must be at least 32 characters.");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(`CF-FACE:${payload}`).digest("base64url");
}

export interface FaceChallenge {
  token: string;
  turn: TurnSide;
  expiresAt: number;
}

export function issueFaceChallenge(userId: string, nowMs: number = Date.now()): FaceChallenge {
  const turn: TurnSide = crypto.randomInt(2) === 0 ? "LEFT" : "RIGHT";
  const expiresAt = nowMs + CHALLENGE_TTL_MS;
  const nonce = crypto.randomBytes(12).toString("base64url");
  const payload = [userId, expiresAt, turn, nonce].join("|");
  return { token: `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`, turn, expiresAt };
}

export type ChallengeCheck =
  | { valid: true; turn: TurnSide; nonce: string }
  | { valid: false; reason: "MISSING" | "MALFORMED" | "BAD_SIGNATURE" | "WRONG_USER" | "EXPIRED" };

export function verifyFaceChallenge(token: unknown, userId: string, nowMs: number = Date.now()): ChallengeCheck {
  if (typeof token !== "string" || !token) return { valid: false, reason: "MISSING" };
  const [body, sig] = token.split(".");
  if (!body || !sig) return { valid: false, reason: "MALFORMED" };
  const payload = Buffer.from(body, "base64url").toString("utf8");
  const parts = payload.split("|");
  if (parts.length !== 4) return { valid: false, reason: "MALFORMED" };
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return { valid: false, reason: "BAD_SIGNATURE" };
  const [uid, exp, turn, nonce] = parts;
  if (uid !== userId) return { valid: false, reason: "WRONG_USER" };
  if (!(Number(exp) > nowMs)) return { valid: false, reason: "EXPIRED" };
  if (turn !== "LEFT" && turn !== "RIGHT") return { valid: false, reason: "MALFORMED" };
  return { valid: true, turn, nonce };
}

/** Marks the nonce used. Returns false if it was already used. Without Redis, expiry alone applies. */
export async function consumeFaceChallenge(nonce: string): Promise<boolean> {
  if (!redis) return true;
  try {
    const r = await redis.set(`faceid:challenge:${nonce}`, 1, { nx: true, px: CHALLENGE_TTL_MS });
    return r === "OK";
  } catch (e) {
    console.warn("[face-challenge] redis unavailable, relying on expiry:", (e as Error).message);
    return true;
  }
}
