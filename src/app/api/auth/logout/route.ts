import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, verifyToken, COOKIE_NAME } from "@/lib/jwt";
import { cacheDel, invalidateCachedStudentProfile, invalidateCachedUserRole } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabaseClient";

/**
 * POST /api/auth/logout
 * Clears the session cookie and every Redis entry cached for this user
 * (role, student profile by user id / email / student id, subscription, photo).
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      const session = await verifyToken(token);
      if (session && session.userId) {
        const { data: students } = await supabaseAdmin
          .from("students")
          .select("id")
          .eq("user_id", session.userId)
          .abortSignal(AbortSignal.timeout(3000));
        await Promise.allSettled([
          invalidateCachedUserRole(session.userId),
          invalidateCachedStudentProfile([session.userId, session.email, ...(students || []).map((s) => s.id)]),
          cacheDel(`student:photo:${session.userId}`),
        ]);
      }
    }
  } catch (err) {
    console.warn("Redis cache invalidation failed during logout:", err);
  }

  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", clearSessionCookie());
  // Drop HTTP-cached responses for this origin; browser storage is cleared by clearClientUserData().
  response.headers.set("Clear-Site-Data", '"cache"');
  return response;
}
