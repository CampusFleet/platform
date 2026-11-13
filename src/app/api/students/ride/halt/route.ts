import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { getRideInternal, getRideLive } from "@/lib/students/ride";
import { createHaltRequest } from "@/lib/dispatch/halt";

export const dynamic = "force-dynamic";

const body = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

/**
 * POST /api/students/ride/halt { latitude, longitude } → asks the student's own bus to wait.
 * The trip is taken from the student's reservation on the server; the student cannot name a trip.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Only riders can ask the bus to wait." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Your location is needed to send the request." }, { status: 400 });

  const ride = await getRideInternal(session.userId);
  if (!ride.tripId || !ride.studentId) return NextResponse.json({ success: false, error: "You have no bus today." }, { status: 404 });
  const live = await getRideLive(session.userId);
  if (live.boarded) return NextResponse.json({ success: false, error: "You are already on the bus." }, { status: 409 });
  if (live.status === "COMPLETED" || live.status === "CANCELLED") {
    return NextResponse.json({ success: false, error: "This trip has ended." }, { status: 409 });
  }
  const request = await createHaltRequest(ride.tripId, ride.studentId, parsed.data);
  return NextResponse.json({ success: true, halt: { status: request.status, updatedAt: request.updatedAt } });
}
