import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/security/cron-auth";
import { POST as mergesPost } from "@/app/api/merges/route";

export const dynamic = "force-dynamic";

// GET /api/cron/reconcile-attendance - Scheduled daily reconciliation (CRON_SECRET required)
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    // Call the merges handler in-process (no HTTP hop built from the untrusted Host header).
    const internalReq = new NextRequest("http://internal.campusfleet/api/merges", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: req.headers.get("authorization") || "",
      },
      body: JSON.stringify({ action: "RECONCILE_AND_DETECT" }),
    });

    const response = await mergesPost(internalReq);
    const data = await response.json();

    return NextResponse.json({
      success: response.ok,
      timestamp: new Date().toISOString(),
      cronResult: data,
    }, { status: response.ok ? 200 : response.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Cron reconciliation failed" },
      { status: 500 }
    );
  }
}
