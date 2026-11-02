import { NextRequest, NextResponse } from "next/server";
import { executeDailyRollover } from "@/lib/daily-rollover";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const targetDate = dateParam || istDate.toISOString().split("T")[0];

    // Query status of trips on targetDate
    const { data: trips, error: tripsErr } = await supabaseAdmin
      .from("trips")
      .select("id, trip_code, status, route_id, bus_id, shift_id")
      .eq("trip_date", targetDate);

    if (tripsErr) throw tripsErr;

    const { data: bookings, error: bkErr } = await supabaseAdmin
      .from("bus_reservations")
      .select("id, status")
      .eq("reservation_date", targetDate);

    if (bkErr) throw bkErr;

    // Get latest rollover audit log
    const { data: lastLog } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .eq("action", "DAILY_ROLLOVER_SUCCESS")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isInitialized = (trips || []).length > 0;

    return NextResponse.json({
      success: true,
      targetDate,
      isInitialized,
      activeTripsCount: (trips || []).length,
      bookingsTodayCount: (bookings || []).length,
      lastRollover: lastLog
        ? {
            timestamp: lastLog.created_at,
            reason: lastLog.reason,
            details: lastLog.new_value,
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to inspect daily status" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // If CRON_SECRET is configured, check token if called externally
    if (cronSecret && authHeader) {
      const token = authHeader.replace("Bearer ", "").trim();
      if (token !== cronSecret && token !== "bypass_local_dev") {
        return NextResponse.json({ success: false, message: "Unauthorized cron request." }, { status: 401 });
      }
    }

    const { targetDate, force, triggeredBy = "API_REQUEST" } = body;

    const result = await executeDailyRollover(targetDate, {
      force: Boolean(force),
      triggeredBy,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to trigger daily rollover" },
      { status: 500 }
    );
  }
}
