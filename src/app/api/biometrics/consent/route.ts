import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { withdrawAndErase } from "@/lib/biometrics-lifecycle";
import { CONSENT_VERSION } from "@/lib/biometrics-consent";

export const dynamic = "force-dynamic";

async function ownStudent(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "student") return { session, student: null };
  const { data } = await supabaseAdmin.from("students").select("id").eq("user_id", session.userId).maybeSingle();
  return { session, student: data };
}

/** GET /api/biometrics/consent — the signed-in student's Face ID status. */
export async function GET(req: NextRequest) {
  const { session, student } = await ownStudent(req);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!student) return NextResponse.json({ error: "Students only." }, { status: 403 });
  const { data: consent } = await supabaseAdmin
    .from("biometric_consents")
    .select("consent_version, granted_at, withdrawn_at")
    .eq("student_id", student.id)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { count } = await supabaseAdmin.from("face_templates").select("id", { count: "exact", head: true }).eq("student_id", student.id).is("revoked_at", null);
  return NextResponse.json({
    enrolled: (count || 0) > 0 && Boolean(consent && !consent.withdrawn_at),
    templates: count || 0,
    consentVersion: consent?.consent_version || null,
    grantedAt: consent?.granted_at || null,
    withdrawnAt: consent?.withdrawn_at || null,
    currentConsentVersion: CONSENT_VERSION,
    needsReconsent: Boolean(consent && !consent.withdrawn_at && consent.consent_version !== CONSENT_VERSION),
  });
}

/** DELETE /api/biometrics/consent — withdraw consent and erase face data (templates + door crops). */
export async function DELETE(req: NextRequest) {
  const { session, student } = await ownStudent(req);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!student) return NextResponse.json({ error: "Students only." }, { status: 403 });
  const result = await withdrawAndErase(student.id, { userId: session.userId, role: session.role });
  return NextResponse.json({ success: true, ...result });
}
