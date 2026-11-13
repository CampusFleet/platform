import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { canActOnTrip } from "@/lib/crew/duty";

export const dynamic = "force-dynamic";

const TYPES = {
  BREAKDOWN: { issue_type: "BREAKDOWN", severity: "HIGH", label: "Bus breakdown" },
  TRAFFIC: { issue_type: "DELAY", severity: "MEDIUM", label: "Traffic / route blocked" },
  MEDICAL: { issue_type: "EMERGENCY", severity: "CRITICAL", label: "Medical emergency / accident" },
} as const;

const Body = z.object({
  tripId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  type: z.enum(["BREAKDOWN", "TRAFFIC", "MEDICAL"]),
  note: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/** POST /api/crew/sos — driver or conductor reports an incident on their trip to the transport office. */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  const { tripId, type, note, latitude, longitude } = parsed.data;

  const allowed = (await canActOnTrip(session, tripId, "driver")) || (await canActOnTrip(session, tripId, "conductor"));
  if (!allowed) return NextResponse.json({ success: false, error: "This trip is not assigned to you." }, { status: 403 });

  const { data: trip } = await supabaseAdmin.from("trips").select("bus_id").eq("id", tripId).maybeSingle();
  const kind = TYPES[type];
  const { error } = await supabaseAdmin.from("vehicle_issues").insert({
    id: `iss_${crypto.randomUUID().replace(/-/g, "")}`,
    bus_id: trip?.bus_id ?? null,
    reported_by: session.userId,
    issue_type: kind.issue_type,
    severity: kind.severity,
    description: [kind.label, note].filter(Boolean).join(" — "),
    status: "OPEN",
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    reported_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ success: false, error: "Could not send the report." }, { status: 500 });
  return NextResponse.json({ success: true });
}
