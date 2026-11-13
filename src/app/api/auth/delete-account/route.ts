import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/jwt";
import { cookies } from "next/headers";
import { del } from "@vercel/blob";
import { waitUntil } from "@vercel/functions";
import { cacheDel, invalidateCachedStudentProfile, invalidateCachedUserRole } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { deleteEvidence } from "@/lib/gate/evidence";

/**
 * Keep only URLs that belong to the Blob store of `token`. `del()` rejects the whole batch
 * if any URL is foreign (e.g. Razorpay dashboard links or placeholder images stored as receipts).
 */
function onlyStoreUrls(urls: string[], token?: string): string[] {
  const storeId = token?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/)?.[1]?.toLowerCase();
  if (!storeId) return [];
  return urls.filter((u) => {
    try {
      return new URL(u).hostname === `${storeId}.public.blob.vercel-storage.com`;
    } catch {
      return false;
    }
  });
}

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

    // 2. Delete the user and all linked rows in ONE transaction (supabase/migrations/20261113b_delete_user_account_files.sql).
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

    // 3. Invalidate every cached copy of the profile so a re-registration never sees old data/photo
    const studentIds: string[] = result?.student_ids || [];
    await Promise.allSettled([
      invalidateCachedUserRole(userId),
      invalidateCachedStudentProfile([userId, session.email, ...studentIds]),
      cacheDel(`student:photo:${userId}`),
    ]);

    // 4. Erase stored files after the response (rows are already gone; Blob calls take ~1s each)
    const publicUrls = onlyStoreUrls(result?.blob_urls || result?.receipt_urls || [], process.env.BLOB_READ_WRITE_TOKEN);
    const evidenceKeys: string[] = (result?.evidence_keys || []).filter(Boolean);
    waitUntil(
      Promise.allSettled([
        publicUrls.length > 0 ? del(publicUrls, { token: process.env.BLOB_READ_WRITE_TOKEN }) : null,
        evidenceKeys.length > 0 ? deleteEvidence(evidenceKeys) : null,
      ]).then((results) =>
        results.forEach((r) => r.status === "rejected" && console.warn("[Delete Account] File cleanup failed:", r.reason))
      )
    );

    // 5. Clear JWT session cookies
    const cookieStore = cookies();
    cookieStore.delete(COOKIE_NAME);

    const response = NextResponse.json({
      success: true,
      message: "Your account and all associated transit data have been permanently deleted.",
    });

    response.headers.set("Clear-Site-Data", '"cache"');
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
