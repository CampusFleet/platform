import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { getPublicRide } from "@/lib/students/ride";

export const dynamic = "force-dynamic";

/**
 * GET /api/students/ride → the signed-in student's ride today (bus number, shift, route, stops,
 * own stop, own conductor's contact). No trip ids. See src/lib/students/ride.ts.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Only students have a ride." }, { status: 403 });
  try {
    return NextResponse.json({ success: true, ride: await getPublicRide(session.userId) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[ride]", (e as Error).message);
    return NextResponse.json({ success: false, error: "Could not load your ride." }, { status: 500 });
  }
}
