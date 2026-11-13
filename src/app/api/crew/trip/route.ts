import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { canActOnTrip } from "@/lib/crew/duty";

export const dynamic = "force-dynamic";

const Body = z.object({
  tripId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  action: z.enum(["START", "SET_STOP", "END"]),
  stopIndex: z.number().int().min(0).max(200).optional(),
});

/** POST /api/crew/trip — the assigned driver starts the trip, moves to a stop, or ends it. */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  const { tripId, action, stopIndex } = parsed.data;

  if (!(await canActOnTrip(session, tripId, "driver"))) {
    return NextResponse.json({ success: false, error: "This trip is not assigned to you." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const update =
    action === "START"
      ? { status: "IN_PROGRESS", started_at: now, current_stop_index: 0 }
      : action === "END"
      ? { status: "COMPLETED", completed_at: now }
      : { current_stop_index: stopIndex ?? 0 };

  let q = supabaseAdmin.from("trips").update(update).eq("id", tripId);
  if (action === "START") q = q.in("status", ["SCHEDULED", "DELAYED"]);
  if (action === "SET_STOP") q = q.eq("status", "IN_PROGRESS");
  const { data, error } = await q.select("id, status, current_stop_index, started_at, completed_at").maybeSingle();
  if (error) return NextResponse.json({ success: false, error: "Could not update the trip." }, { status: 500 });
  if (!data) return NextResponse.json({ success: false, error: "The trip is not in a state that allows this." }, { status: 409 });

  if (action !== "SET_STOP") {
    await supabaseAdmin.from("audit_logs").insert({
      user_id: session.userId,
      user_role: session.role,
      action: action === "START" ? "TRIP_STARTED" : "TRIP_COMPLETED",
      entity: "Trip",
      entity_id: tripId,
      new_value: data,
    });
  }
  return NextResponse.json({ success: true, trip: data });
}
