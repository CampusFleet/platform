import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { createFaceTemplate, cosineDistance, toVectorLiteral, FaceServiceError } from "@/lib/face/client";
import { decodeImagePayload, storeEvidence } from "@/lib/gate/evidence";
import { getMatchThreshold } from "@/lib/gate/processor";
import { CONSENT_PURPOSE, CONSENT_VERSION } from "@/lib/biometrics-consent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_FRAMES = 3;
const MAX_FRAMES = 5;
const MIN_ACCEPTED = 2;

/**
 * POST /api/biometrics/enroll-v2
 * Body: { consentVersion, consentGiven: true, frames: [base64 JPEG ×3–5], portrait?: base64 JPEG }
 *
 * - Student identity comes from the session only (no studentId in the body).
 * - Every frame is templated by the face service; frames failing quality or anti-spoofing are rejected
 *   with a reason. No client-supplied quality/liveness scores are accepted.
 * - Accepted templates must agree with each other (same person) before anything is stored.
 * - Previous v2 templates are revoked; the portrait goes to private storage.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, message: "Only students can enroll Face ID." }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ success: false, message: "Invalid body." }, { status: 400 });
  if ("studentId" in body) {
    return NextResponse.json({ success: false, message: "studentId is not accepted; enrollment applies to the signed-in student." }, { status: 400 });
  }
  if (body.consentGiven !== true || body.consentVersion !== CONSENT_VERSION) {
    return NextResponse.json({ success: false, code: "CONSENT_REQUIRED", message: "Please read and accept the current biometric consent notice." }, { status: 400 });
  }
  const frames: unknown[] = Array.isArray(body.frames) ? body.frames : [];
  if (frames.length < MIN_FRAMES || frames.length > MAX_FRAMES) {
    return NextResponse.json({ success: false, message: `Send ${MIN_FRAMES}–${MAX_FRAMES} frames.` }, { status: 400 });
  }

  const { data: student } = await supabaseAdmin.from("students").select("id, user_id").eq("user_id", session.userId).maybeSingle();
  if (!student) return NextResponse.json({ success: false, message: "Complete your student profile first." }, { status: 404 });

  // 1. Template every frame server-side
  const results: { index: number; accepted: boolean; reasons: string[]; template?: number[]; quality?: number; pad?: number; model?: string }[] = [];
  try {
    for (let i = 0; i < frames.length; i++) {
      let buf: Buffer;
      try {
        buf = decodeImagePayload(frames[i]);
      } catch (e: any) {
        results.push({ index: i, accepted: false, reasons: [e.message] });
        continue;
      }
      const r = await createFaceTemplate(buf, { requestId: `enroll-${student.id}-${i}` });
      if (r.faces_detected > 1) {
        results.push({ index: i, accepted: false, reasons: ["MULTIPLE_FACES"] });
        continue;
      }
      results.push({
        index: i,
        accepted: r.accepted,
        reasons: r.rejection_reasons,
        template: r.template || undefined,
        quality: r.quality?.score,
        pad: r.pad?.real_score,
        model: r.model_version,
      });
    }
  } catch (err: any) {
    const retry = err instanceof FaceServiceError && err.retryable;
    return NextResponse.json({ success: false, message: retry ? "Face service is busy. Please try again in a minute." : "Face service is not available." }, { status: retry ? 503 : 500 });
  }

  const accepted = results.filter((r) => r.accepted && r.template);
  const report = results.map(({ index, accepted: a, reasons }) => ({ index, accepted: a, reasons }));
  if (results.some((r) => r.reasons.includes("PRESENTATION_ATTACK_SUSPECTED"))) {
    await supabaseAdmin.from("biometric_access_log").insert({
      actor_user_id: session.userId, actor_role: session.role, action: "ENROLL_SPOOF_REJECTED", subject_student_id: student.id, details: { frames: report },
    });
    return NextResponse.json({ success: false, code: "SPOOF_SUSPECTED", message: "We could not confirm a live face. Use your own face in good light, not a photo or screen.", frames: report }, { status: 422 });
  }
  if (accepted.length < MIN_ACCEPTED) {
    return NextResponse.json({ success: false, code: "LOW_QUALITY", message: "The photos were not clear enough. Face the camera in good light and try again.", frames: report }, { status: 422 });
  }

  // 2. Consistency: all accepted frames must be the same person
  const model = accepted[0].model!;
  const threshold = await getMatchThreshold(model);
  for (let a = 0; a < accepted.length; a++) {
    for (let b = a + 1; b < accepted.length; b++) {
      if (cosineDistance(accepted[a].template!, accepted[b].template!) > threshold) {
        return NextResponse.json({ success: false, code: "INCONSISTENT_FACES", message: "The photos do not appear to be the same person. Please retry alone in front of the camera.", frames: report }, { status: 422 });
      }
    }
  }

  // 3. Consent record (versioned) → revoke old templates → store new
  const { data: consent, error: cErr } = await supabaseAdmin
    .from("biometric_consents")
    .insert({
      student_id: student.id,
      consent_version: CONSENT_VERSION,
      purpose: CONSENT_PURPOSE,
      granted_by_user_id: session.userId,
      client_ip: req.headers.get("x-forwarded-for")?.split(",")[0] || null,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 200),
    })
    .select("id")
    .single();
  if (cErr || !consent) return NextResponse.json({ success: false, message: "Could not record consent." }, { status: 500 });

  await supabaseAdmin
    .from("face_templates")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "RE_ENROLLED" })
    .eq("student_id", student.id)
    .is("revoked_at", null);

  const { error: tErr } = await supabaseAdmin.from("face_templates").insert(
    accepted.map((r) => ({
      student_id: student.id,
      consent_id: consent.id,
      embedding: toVectorLiteral(r.template!),
      model_version: model,
      quality_score: Math.max(0, Math.min(1, r.quality ?? 0)),
      pad_score: Math.max(0, Math.min(1, r.pad ?? 0)),
      source: "ENROLLMENT",
    }))
  );
  if (tErr) return NextResponse.json({ success: false, message: "Could not save face templates." }, { status: 500 });

  // 4. Portrait → private storage; users.photo_url points at the access-controlled route
  if (typeof body.portrait === "string") {
    try {
      const portrait = decodeImagePayload(body.portrait);
      const key = await storeEvidence(`portraits/${student.id}.jpg`, portrait);
      await supabaseAdmin.from("users").update({ photo_url: `/api/biometrics/portrait/${student.id}?k=${encodeURIComponent(key)}`, photo_locked: true }).eq("id", session.userId);
      await supabaseAdmin.from("students").update({ photo_locked: true }).eq("id", student.id);
    } catch (e) {
      console.warn("[enroll-v2] portrait not stored:", (e as Error).message);
    }
  }

  await supabaseAdmin.from("biometric_access_log").insert({
    actor_user_id: session.userId, actor_role: session.role, action: "ENROLLED", subject_student_id: student.id,
    details: { templates: accepted.length, model, consent_version: CONSENT_VERSION },
  });

  return NextResponse.json({ success: true, templates: accepted.length, modelVersion: model, consentVersion: CONSENT_VERSION, frames: report });
}
