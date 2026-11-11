import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { readEvidence } from "@/lib/gate/evidence";

export const dynamic = "force-dynamic";

const MANAGE = ["admin", "transport_admin", "transport_manager"];

/**
 * GET /api/biometrics/evidence/:incidentId — streams the incident's face crop to transport security staff.
 * Every view is recorded in biometric_access_log (who, when, which incident).
 */
export async function GET(req: NextRequest, { params }: { params: { incidentId: string } }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MANAGE.includes(session.role)) return new NextResponse(null, { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(params.incidentId)) return new NextResponse(null, { status: 400 });

  const { data: inc } = await supabaseAdmin
    .from("bus_security_incidents")
    .select("id, evidence_blob_key, matched_student_id, capture_id")
    .eq("id", params.incidentId)
    .maybeSingle();
  if (!inc?.evidence_blob_key) return new NextResponse(null, { status: 404 });

  await supabaseAdmin.from("biometric_access_log").insert({
    actor_user_id: session.userId,
    actor_role: session.role,
    action: "EVIDENCE_VIEWED",
    incident_id: inc.id,
    capture_id: inc.capture_id,
    subject_student_id: inc.matched_student_id,
    details: { ip: req.headers.get("x-forwarded-for")?.split(",")[0] || null },
  });

  const img = await readEvidence(inc.evidence_blob_key).catch(() => null);
  if (!img) return new NextResponse(null, { status: 410 }); // purged by retention
  return new NextResponse(new Uint8Array(img), {
    headers: { "content-type": "image/jpeg", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
