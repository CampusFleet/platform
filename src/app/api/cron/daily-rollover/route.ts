import { NextRequest, NextResponse } from "next/server";
import { executeDailyRollover } from "@/lib/daily-rollover";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { isAuthorizedCron } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel Cron calls GET with the CRON_SECRET bearer (vercel.json, 00:05 IST): create today's trips.
  if (isAuthorizedCron(req)) {
    const result = await executeDailyRollover(undefined, { triggeredBy: "CRON" });
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  }
  const getSession = await getSessionFromRequest(req);
  if ((!getSession || !["admin", "transport_admin", "transport_manager"].includes(getSession.role))) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }
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

    // Callers: the scheduler (CRON_SECRET bearer) or a signed-in user's store doing the
    // idempotent "lazy init" for today. Only managers may force a re-run.
    const isCron = isAuthorizedCron(req);
    const session = isCron ? null : await getSessionFromRequest(req);
    if (!isCron && !session) {
      return NextResponse.json({ success: false, message: "Unauthorized cron request." }, { status: 401 });
    }
    const canForce = isCron || (session && ["admin", "transport_admin", "transport_manager"].includes(session.role));

    const { targetDate, force, triggeredBy = "API_REQUEST" } = body;

    // Non-managers may only initialise today (IST), never arbitrary dates.
    const todayIst = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];
    if (!canForce && targetDate && targetDate !== todayIst) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    }

    const result = await executeDailyRollover(canForce ? targetDate : todayIst, {
      force: Boolean(force) && Boolean(canForce),
      triggeredBy: isCron ? "CRON" : `${triggeredBy}:${session?.role}`,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to trigger daily rollover" },
      { status: 500 }
    );
  }
}
