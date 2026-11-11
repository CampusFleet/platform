import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { processPending } from "@/lib/gate/processor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED = ["driver", "conductor", "admin", "transport_admin", "transport_manager"];

/**
 * GET /api/gate/captures/:id — decision for one capture (crew phone shows the result).
 * Crew may only read captures for the bus they are crewing today. Processes on demand if still pending.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(req);
  if (!session || !ALLOWED.includes(session.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const load = () =>
    supabaseAdmin
      .from("gate_captures")
      .select("id, bus_id, door, status, outcome, matched_student_id, match_distance, decision, captured_at")
      .eq("id", params.id)
      .maybeSingle();
  let { data: cap } = await load();
  if (!cap) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (["driver", "conductor"].includes(session.role)) {
    const { data: staff } = await supabaseAdmin.from("staff").select("id").eq("user_id", session.userId).maybeSingle();
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const { data: trip } = staff
      ? await supabaseAdmin.from("trips").select("id").eq("bus_id", cap.bus_id).eq("trip_date", today).or(`driver_id.eq.${staff.id},conductor_id.eq.${staff.id}`).limit(1).maybeSingle()
      : { data: null };
    if (!trip) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (cap.status === "PENDING" || cap.status === "FAILED") {
    await processPending({ captureId: cap.id, limit: 1 }).catch(() => undefined);
    cap = (await load()).data || cap;
  }

  let student: { name: string; studentIdCode: string | null } | null = null;
  if (cap.matched_student_id) {
    const { data: s } = await supabaseAdmin.from("students").select("full_name, student_id_code").eq("id", cap.matched_student_id).maybeSingle();
    if (s) student = { name: s.full_name, studentIdCode: s.student_id_code };
  }
  return NextResponse.json(
    {
      id: cap.id,
      status: cap.status,
      door: cap.door,
      outcome: cap.outcome,
      student,
      confidence: cap.match_distance !== null ? Math.round((1 - Number(cap.match_distance)) * 1000) / 10 : null,
      reasons: (cap.decision as any)?.reasons || [],
    },
    { headers: { "cache-control": "no-store" } }
  );
}
