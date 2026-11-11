import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const STAFF = ["admin", "transport_admin", "transport_manager", "driver", "conductor"];

/**
 * GET /api/gate/occupancy?busId= — live automated passenger count (APC) from today's door decisions.
 * A rider is onboard when their latest door event today is BOARDED; ALIGHTED/ROAMING take them off.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !STAFF.includes(session.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const busId = Number(new URL(req.url).searchParams.get("busId"));
  if (!Number.isFinite(busId) || busId <= 0) return NextResponse.json({ error: "busId required" }, { status: 400 });

  const dayStart = new Date(`${new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)}T00:00:00+05:30`).toISOString();
  const { data, error } = await supabaseAdmin
    .from("gate_captures")
    .select("matched_student_id, outcome, captured_at")
    .eq("bus_id", busId)
    .eq("status", "DECIDED")
    .gte("captured_at", dayStart)
    .order("captured_at", { ascending: true })
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const latest = new Map<string, string>();
  let unregisteredIn = 0;
  let unregisteredOut = 0;
  for (const r of data || []) {
    if (r.matched_student_id && ["BOARDED", "WRONG_BUS", "ALIGHTED", "ROAMING"].includes(r.outcome)) latest.set(r.matched_student_id, r.outcome);
    if (r.outcome === "UNAUTHORIZED") unregisteredIn++;
    if (r.outcome === "UNKNOWN_DEBOARDER" || r.outcome === "INTRUDER_LEFT") unregisteredOut++;
  }
  const values = Array.from(latest.values());
  return NextResponse.json(
    {
      busId,
      onboard: values.filter((v) => v === "BOARDED" || v === "WRONG_BUS").length,
      roaming: values.filter((v) => v === "ROAMING").length,
      alighted: values.filter((v) => v === "ALIGHTED").length,
      unregisteredOnboard: Math.max(0, unregisteredIn - unregisteredOut),
      updatedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
