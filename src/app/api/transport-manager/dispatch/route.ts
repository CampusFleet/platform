import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { dispatchAction, getDispatchBoard, runDispatchAction, DispatchError } from "@/lib/manager/dispatch";

export const dynamic = "force-dynamic";

const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/**
 * Transport manager dispatch (lib/manager/dispatch.ts).
 * GET ?date=YYYY-MM-DD → { runs, buses, drivers, conductors, routes, shifts }
 * POST { action: "UPDATE" | "ADD" | "CANCEL", ... } → runs the matching Postgres function.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !isManageRole(session.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const d = req.nextUrl.searchParams.get("date");
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : istToday();
  return NextResponse.json({ success: true, ...(await getDispatchBoard(date)) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !isManageRole(session.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const parsed = dispatchAction.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request." }, { status: 400 });
  try {
    const result = await runDispatchAction(parsed.data, { userId: session.userId, role: session.role });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof DispatchError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    return NextResponse.json({ success: false, error: "Could not save the change." }, { status: 500 });
  }
}
