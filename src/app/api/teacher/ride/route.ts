import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { getTeacherRide } from "@/lib/teachers/ride";

export const dynamic = "force-dynamic";

/** GET /api/teacher/ride → the teacher's ride today (same shape as /api/students/ride; no trip ids). */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!["teacher", "faculty"].includes(session.role)) return NextResponse.json({ success: false, error: "For teachers only." }, { status: 403 });
  return NextResponse.json({ success: true, ride: await getTeacherRide(session.userId) }, { headers: { "cache-control": "no-store" } });
}
