import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { getFleetLive } from "@/lib/manager/fleet-live";

export const dynamic = "force-dynamic";

/** GET /api/transport-manager/fleet-live → { runs: FleetRun[] } for today (lib/manager/fleet-live.ts). */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !isManageRole(session.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  return NextResponse.json({ success: true, runs: await getFleetLive() }, { headers: { "cache-control": "no-store" } });
}
