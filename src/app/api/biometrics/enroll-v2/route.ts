import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { createFaceTemplate, cosineDistance, toVectorLiteral, FaceServiceError } from "@/lib/face/client";
import { decodeImagePayload } from "@/lib/gate/evidence";
import { getMatchThreshold } from "@/lib/gate/processor";
import { CONSENT_PURPOSE, CONSENT_VERSION } from "@/lib/biometrics-consent";
import { verifyFaceChallenge, consumeFaceChallenge } from "@/lib/face/challenge";
import { checkEnrollmentPoses, checkTurnOrder, SERVER_POSE } from "@/lib/face/pose";
import { savePortrait } from "@/lib/students/portrait";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_FRAMES = 3;
// 6 = the multi-angle scan (straight, both sides, up, down, straight); 3–5 = older clients.
const MAX_FRAMES = 6;
const MIN_ACCEPTED = 2;

/**
 * POST /api/biometrics/enroll-v2
 * Body: { consentVersion, consentGiven: true, challenge, frames: [base64 JPEG ×3–5], portrait?: base64 JPEG, mode?: "add" }
 *
 * - mode "add": a second look (e.g. glasses on/off) is added next to the existing Face ID instead of
 *   replacing it (migration 20261123). Matching takes the closest template, so more looks help.
 *
 * - `challenge` is the one-time token from GET /api/biometrics/challenge (5 min, single use).
 * - Frames must include one looking straight and one with the head turned (face-service yaw ratio).
 *   Set FACE_ENROLL_POSE_CHECK=off to disable; FACE_ENROLL_TURN_MIN / FACE_ENROLL_FRONTAL_MAX tune it.
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
  const challenge = verifyFaceChallenge(body.challenge, session.userId);
  if (!challenge.valid) {
    return NextResponse.json({ success: false, code: "CHALLENGE_INVALID", message: "This scan expired. Please start again." }, { status: 400 });
  }

  const { data: student } = await supabaseAdmin.from("students").select("id, user_id").eq("user_id", session.userId).maybeSingle();
  if (!student) return NextResponse.json({ success: false, message: "Complete your student profile first." }, { status: 404 });
  if (!(await consumeFaceChallenge(challenge.nonce))) {
    return NextResponse.json({ success: false, code: "CHALLENGE_USED", message: "This scan was already submitted. Please start again." }, { status: 409 });
  }

  // 1. Template every frame server-side
  const results: { index: number; accepted: boolean; reasons: string[]; template?: number[]; quality?: number; pad?: number; model?: string; yaw?: number | null; yawSigned?: number | null; qualityPassed?: boolean }[] = [];
  try {
    for (let i = 0; i < frames.length; i++) {
      let buf: Buffer;
      try {
        buf = decodeImagePayload(frames[i]);
      } catch (e: any) {
        results.push({ index: i, accepted: false, reasons: [e.message] });
        continue;
      }
      // Random request id: the face service logs it, and it must not identify the student.
      const r = await createFaceTemplate(buf, { requestId: crypto.randomUUID() });
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
        yaw: r.faces_detected === 1 ? r.quality?.yaw_ratio ?? null : null,
        yawSigned: r.faces_detected === 1 ? r.quality?.yaw_signed ?? null : null,
        qualityPassed: Boolean(r.quality?.passed),
      });
    }
  } catch (err: any) {
    const retry = err instanceof FaceServiceError && err.retryable;
    return NextResponse.json({ success: false, message: retry ? "Face service is busy. Please try again in a minute." : "Face service is not available." }, { status: retry ? 503 : 500 });
  }

  const accepted = results.filter((r) => r.accepted && r.template);
  const report = results.map(({ index, accepted: a, reasons }) => ({ index, accepted: a, reasons }));
  // Spoof only counts on frames that passed quality, like the gate: a blurry or turned frame often
  // gets a low anti-spoof score from a real face, which must not fail an honest enrollment.
  if (results.some((r) => r.qualityPassed && r.reasons.includes("PRESENTATION_ATTACK_SUSPECTED"))) {
    await supabaseAdmin.from("biometric_access_log").insert({
      actor_user_id: session.userId, actor_role: session.role, action: "ENROLL_SPOOF_REJECTED", subject_student_id: student.id, details: { frames: report },
    });
    return NextResponse.json({ success: false, code: "SPOOF_SUSPECTED", message: "We could not confirm a live face. Use your own face in good light, not a photo or screen.", frames: report }, { status: 422 });
  }
  if (accepted.length < MIN_ACCEPTED) {
    return NextResponse.json({ success: false, code: "LOW_QUALITY", message: "The photos were not clear enough. Face the camera in good light and try again.", frames: report }, { status: 422 });
  }
  // Head movement: one frame looking straight and one turned. A still photo held to the camera has neither.
  if (process.env.FACE_ENROLL_POSE_CHECK !== "off") {
    const turnMin = Number(process.env.FACE_ENROLL_TURN_MIN) || SERVER_POSE.TURN_MIN;
    const multiAngle = frames.length >= 6;
    let pose = checkEnrollmentPoses(
      results.map((r) => r.yaw),
      { frontalMax: Number(process.env.FACE_ENROLL_FRONTAL_MAX) || SERVER_POSE.FRONTAL_MAX, turnMin },
      // Multi-angle scans turn both ways, so "any frame to the challenge side" proves nothing there;
      // the order of the two sides is checked instead.
      multiAngle ? undefined : { side: challenge.turn, signed: results.map((r) => r.yawSigned) }
    );
    if (pose.ok && multiAngle && !checkTurnOrder(results.map((r) => r.yawSigned), challenge.turn, turnMin)) {
      pose = { ok: false, code: "WRONG_TURN_DIRECTION" };
    }
    if (!pose.ok) {
      await supabaseAdmin.from("biometric_access_log").insert({
        actor_user_id: session.userId, actor_role: session.role, action: "ENROLL_POSE_REJECTED", subject_student_id: student.id,
        details: { code: pose.code, yaw: results.map((r) => r.yaw ?? null) },
      });
      const message =
        pose.code === "NO_TURNED_FRAME"
          ? "We did not see your head turn. Follow the prompt and turn your head slowly."
          : pose.code === "WRONG_TURN_DIRECTION"
            ? `Turn your head to your ${challenge.turn === "LEFT" ? "left" : "right"}, as the prompt says, and try again.`
            : "We did not get a clear straight-on photo. Look directly at the camera and try again.";
      return NextResponse.json({ success: false, code: pose.code, message, frames: report }, { status: 422 });
    }
  }

  // 2. Consistency: all accepted frames must be the same person
  const model = accepted[0].model!;
  let threshold: number;
  try {
    threshold = await getMatchThreshold(model);
  } catch (e) {
    console.error("[enroll-v2] match threshold:", (e as Error).message);
    return NextResponse.json({ success: false, message: "Face ID is not set up on the server yet (no match threshold). Ask the transport office." }, { status: 503 });
  }
  for (let a = 0; a < accepted.length; a++) {
    for (let b = a + 1; b < accepted.length; b++) {
      if (cosineDistance(accepted[a].template!, accepted[b].template!) > threshold) {
        return NextResponse.json({ success: false, code: "INCONSISTENT_FACES", message: "The photos do not appear to be the same person. Please retry alone in front of the camera.", frames: report }, { status: 422 });
      }
    }
  }

  // 3. Consent record + revoke old templates + store new, in one transaction (migration 20261120).
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || null;
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 200);
  const append = body.mode === "add";
  const { data: eData, error: eErr } = await supabaseAdmin.rpc("enroll_face_templates" as never, {
    p_student_id: student.id,
    p_user_id: session.userId,
    p_consent_version: CONSENT_VERSION,
    p_purpose: CONSENT_PURPOSE,
    p_client_ip: clientIp,
    p_user_agent: userAgent,
    p_model_version: model,
    p_templates: accepted.map((r) => ({ embedding: r.template, quality: r.quality ?? 0, pad: r.pad ?? 0 })),
    ...(append ? { p_append: true } : {}),
  } as never);
  const eRes = eData as unknown as { ok?: boolean; error?: string } | null;
  if (!eErr && eRes && eRes.ok === false) {
    return NextResponse.json({ success: false, message: eRes.error || "Could not save Face ID." }, { status: 409 });
  }
  if (eErr?.code === "PGRST202" && append) {
    return NextResponse.json({ success: false, message: "Adding a second look needs the 20261123 database update." }, { status: 503 });
  }
  if (eErr?.code === "PGRST202") {
    // Migration not applied yet: older step-by-step path.
    const saved = await saveStepByStep({ studentId: student.id, userId: session.userId, clientIp, userAgent, model, accepted });
    if (!saved.ok) return NextResponse.json({ success: false, message: saved.message }, { status: 500 });
  } else if (eErr) {
    console.error("[enroll-v2] save:", eErr.message);
    return NextResponse.json({ success: false, message: "Could not save Face ID. Nothing was changed; please try again." }, { status: 500 });
  }

  // 4. Portrait → private storage; users.photo_url points at the access-controlled route
  let photoUrl: string | null = null;
  if (typeof body.portrait === "string") {
    try {
      photoUrl = await savePortrait({ studentId: student.id, userId: session.userId, image: body.portrait });
    } catch (e) {
      console.warn("[enroll-v2] portrait not stored:", (e as Error).message);
    }
  }

  await supabaseAdmin.from("biometric_access_log").insert({
    actor_user_id: session.userId, actor_role: session.role, action: "ENROLLED", subject_student_id: student.id,
    details: { templates: accepted.length, model, consent_version: CONSENT_VERSION },
  });

  return NextResponse.json({ success: true, templates: accepted.length, modelVersion: model, consentVersion: CONSENT_VERSION, photoUrl, frames: report });
}

/** Pre-20261120 save path (three writes). Kept only until the migration is applied everywhere. */
async function saveStepByStep(a: {
  studentId: string;
  userId: string;
  clientIp: string | null;
  userAgent: string;
  model: string;
  accepted: { template?: number[]; quality?: number; pad?: number }[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: consent, error: cErr } = await supabaseAdmin
    .from("biometric_consents")
    .insert({ student_id: a.studentId, consent_version: CONSENT_VERSION, purpose: CONSENT_PURPOSE, granted_by_user_id: a.userId, client_ip: a.clientIp, user_agent: a.userAgent })
    .select("id")
    .single();
  if (cErr || !consent) return { ok: false, message: "Could not record consent." };
  const { error: rErr } = await supabaseAdmin
    .from("face_templates")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "RE_ENROLLED" })
    .eq("student_id", a.studentId)
    .is("revoked_at", null);
  if (rErr) return { ok: false, message: "Could not replace your old Face ID." };
  const { error: tErr } = await supabaseAdmin.from("face_templates").insert(
    a.accepted.map((r) => ({
      student_id: a.studentId,
      consent_id: consent.id,
      embedding: toVectorLiteral(r.template!),
      model_version: a.model,
      quality_score: Math.max(0, Math.min(1, r.quality ?? 0)),
      pad_score: Math.max(0, Math.min(1, r.pad ?? 0)),
      source: "ENROLLMENT",
    }))
  );
  if (tErr) return { ok: false, message: "Could not save face templates." };
  return { ok: true };
}
