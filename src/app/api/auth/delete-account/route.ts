import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/jwt";
import { cookies } from "next/headers";
import { del } from "@vercel/blob";
import { invalidateCachedUserRole } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function DELETE(req: NextRequest) {
  try {
    // 1. Authenticate Request
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const session = await verifyToken(token);
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: "Invalid session" }, { status: 401 });
    }

    const userId = session.userId;

    // 2. Identify linked student profile (check by user_id or id)
    const { data: studentData } = await supabaseAdmin
      .from("students")
      .select("id")
      .or(`user_id.eq.${userId},id.eq.${userId},id.eq.stud-${userId}`)
      .limit(1)
      .maybeSingle();

    if (studentData?.id) {
      const studentId = studentData.id;

      // Clean up receipt images from Vercel Blob if configured
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const { data: submissions } = await supabaseAdmin
            .from("payment_submissions")
            .select("receipt_url")
            .eq("student_id", studentId);

          if (submissions && submissions.length > 0) {
            const urlsToDelete = submissions
              .map((sub: any) => sub.receipt_url)
              .filter(Boolean);

            if (urlsToDelete.length > 0) {
              await del(urlsToDelete, { token: process.env.BLOB_READ_WRITE_TOKEN });
            }
          }
        } catch (blobErr) {
          console.warn("[Delete Account] Blob receipt cleanup skipped:", blobErr);
        }
      }

      const studentCleanup = [
        supabaseAdmin.from("attendance_records").delete().eq("student_id", studentId),
        supabaseAdmin.from("halt_requests").delete().eq("student_id", studentId),
        supabaseAdmin.from("bus_departure_alerts").delete().eq("student_id", studentId),
        supabaseAdmin.from("payment_submissions").delete().eq("student_id", studentId),
        supabaseAdmin.from("payment_records").delete().eq("student_id", studentId),
        supabaseAdmin.from("special_shift_allocations").delete().eq("student_id", studentId),
        supabaseAdmin.from("bus_switch_requests").delete().eq("student_id", studentId),
        supabaseAdmin.from("bus_reservations").delete().eq("student_id", studentId),
        supabaseAdmin.from("subscriptions").delete().eq("student_id", studentId),
      ];

      await Promise.allSettled(studentCleanup);

      // Delete student record
      await supabaseAdmin.from("students").delete().eq("id", studentId);
    }

    // 3. Clean up user-level tables
    const userCleanup = [
      supabaseAdmin.from("students").delete().eq("user_id", userId),
      supabaseAdmin.from("audit_logs").delete().eq("user_id", userId),
      supabaseAdmin.from("notifications").delete().eq("user_id", userId),
      supabaseAdmin.from("user_preferences").delete().or(`id.eq.${userId},user_id.eq.${userId}`),
      supabaseAdmin.from("staff").delete().eq("user_id", userId),
      supabaseAdmin.from("guardians").delete().eq("user_id", userId),
      supabaseAdmin.from("profiles").delete().eq("id", userId),
      supabaseAdmin.from("bus_switch_requests").delete().eq("manager_id", userId),
      supabaseAdmin.from("vehicle_issues").delete().eq("reported_by", userId),
      supabaseAdmin.from("maintenance_logs").delete().eq("created_by", userId),
    ];

    await Promise.allSettled(userCleanup);

    // 4. Delete user from institutional `users` table
    const { error: userDeleteError } = await supabaseAdmin.from("users").delete().eq("id", userId);
    if (userDeleteError) {
      console.warn("[Delete Account] Error deleting from users table:", userDeleteError.message);
    }

    // 5. Best-effort Supabase GoTrue Auth deletion (silent fallback if not using GoTrue)
    try {
      if (supabaseAdmin?.auth?.admin?.deleteUser) {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteError) {
          console.warn("[Delete Account] Supabase Auth delete skipped (institutional user):", deleteError.message);
        }
      }
    } catch (authErr: any) {
      console.warn("[Delete Account] Supabase Auth admin delete skipped:", authErr?.message || authErr);
    }

    // 6. Invalidate Redis cache
    try {
      await invalidateCachedUserRole(userId);
    } catch (redisErr) {
      console.warn("[Delete Account] Redis cache invalidation skipped:", redisErr);
    }

    // 7. Clear JWT session cookies
    const cookieStore = cookies();
    cookieStore.delete(COOKIE_NAME);

    const response = NextResponse.json({
      success: true,
      message: "Your account and all associated transit data have been permanently deleted.",
    });

    response.cookies.set(COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  } catch (err: any) {
    console.error("[Delete Account] Unexpected Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "An unexpected error occurred during account deletion" },
      { status: 500 }
    );
  }
}
