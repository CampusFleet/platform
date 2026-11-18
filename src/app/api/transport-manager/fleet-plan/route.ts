import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { fleetPlanAction, getFleetPlan, runFleetPlanAction } from "@/lib/manager/fleet-plan";

export const dynamic = "force-dynamic";

/**
 * Standing fleet plan (lib/manager/fleet-plan.ts).
 * GET → { buses, staff, routes }. POST { action: "ROUTE", busId, routeId } | { action: "CREW", busId, driverId, conductorId, applyToday }.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !isManageRole(session.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  return NextResponse.json({ success: true, ...(await getFleetPlan()) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !isManageRole(session.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const parsed = fleetPlanAction.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  const result = await runFleetPlanAction(parsed.data, { userId: session.userId, role: session.role });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, ...result, plan: await getFleetPlan() });
}
