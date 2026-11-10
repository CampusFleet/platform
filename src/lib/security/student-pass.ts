import crypto from "crypto";

/**
 * Server-signed rotating student boarding pass.
 *
 * The student app fetches `{ studentId, window, sig }` from
 * GET /api/students/pass-token (session-bound) and embeds it in the QR shown
 * to the conductor. The conductor scanner verifies the HMAC, so a pass cannot
 * be forged for another student and an old screenshot expires after
 * PASS_WINDOW_SECONDS × (tolerance + 1).
 *
 * Server-only module: never import from a "use client" file.
 */
export const PASS_WINDOW_SECONDS = 60;
const DEFAULT_TOLERANCE_WINDOWS = 1;

function getPassSecret(): string {
  const secret = process.env.STUDENT_PASS_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("STUDENT_PASS_SECRET (or JWT_SECRET) must be set to at least 32 characters.");
  }
  return secret;
}

export function currentPassWindow(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / (PASS_WINDOW_SECONDS * 1000));
}

export function signStudentPass(studentId: string, window: number): string {
  return crypto
    .createHmac("sha256", getPassSecret())
    .update(`CF-PASS:${studentId}:${window}`)
    .digest("hex")
    .slice(0, 32);
}

export function issueStudentPass(studentId: string, nowMs: number = Date.now()) {
  const window = currentPassWindow(nowMs);
  const nextWindowStartMs = (window + 1) * PASS_WINDOW_SECONDS * 1000;
  return {
    type: "DYNAMIC_PASS" as const,
    studentId,
    window,
    sig: signStudentPass(studentId, window),
    refreshInMs: Math.max(1000, nextWindowStartMs - nowMs),
  };
}

export type PassVerification =
  | { valid: true; studentId: string }
  | { valid: false; code: "MISSING_SIGNATURE" | "EXPIRED_PASS" | "INVALID_SIGNATURE"; message: string };

export function verifyStudentPass(
  payload: { studentId?: unknown; window?: unknown; sig?: unknown },
  toleranceWindows: number = DEFAULT_TOLERANCE_WINDOWS,
  nowMs: number = Date.now()
): PassVerification {
  const studentId = typeof payload.studentId === "string" ? payload.studentId : "";
  const window = Number(payload.window);
  const sig = typeof payload.sig === "string" ? payload.sig : "";

  if (Number.isInteger(window) && Math.abs(currentPassWindow(nowMs) - window) > toleranceWindows) {
    return { valid: false, code: "EXPIRED_PASS", message: "Expired dynamic pass (old screenshot). Ask the student to show their live pass." };
  }

  if (!studentId || !Number.isInteger(window) || !sig) {
    return { valid: false, code: "MISSING_SIGNATURE", message: "Pass is not signed. Ask the student to reopen their live pass." };
  }

  const expected = Buffer.from(signStudentPass(studentId, window), "utf8");
  const received = Buffer.from(sig, "utf8");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { valid: false, code: "INVALID_SIGNATURE", message: "Pass signature mismatch. Possible forged pass." };
  }

  return { valid: true, studentId };
}
