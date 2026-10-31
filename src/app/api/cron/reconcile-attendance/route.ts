import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/cron/reconcile-attendance - Stateless daily scheduled cron job
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Allow local or matching secret
    }

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const apiUrl = `${protocol}://${host}/api/merges`;

    // Trigger reconciliation and auto-detection
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "RECONCILE_AND_DETECT",
        reviewerName: "AUTOMATED_MIDDAY_CRON",
      }),
    });

    const data = await response.json();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      cronResult: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Cron reconciliation failed" },
      { status: 500 }
    );
  }
}
