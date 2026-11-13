import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getOwnStudentId } from "@/lib/security/actor";

export const dynamic = "force-dynamic";

/**
 * Outgoing-seat confirmation after a morning absence (boarding chart, migration 20261113d).
 * GET  → { pending: null | { busNumber, shiftName, departureTime, confirmBy } }
 * POST { confirm: boolean } → keeps or releases today's outgoing seat (respond_outgoing_seat RPC).
 * Never returns trip ids or trip codes (AGENTS.md transit rule).
 */
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : null);
const minus = (t: string, mins: number) => {
  const [h, m] = t.split(":").map(Number);
  const total = (((h * 60 + m - mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const studentId = await getOwnStudentId(session.userId);
  if (!studentId) return NextResponse.json({ success: true, pending: null });

  const { data } = await supabaseAdmin
    .from("bus_reservations")
    .select("id, bus:buses(bus_number), shift:shifts(name, start_time, booking_cutoff_minutes), trip:trips(manifest_locked)")
    .eq("student_id", studentId)
    .eq("reservation_date", todayIst())
    .eq("needs_confirmation", true)
    .is("rider_confirmed_at", null)
    .in("status", ["ASSIGNED", "SEAT_SELECTED"])
    .limit(1)
    .maybeSingle();

  const row: any = data;
  if (!row || row.trip?.manifest_locked) return NextResponse.json({ success: true, pending: null });

  const departure = hhmm(row.shift?.start_time);
  return NextResponse.json({
    success: true,
    pending: {
      busNumber: row.bus?.bus_number ?? null,
      shiftName: row.shift?.name ?? null,
      departureTime: departure,
      confirmBy: departure ? minus(departure, Number(row.shift?.booking_cutoff_minutes ?? 30)) : null,
    },
  });
}

const Body = z.object({ confirm: z.boolean() });

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });

  const studentId = await getOwnStudentId(session.userId);
  if (!studentId) return NextResponse.json({ success: false, error: "No student profile." }, { status: 404 });

  const { data, error } = await supabaseAdmin.rpc("respond_outgoing_seat", { p_student_id: studentId, p_confirm: parsed.data.confirm });
  if (error) return NextResponse.json({ success: false, error: "Could not update your seat. Try again." }, { status: 500 });
  const res = data as { ok: boolean; code?: string };
  if (!res.ok) {
    const message = res.code === "CHART_FINAL" ? "The boarding chart is already final." : "There is nothing to confirm.";
    return NextResponse.json({ success: false, code: res.code, error: message }, { status: 409 });
  }
  return NextResponse.json({ success: true, confirmed: parsed.data.confirm });
}
