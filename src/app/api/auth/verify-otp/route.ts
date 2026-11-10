import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { signToken, createSessionCookie } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { findOrCreateUser } from "@/lib/account-service";
import { redis } from "@/lib/redis";

// In-memory brute-force protection
const verifyAttempts = new Map<string, { count: number; windowStart: number }>();
const VERIFY_RATE_LIMIT = 5; // Max 5 attempts per email per window
const VERIFY_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * POST /api/auth/verify-otp
 *
 * Validates the 6-digit OTP and creates a session if valid.
 * Includes brute-force protection and timing-safe comparison.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanOtp = (otp || "").trim();

    if (!cleanEmail || !cleanOtp) {
      return NextResponse.json(
        { error: "Email and OTP code are required" },
        { status: 400 }
      );
    }

    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      return NextResponse.json(
        { error: "OTP must be exactly 6 digits." },
        { status: 400 }
      );
    }

    // ── Brute-Force Protection ────────────────────────────────────────
    const rateLimitResult = checkVerifyRateLimit(cleanEmail);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: `Too many verification attempts. Please wait ${rateLimitResult.retryAfterMins} minutes or request a new code.`,
        },
        { status: 429 }
      );
    }

    let isOtpValid = false;

    // ── 1. Check Redis First (Sub-50ms ultra-fast verification) ───────
    if (redis) {
      try {
        const cachedRaw = await redis.get(`auth_otp:${cleanEmail}`);
        if (cachedRaw) {
          const cached = typeof cachedRaw === "string" ? JSON.parse(cachedRaw) : cachedRaw;
          const inputHash = crypto.createHash("sha256").update(cleanOtp).digest("hex");
          if (cached.codeHash && timingSafeEqual(inputHash, cached.codeHash)) {
            isOtpValid = true;
            // Delete from Redis so it cannot be re-used
            await redis.del(`auth_otp:${cleanEmail}`);
          }
        }
      } catch (redisErr) {
        console.warn("Redis verify warning:", redisErr);
      }
    }

    // ── 2. Fallback to Supabase Database (if not found in Redis) ───────
    if (!isOtpValid) {
      try {
        const { data: otpRecord } = await supabaseAdmin
          .from("auth_otps")
          .select("*")
          .eq("email", cleanEmail)
          .eq("used", false)
          .order("created_at", { ascending: false })
          .maybeSingle();

        if (otpRecord) {
          const currentAttempts = otpRecord.attempts || 0;
          const maxAttempts = otpRecord.max_attempts || 5;

          if (currentAttempts < maxAttempts && new Date(otpRecord.expires_at) >= new Date()) {
            const inputHash = crypto.createHash("sha256").update(cleanOtp).digest("hex");
            const targetHash = otpRecord.code_hash || "";
            if (timingSafeEqual(inputHash, targetHash)) {
              isOtpValid = true;
              await supabaseAdmin.from("auth_otps").update({ used: true }).eq("id", otpRecord.id);
            }
          }
        }
      } catch (dbErr) {
        console.warn("DB OTP verify fallback warning:", dbErr);
      }
    }

    if (!isOtpValid) {
      return NextResponse.json(
        { error: "Invalid or expired verification code. Please request a new one." },
        { status: 401 }
      );
    }

    // ── Clear Rate Limit on Success ───────────────────────────────────
    verifyAttempts.delete(cleanEmail);

    // ── Find or Create User (With Resilient Fallback) ──────────────────
    let user: any = null;
    try {
      const result = await findOrCreateUser({
        email: cleanEmail,
        provider: "email_otp",
      });
      user = result.user;
    } catch (userErr) {
      // Fail closed: never mint a session (let alone an admin one) for a user
      // that could not be loaded from or saved to the database.
      console.error("findOrCreateUser failed during OTP login:", userErr);
      return NextResponse.json(
        { success: false, error: "Sign-in is temporarily unavailable. Please try again shortly." },
        { status: 503 }
      );
    }

    // Create JWT session
    const token = await signToken({
      userId: user.id,
      email: user.email,
      fullName: user.full_name || cleanEmail.split("@")[0],
      role: user.role || "student",
      campusId: user.campus_id || user.campus || "",
      campus: user.campus || "",
      photoUrl: user.photo_url || undefined,
      avatarUrl: user.photo_url || undefined,
    });

    const authUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name || cleanEmail.split("@")[0],
      role: user.role || "student",
      campusId: user.campus_id || user.campus || "",
      campus: user.campus || "",
      photoUrl: user.photo_url,
      avatarUrl: user.photo_url,
      studentId: user.role === "student" ? user.id : undefined,
      token: `tok_jwt_${Date.now()}`,
      createdAt: user.created_at || new Date().toISOString(),
    };

    const response = NextResponse.json({ success: true, user: authUser });
    response.headers.set("Set-Cookie", createSessionCookie(token));
    return response;
  } catch (e: any) {
    console.error("Verify OTP error:", e);
    return NextResponse.json(
      { error: e.message || "Verification failed" },
      { status: 500 }
    );
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks on OTP verification.
 * Both strings must have the same length.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.byteLength !== bufB.byteLength) return false;

  // XOR comparison — constant time regardless of where mismatch occurs
  let result = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/**
 * In-memory brute-force rate limiting for OTP verification.
 */
function checkVerifyRateLimit(identifier: string): {
  allowed: boolean;
  retryAfterMins?: number;
} {
  const now = Date.now();
  const entry = verifyAttempts.get(identifier);

  if (!entry || now - entry.windowStart > VERIFY_RATE_WINDOW_MS) {
    verifyAttempts.set(identifier, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= VERIFY_RATE_LIMIT) {
    const retryAfterMs = VERIFY_RATE_WINDOW_MS - (now - entry.windowStart);
    return {
      allowed: false,
      retryAfterMins: Math.ceil(retryAfterMs / 60000),
    };
  }

  entry.count++;
  return { allowed: true };
}
