import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { getTeacherRideLive } from "@/lib/teachers/ride";

export const dynamic = "force-dynamic";

/** GET /api/teacher/ride/live → trip status, bus GPS, boarded and seat for the teacher's current ride. */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!["teacher", "faculty"].includes(session.role)) return NextResponse.json({ success: false, error: "For teachers only." }, { status: 403 });
  return NextResponse.json({ success: true, live: await getTeacherRideLive(session.userId) }, { headers: { "cache-control": "no-store" } });
}
