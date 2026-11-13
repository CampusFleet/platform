import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { getCrewDuty } from "@/lib/crew/duty";
import { isSafeId } from "@/lib/security/safe-id";

export const dynamic = "force-dynamic";

/** GET /api/crew/duty?tripId= — today's trips, the current trip and its manifest for the signed-in crew member. */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const tripId = req.nextUrl.searchParams.get("tripId");
  const duty = await getCrewDuty(session, isSafeId(tripId) ? tripId : null);
  return NextResponse.json({ success: true, ...duty }, { headers: { "Cache-Control": "no-store" } });
}
