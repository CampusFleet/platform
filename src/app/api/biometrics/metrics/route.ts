import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { computeFaceMetrics, goNoGo } from "@/lib/biometrics-metrics";

export const dynamic = "force-dynamic";

/** GET /api/biometrics/metrics?days=14&busIds=1,2 — pilot dashboard data + go/no-go evaluation. */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !["admin", "transport_admin", "transport_manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.get("days")) || 14));
  const busIds = (sp.get("busIds") || "").split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const metrics = await computeFaceMetrics(days, busIds.length ? busIds : null);
  return NextResponse.json({ metrics, evaluation: goNoGo(metrics) }, { headers: { "cache-control": "no-store" } });
}
