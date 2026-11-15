import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { getSessionFromRequest } from "@/lib/jwt";
import { db } from "@/lib/supabaseClient";
import { getOwnStudentId } from "@/lib/security/actor";
import { getRideInternal } from "@/lib/students/ride";

export const dynamic = "force-dynamic";

const Body = z.object({
  reason: z.enum(["EMERGENCY_PANIC", "MEDICAL", "HARASSMENT", "LOST", "OTHER"]),
  note: z.string().trim().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
const LABEL: Record<string, string> = {
  EMERGENCY_PANIC: "Emergency",
  MEDICAL: "Medical help needed",
  HARASSMENT: "Harassment / unsafe",
  LOST: "Lost / missed the bus",
  OTHER: "Other",
};

/**
 * POST /api/students/sos — a rider's emergency alert.
 * Writes a CRITICAL vehicle_issues row (on the student's bus today, if any) and notifies every
 * transport manager/admin and the trip's conductor. Before this route the SOS button only showed a
 * message in the student's own browser and alerted nobody.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  const { reason, note, latitude, longitude } = parsed.data;

  const studentId = await getOwnStudentId(session.userId);
  const ride = session.role === "student" ? await getRideInternal(session.userId).catch(() => null) : null;
  const where = latitude != null && longitude != null ? `https://maps.google.com/?q=${latitude},${longitude}` : "location not shared";
  const who = session.fullName || session.email || "A rider";
  const text = `${who}${ride?.busNumber ? ` (Bus ${ride.busNumber})` : ""}: ${LABEL[reason]}${note ? ` — ${note}` : ""}. ${where}`;

  const { error } = await db.from("vehicle_issues").insert({
    id: `iss_${crypto.randomUUID().replace(/-/g, "")}`,
    bus_id: ride?.busId ?? null,
    reported_by: session.userId,
    issue_type: "EMERGENCY",
    severity: "CRITICAL",
    description: `Rider SOS — ${text}`,
    status: "OPEN",
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    reported_at: new Date().toISOString(),
  } as any);
  if (error) {
    console.error("[sos] insert:", error.message);
    return NextResponse.json({ success: false, error: "The alert could not be sent. Call 112 now." }, { status: 500 });
  }

  waitUntil(
    (async () => {
      const { data: managers } = await db.from("users").select("id").in("role", ["admin", "transport_admin", "transport_manager"]);
      const ids = new Set((managers || []).map((m) => m.id));
      if (ride?.tripId) {
        const { data: trip } = await db.from("trips").select("conductor_id").eq("id", ride.tripId).maybeSingle();
        if (trip?.conductor_id) {
          const { data: st } = await db.from("staff").select("user_id").eq("id", trip.conductor_id).maybeSingle();
          if (st?.user_id) ids.add(st.user_id);
        }
      }
      if (ids.size) {
        await db.from("notifications").insert(
          Array.from(ids).map((user_id) => ({ user_id, title: "🚨 Rider SOS", message: text, type: "SOS", is_read: false }))
        );
      }
      await db.from("audit_logs").insert({ user_id: session.userId, user_role: session.role, action: "RIDER_SOS", entity: "Student", entity_id: studentId, reason: text });
    })().catch((e) => console.error("[sos] notify:", e?.message))
  );
  return NextResponse.json({ success: true });
}
