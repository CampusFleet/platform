import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { processPending } from "@/lib/gate/processor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/gate/process — on-demand sweep of pending captures (transport ops). Body: { busId? } */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !["admin", "transport_admin", "transport_manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const results = await processPending({ busId: Number(body.busId) || undefined, limit: 100 });
  return NextResponse.json({ processed: results.length, results });
}
