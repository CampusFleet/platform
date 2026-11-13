import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { getRideLive } from "@/lib/students/ride";

export const dynamic = "force-dynamic";

/**
 * GET /api/students/ride/live → { status, currentStopIndex, delayMinutes, boarded, bus, halt }
 * One small call the radar makes every few seconds while visible (replaces separate GPS,
 * trip and halt-request polling). Bus position comes from Redis `telematics:bus:{busId}`.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Only students have a ride." }, { status: 403 });
  try {
    return NextResponse.json({ success: true, live: await getRideLive(session.userId) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[ride/live]", (e as Error).message);
    return NextResponse.json({ success: false, error: "Live status unavailable." }, { status: 500 });
  }
}
