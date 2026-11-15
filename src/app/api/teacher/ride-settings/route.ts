import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { getTeacherRideSettings, saveTeacherRideSettings, teacherRideInput, TeacherRideError } from "@/lib/teachers/ride";

export const dynamic = "force-dynamic";

const TEACHERS = ["teacher", "faculty"];

/**
 * Teacher bus settings (lib/teachers/ride.ts).
 * GET → { ready, settings, routes: [{ id, name, stops }], incomingShifts, outgoingShifts }
 * PUT { routeId, stopId, incomingShiftId, outgoingShiftId, days[], isActive }
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!TEACHERS.includes(session.role)) return NextResponse.json({ success: false, error: "For teachers only." }, { status: 403 });
  return NextResponse.json({ success: true, ...(await getTeacherRideSettings(session.userId)) });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!TEACHERS.includes(session.role)) return NextResponse.json({ success: false, error: "For teachers only." }, { status: 403 });
  const parsed = teacherRideInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid settings." }, { status: 400 });
  try {
    await saveTeacherRideSettings(session.userId, parsed.data);
    return NextResponse.json({ success: true, message: "Saved. You are added to the bus from the next boarding chart (within 5 minutes)." });
  } catch (e) {
    if (e instanceof TeacherRideError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[teacher ride-settings]", (e as Error).message);
    return NextResponse.json({ success: false, error: "Could not save." }, { status: 500 });
  }
}
