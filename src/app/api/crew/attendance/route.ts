import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { canActOnTrip } from "@/lib/crew/duty";

export const dynamic = "force-dynamic";

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const Body = z.object({
  tripId: Id,
  studentId: Id,
  status: z.enum(["BOARDED", "ABSENT"]),
  seat: z.string().regex(/^[0-9]{1,2}[A-Z]$/).optional(),
  method: z.enum(["MANUAL_SELECT", "SEAT_MAP_SELECT"]).default("MANUAL_SELECT"),
});

/** POST /api/crew/attendance — the assigned conductor marks a rider (student or teacher) boarded, optionally to a seat, or absent. */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  const { tripId, studentId, status, seat, method } = parsed.data;

  if (!(await canActOnTrip(session, tripId, "conductor"))) {
    return NextResponse.json({ success: false, error: "This trip is not assigned to you." }, { status: 403 });
  }

  // Teacher on this trip? (teacher_reservations, migration 20261114.) One row, so no RPC needed.
  const { data: teacherRow } = await (supabaseAdmin as any)
    .from("teacher_reservations")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", studentId)
    .neq("status", "CANCELLED")
    .maybeSingle();
  if (teacherRow) {
    const patch: Record<string, unknown> = { status, boarded_at: status === "BOARDED" ? new Date().toISOString() : null };
    if (seat && status === "BOARDED") patch.chosen_seat = seat;
    const { error: tErr } = await (supabaseAdmin as any).from("teacher_reservations").update(patch).eq("id", teacherRow.id);
    if (tErr) {
      const taken = tErr.code === "23505";
      return NextResponse.json({ success: false, error: taken ? "That seat is already taken." : "Could not save." }, { status: taken ? 409 : 500 });
    }
    return NextResponse.json({ success: true });
  }
  const { data, error } = await supabaseAdmin.rpc("crew_mark_attendance", {
    p_trip_id: tripId,
    p_student_id: studentId,
    p_status: status,
    p_method: method,
    p_verified_by: session.fullName || session.email,
    p_seat: seat ?? null,
  });
  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json(
      { success: false, error: taken ? "That seat is already taken." : "Could not save attendance." },
      { status: taken ? 409 : 500 }
    );
  }
  const res = data as { ok: boolean; code?: string };
  if (!res.ok) return NextResponse.json({ success: false, error: "Trip not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
