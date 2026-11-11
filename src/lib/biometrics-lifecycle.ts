import { supabaseAdmin } from "@/lib/supabaseClient";
import { deleteEvidence } from "@/lib/gate/evidence";

/**
 * Biometric data lifecycle (DPDP Act 2023): withdrawal, erasure, retention.
 */
export const EVIDENCE_RETENTION_DAYS = 30;
export const INACTIVE_STUDENT_DAYS = 180; // no reservation or attendance → treated as left / graduated
export const INTRUDER_FACE_RETENTION_HOURS = 24; // stored only to match the person leaving

/** Withdraw consent and erase the student's face templates and door-camera crops. */
export async function withdrawAndErase(studentId: string, actor: { userId: string; role: string }, reason = "STUDENT_WITHDREW") {
  const now = new Date().toISOString();
  await supabaseAdmin.from("biometric_consents").update({ withdrawn_at: now, withdrawal_reason: reason }).eq("student_id", studentId).is("withdrawn_at", null);
  const { count: templates } = await supabaseAdmin.from("face_templates").delete({ count: "exact" }).eq("student_id", studentId);

  const { data: caps } = await supabaseAdmin
    .from("gate_captures")
    .select("id, evidence_blob_key")
    .eq("matched_student_id", studentId)
    .is("evidence_purged_at", null);
  const keys = (caps || []).map((c) => c.evidence_blob_key);
  for (let i = 0; i < keys.length; i += 100) await deleteEvidence(keys.slice(i, i + 100));
  if (caps?.length) {
    await supabaseAdmin.from("gate_captures").update({ evidence_purged_at: now }).in("id", caps.map((c) => c.id));
    await supabaseAdmin.from("bus_security_incidents").update({ evidence_blob_key: null, face_embedding: null }).in("capture_id", caps.map((c) => c.id));
  }
  // Legacy v1 profile (non-commercial model) is removed too.
  await supabaseAdmin.from("student_face_profiles").delete().eq("student_id", studentId);

  await supabaseAdmin.from("biometric_access_log").insert({
    actor_user_id: actor.userId,
    actor_role: actor.role,
    action: "CONSENT_WITHDRAWN_DATA_ERASED",
    subject_student_id: studentId,
    details: { templates: templates || 0, evidence: keys.length, reason },
  });
  return { templatesDeleted: templates || 0, evidenceDeleted: keys.length };
}

/** Daily retention job. */
export async function runBiometricRetention(now = new Date()) {
  const summary = { evidencePurged: 0, intruderFacesCleared: 0, studentsErased: 0, revokedTemplatesDeleted: 0 };

  // 1. Door-camera crops older than the retention window
  const cutoff = new Date(now.getTime() - EVIDENCE_RETENTION_DAYS * 86400_000).toISOString();
  for (let round = 0; round < 20; round++) {
    const { data: old } = await supabaseAdmin
      .from("gate_captures")
      .select("id, evidence_blob_key")
      .lt("captured_at", cutoff)
      .is("evidence_purged_at", null)
      .limit(200);
    if (!old?.length) break;
    await deleteEvidence(old.map((c) => c.evidence_blob_key));
    const ids = old.map((c) => c.id);
    await supabaseAdmin.from("gate_captures").update({ evidence_purged_at: now.toISOString() }).in("id", ids);
    await supabaseAdmin.from("bus_security_incidents").update({ evidence_blob_key: null }).in("capture_id", ids);
    summary.evidencePurged += old.length;
  }

  // 2. Unknown-person face templates kept only for exit matching
  const faceCutoff = new Date(now.getTime() - INTRUDER_FACE_RETENTION_HOURS * 3600_000).toISOString();
  const { count: cleared } = await supabaseAdmin
    .from("bus_security_incidents")
    .update({ face_embedding: null }, { count: "exact" })
    .not("face_embedding", "is", null)
    .lt("created_at", faceCutoff);
  summary.intruderFacesCleared = cleared || 0;

  // 3. Templates of students who left / graduated (no transport activity for INACTIVE_STUDENT_DAYS)
  const inactiveCutoff = new Date(now.getTime() - INACTIVE_STUDENT_DAYS * 86400_000).toISOString().slice(0, 10);
  const { data: enrolled } = await supabaseAdmin.from("face_templates").select("student_id, created_at").is("revoked_at", null);
  const candidates = Array.from(new Set((enrolled || []).filter((t) => t.created_at.slice(0, 10) < inactiveCutoff).map((t) => t.student_id)));
  for (const sid of candidates) {
    const { count: recent } = await supabaseAdmin
      .from("bus_reservations")
      .select("id", { count: "exact", head: true })
      .eq("student_id", sid)
      .gte("reservation_date", inactiveCutoff);
    if ((recent || 0) === 0) {
      await withdrawAndErase(sid, { userId: "", role: "system_retention" }, "INACTIVE_LEFT_OR_GRADUATED");
      summary.studentsErased++;
    }
  }

  // 4. Hard-delete templates revoked (re-enrollment) more than the retention window ago
  const { count: purgedRevoked } = await supabaseAdmin.from("face_templates").delete({ count: "exact" }).lt("revoked_at", cutoff);
  summary.revokedTemplatesDeleted = purgedRevoked || 0;

  return summary;
}
