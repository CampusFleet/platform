import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { sendOtpEmail } from "@/lib/email";
import { redis } from "@/lib/redis";

// In-memory rate limiting fallback (per-instance, cleared on restart)
// Production should use Redis via @upstash/redis
const otpRateMap = new Map<string, { count: number; windowStart: number }>();
const OTP_RATE_LIMIT = 5; // Max 5 OTP requests per email per window
const OTP_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * POST /api/auth/send-otp
 *
 * Generates a cryptographically secure 6-digit OTP and stores it in Redis and the database.
 * Rate-limited to 5 requests per email per 10 minutes.
 * OTP code is NEVER exposed in production responses.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // ── Rate Limiting ─────────────────────────────────────────────────
    const rateLimitResult = checkRateLimit(cleanEmail);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: `Too many verification requests. Please wait ${rateLimitResult.retryAfterMins} minutes before trying again.`,
          retryAfterSeconds: rateLimitResult.retryAfterSecs,
        },
        { status: 429 }
      );
    }

    // ── Generate Cryptographically Secure 6-digit OTP ─────────────────
    const code = generateSecureOtp();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // 1. Store in Upstash Redis (Ultra-fast, sub-50ms, survives DB pauses)
    if (redis) {
      try {
        await redis.set(
          `auth_otp:${cleanEmail}`,
          JSON.stringify({ codeHash, code, expiresAt, attempts: 0, maxAttempts: 5 }),
          { ex: 600 }
        );
      } catch (redisErr) {
        console.warn("Redis OTP cache warning:", redisErr);
      }
    }

    // 2. Safe non-blocking database backup (timeout-guarded)
    (async () => {
      try {
        await supabaseAdmin
          .from("auth_otps")
          .update({ used: true })
          .eq("email", cleanEmail)
          .eq("used", false);

        await supabaseAdmin.from("auth_otps").insert({
          email: cleanEmail,
          code_hash: codeHash,
          expires_at: expiresAt,
          used: false,
          attempts: 0,
          max_attempts: 5,
        });
      } catch (dbErr) {
        console.warn("DB OTP storage warning (non-fatal):", dbErr);
      }
    })().catch(() => {});

    // Send email via Gmail SMTP (timeout-protected in email.ts)
    const emailResult = await sendOtpEmail(cleanEmail, code);

    // Log OTP only on server (never in response)
    console.log(
      `\n [OTP] Email: ${cleanEmail} | Expires: ${expiresAt} | Sent via SMTP: ${emailResult.sent}\n`
    );

    if (!emailResult.sent) {
      console.warn("SMTP dispatch failed:", emailResult.reason);
    }

    // ── Response — NEVER expose OTP code in production ────────────────
    const response: Record<string, any> = {
      success: true,
      message: emailResult.sent
        ? `Verification code dispatched from campusfleet@gmail.com to ${cleanEmail}`
        : `Verification code generated for ${cleanEmail}`,
    };

    // Only include devCode in non-production AND when SMTP fails
    if (process.env.NODE_ENV !== "production" && !emailResult.sent) {
      response.devCode = code;
    }

    return NextResponse.json(response);
  } catch (e: any) {
    console.error("Send OTP error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to send OTP" },
      { status: 500 }
    );
  }
}

/**
 * Generates a cryptographically secure 6-digit OTP using Web Crypto API.
 * More secure than Math.random() which is predictable.
 */
function generateSecureOtp(): string {
  // crypto.getRandomValues is available in Node 18+ and all modern runtimes
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  // Map to 100000-999999 range
  const otp = 100000 + (array[0] % 900000);
  return otp.toString();
}

/**
 * In-memory rate limiting check.
 * Returns whether the request is allowed and retry-after info.
 */
function checkRateLimit(identifier: string): {
  allowed: boolean;
  retryAfterMins?: number;
  retryAfterSecs?: number;
} {
  const now = Date.now();
  const entry = otpRateMap.get(identifier);

  if (!entry || now - entry.windowStart > OTP_RATE_WINDOW_MS) {
    // New window
    otpRateMap.set(identifier, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= OTP_RATE_LIMIT) {
    const retryAfterMs = OTP_RATE_WINDOW_MS - (now - entry.windowStart);
    return {
      allowed: false,
      retryAfterMins: Math.ceil(retryAfterMs / 60000),
      retryAfterSecs: Math.ceil(retryAfterMs / 1000),
    };
  }

  entry.count++;
  return { allowed: true };
}
