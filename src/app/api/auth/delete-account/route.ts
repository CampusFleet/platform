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

    // 2. Delete the user and all linked rows in ONE transaction (supabase/migrations/20261113_delete_user_account_fn.sql).
    //    Previously ~20 parallel requests each hit the 6s client timeout while Postgres kept running them,
    //    holding locks on `users` and blocking new sign-ins.
    const { data: result, error: deleteError } = await supabaseAdmin
      .rpc("delete_user_account", { p_user_id: userId })
      .abortSignal(AbortSignal.timeout(25000));

    if (deleteError) {
      console.error("[Delete Account] delete_user_account failed:", deleteError);
      return NextResponse.json(
        { success: false, error: "Account deletion failed. Please try again shortly." },
        { status: 503 }
      );
    }

    // 3. Remove receipt images from Vercel Blob (rows are already gone, so this is best-effort)
    const receiptUrls: string[] = (result?.receipt_urls || []).filter(Boolean);
    if (receiptUrls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(receiptUrls, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (blobErr) {
        console.warn("[Delete Account] Blob receipt cleanup skipped:", blobErr);
      }
    }

    // 4. Invalidate Redis cache
    try {
      await invalidateCachedUserRole(userId);
    } catch (redisErr) {
      console.warn("[Delete Account] Redis cache invalidation skipped:", redisErr);
    }

    // 5. Clear JWT session cookies
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
