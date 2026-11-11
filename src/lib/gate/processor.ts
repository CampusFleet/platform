import { supabaseAdmin } from "@/lib/supabaseClient";
import { createFaceTemplate, FaceServiceError, toVectorLiteral, cosineDistance } from "@/lib/face/client";
import { readEvidence } from "@/lib/gate/evidence";
import { decide, stopAtPosition, type Decision, type StopGeo } from "@/lib/gate/decision";
import { publishOpsEvent } from "@/lib/gate/ops-events";

/**
 * Processes queued gate captures (hybrid Face ID):
 *   claim → load crop → face service template (+quality, PAD) → match (bus roster first, then campus)
 *   → door rules (decision.ts) → apply side effects (attendance, reservation, incidents, notifications).
 * Captures for a bus are processed in capture-time order, so late offline uploads replay correctly.
 * Face service outages leave captures FAILED with backoff — attendance is never guessed.
 */
const LOCK_SECONDS = 90;
const MAX_ATTEMPTS = 8;
const INTRUDER_MATCH_WINDOW_H = 12;

type CaptureRow = {
  id: string;
  device_id: string;
  bus_id: number;
  trip_id: string | null;
  door: "IN" | "OUT";
  captured_at: string;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy_m: number | null;
  evidence_blob_key: string;
  attempts: number;
};

const thresholdCache = new Map<string, { value: number; at: number }>();
export async function getMatchThreshold(modelVersion: string): Promise<number> {
  const hit = thresholdCache.get(modelVersion);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const { data } = await supabaseAdmin.from("face_match_config").select("threshold").eq("model_version", modelVersion).maybeSingle();
  if (!data?.threshold) throw new FaceServiceError(`No match threshold configured for model ${modelVersion}`, false);
  thresholdCache.set(modelVersion, { value: Number(data.threshold), at: Date.now() });
  return Number(data.threshold);
}

function istDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === "string" && v.startsWith("[")) return v.slice(1, -1).split(",").map(Number);
  return null;
}

/** Claim up to `limit` captures (oldest capture first). */
async function claimCaptures(opts: { busId?: number; captureId?: string; limit: number }): Promise<CaptureRow[]> {
  const nowIso = new Date().toISOString();
  let q = supabaseAdmin
    .from("gate_captures")
    .select("id")
    .in("status", ["PENDING", "FAILED", "PROCESSING"])
    .lt("attempts", MAX_ATTEMPTS)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .order("captured_at", { ascending: true })
    .limit(opts.limit);
  if (opts.busId) q = q.eq("bus_id", opts.busId);
  if (opts.captureId) q = q.eq("id", opts.captureId);
  const { data: candidates } = await q;
  const claimed: CaptureRow[] = [];
  for (const c of candidates || []) {
    // Optimistic claim: only succeeds if nobody locked it in between
    const { data } = await supabaseAdmin
      .from("gate_captures")
      .update({ status: "PROCESSING", locked_until: new Date(Date.now() + LOCK_SECONDS * 1000).toISOString() })
      .eq("id", c.id)
      .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
      .select("id, device_id, bus_id, trip_id, door, captured_at, latitude, longitude, gps_accuracy_m, evidence_blob_key, attempts")
      .maybeSingle();
    if (data) claimed.push(data as CaptureRow);
  }
  return claimed;
}

async function resolveTrip(c: CaptureRow) {
  const cols = "id, route_id, shift_id, status, started_at, completed_at, conductor_id, driver_id, trip_date";
  if (c.trip_id) {
    const { data } = await supabaseAdmin.from("trips").select(cols).eq("id", c.trip_id).maybeSingle();
    if (data) return data;
  }
  const date = istDate(c.captured_at);
  const { data } = await supabaseAdmin
    .from("trips")
    .select(cols)
    .eq("bus_id", c.bus_id)
    .eq("trip_date", date)
    .neq("status", "CANCELLED")
    .order("started_at", { ascending: true, nullsFirst: false });
  const trips = data || [];
  const at = new Date(c.captured_at).getTime();
  // Trip whose run window contains the capture; else the next one to start; else the latest.
  return (
    trips.find((t) => t.started_at && new Date(t.started_at).getTime() - 30 * 60_000 <= at && (!t.completed_at || new Date(t.completed_at).getTime() >= at)) ||
    trips.find((t) => !t.started_at || new Date(t.started_at).getTime() > at) ||
    trips[trips.length - 1] ||
    null
  );
}

async function notify(userIds: (string | null | undefined)[], title: string, message: string, type: string) {
  const rows = Array.from(new Set(userIds.filter(Boolean) as string[])).map((user_id) => ({ user_id, title, message, type, is_read: false }));
  if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
}

export interface ProcessResult {
  id: string;
  status: "DECIDED" | "REJECTED" | "FAILED";
  outcome?: string;
  error?: string;
}

export async function processCapture(c: CaptureRow): Promise<ProcessResult> {
  const fail = async (error: string, retryable: boolean): Promise<ProcessResult> => {
    const backoffS = Math.min(3600, 30 * 2 ** c.attempts);
    await supabaseAdmin
      .from("gate_captures")
      .update({
        status: "FAILED",
        error,
        attempts: c.attempts + 1,
        locked_until: retryable ? new Date(Date.now() + backoffS * 1000).toISOString() : null,
        ...(retryable ? {} : { status: "REJECTED", processed_at: new Date().toISOString() }),
      })
      .eq("id", c.id);
    return { id: c.id, status: retryable ? "FAILED" : "REJECTED", error };
  };

  // 1. Image → template (server-side, never trusts the device)
  const image = await readEvidence(c.evidence_blob_key).catch(() => null);
  if (!image) return fail("Evidence image missing", false);
  let tpl;
  try {
    tpl = await createFaceTemplate(image, { requestId: c.id });
  } catch (err: any) {
    return fail(err?.message || "Face service error", err instanceof FaceServiceError ? err.retryable : true);
  }

  const { data: bus } = await supabaseAdmin.from("buses").select("id, bus_number").eq("id", c.bus_id).maybeSingle();
  const busLabel = bus ? `Bus ${bus.bus_number}` : `Bus ${c.bus_id}`;
  const trip = await resolveTrip(c);

  // 2. Rejected crops: no face / poor quality / presentation attack
  if (!tpl.accepted || !tpl.template) {
    const spoof = tpl.rejection_reasons.includes("PRESENTATION_ATTACK_SUSPECTED") && tpl.quality?.passed;
    if (spoof && c.door === "IN") {
      const { data: inc } = await supabaseAdmin
        .from("bus_security_incidents")
        .insert({
          bus_id: c.bus_id,
          trip_id: trip?.id || null,
          incident_type: "LIVENESS_SPOOF_ATTEMPT",
          severity: "HIGH",
          latitude: c.latitude ?? 0,
          longitude: c.longitude ?? 0,
          capture_id: c.id,
          evidence_blob_key: c.evidence_blob_key,
          status: "ACTIVE",
          metadata: { pad: tpl.pad, model_version: tpl.model_version, door: c.door },
        })
        .select("id")
        .single();
      if (inc) await publishOpsEvent({ type: "INCIDENT", busId: c.bus_id, incidentId: inc.id, incidentType: "LIVENESS_SPOOF_ATTEMPT" });
    }
    await supabaseAdmin
      .from("gate_captures")
      .update({
        status: "REJECTED",
        trip_id: trip?.id || c.trip_id,
        model_version: tpl.model_version,
        quality: tpl.quality,
        pad: tpl.pad,
        outcome: spoof ? "SPOOF_REJECTED" : "LOW_QUALITY",
        decision: { reasons: tpl.rejection_reasons },
        processed_at: new Date().toISOString(),
        attempts: c.attempts + 1,
        locked_until: null,
        error: null,
      })
      .eq("id", c.id);
    return { id: c.id, status: "REJECTED", outcome: spoof ? "SPOOF_REJECTED" : "LOW_QUALITY" };
  }

  const threshold = await getMatchThreshold(tpl.model_version);
  const vec = toVectorLiteral(tpl.template);
  const date = istDate(c.captured_at);

  // 3. Bus roster for that day, then campus-wide fallback
  const { data: roster } = await supabaseAdmin
    .from("bus_reservations")
    .select("id, student_id, status, trip_id")
    .eq("bus_id", c.bus_id)
    .eq("reservation_date", date)
    .not("status", "in", "(CANCELLED,ABSENT,SWITCHED)");
  const rosterIds = (roster || []).map((r) => r.student_id);

  let matched: { student_id: string; distance: number } | null = null;
  let scope: "BUS_ROSTER" | "CAMPUS" | null = null;
  if (rosterIds.length > 0) {
    const { data, error } = await supabaseAdmin.rpc("match_face_v2", {
      p_embedding: vec, p_model_version: tpl.model_version, p_threshold: threshold, p_candidates: rosterIds, p_limit: 2,
    });
    if (error) return fail(`match: ${error.message}`, true);
    if (data?.[0]) { matched = data[0]; scope = "BUS_ROSTER"; }
  }
  if (!matched) {
    const { data, error } = await supabaseAdmin.rpc("match_face_v2", {
      p_embedding: vec, p_model_version: tpl.model_version, p_threshold: threshold, p_candidates: null, p_limit: 2,
    });
    if (error) return fail(`match: ${error.message}`, true);
    if (data?.[0]) { matched = data[0]; scope = "CAMPUS"; }
  }

  const reservation = matched ? (roster || []).find((r) => r.student_id === matched!.student_id) || null : null;

  // 4. Context for the door rules
  const { data: routeStops } = trip?.route_id
    ? await supabaseAdmin.from("route_stops").select("stop_order, stops(id, latitude, longitude, geofence_radius)").eq("route_id", trip.route_id).order("stop_order")
    : { data: [] as any[] };
  const stops: StopGeo[] = (routeStops || []).map((rs: any) => rs.stops).filter(Boolean);
  const stopId = stopAtPosition(stops, c.latitude, c.longitude, c.gps_accuracy_m || 0);
  const firstStopId = stops[0]?.id || null;
  const capturedMs = new Date(c.captured_at).getTime();
  const departed = Boolean(trip?.started_at && new Date(trip.started_at).getTime() <= capturedMs);
  const atStartStop = Boolean(trip) && ((!departed && trip!.status !== "COMPLETED") || (firstStopId !== null && stopId === firstStopId));

  let secondsSince: number | null = null;
  if (matched) {
    const { data: prev } = await supabaseAdmin
      .from("gate_captures")
      .select("captured_at")
      .eq("bus_id", c.bus_id)
      .eq("door", c.door)
      .eq("matched_student_id", matched.student_id)
      .eq("status", "DECIDED")
      .neq("id", c.id)
      .lte("captured_at", c.captured_at)
      .gte("captured_at", new Date(capturedMs - 10 * 60_000).toISOString())
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev) secondsSince = (capturedMs - new Date(prev.captured_at).getTime()) / 1000;
  }

  let matchingOpenIncidentId: string | null = null;
  if (!matched && c.door === "OUT") {
    const { data: open } = await supabaseAdmin
      .from("bus_security_incidents")
      .select("id, face_embedding")
      .eq("bus_id", c.bus_id)
      .eq("incident_type", "UNAUTHORIZED_INTRUDER")
      .neq("status", "RESOLVED")
      .not("face_embedding", "is", null)
      .gte("created_at", new Date(capturedMs - INTRUDER_MATCH_WINDOW_H * 3600_000).toISOString());
    let best: { id: string; d: number } | null = null;
    for (const inc of open || []) {
      const e = parseVector(inc.face_embedding);
      if (!e) continue;
      const d = cosineDistance(tpl.template, e);
      if (d <= threshold && (!best || d < best.d)) best = { id: inc.id, d };
    }
    matchingOpenIncidentId = best?.id || null;
  }

  const decision: Decision = decide({
    door: c.door,
    matchedStudentId: matched?.student_id || null,
    reservedOnThisBus: Boolean(reservation),
    atStartStop,
    stopIdAtPosition: stopId,
    matchingOpenIncidentId,
    secondsSinceSameStudentSameDoor: secondsSince,
  });

  // 5. Side effects
  await applyDecision({ c, decision, matched, reservation, trip, stopId, busLabel, template: tpl.template });

  await supabaseAdmin
    .from("gate_captures")
    .update({
      status: "DECIDED",
      trip_id: trip?.id || c.trip_id,
      model_version: tpl.model_version,
      quality: tpl.quality,
      pad: tpl.pad,
      matched_student_id: matched?.student_id || null,
      match_distance: matched?.distance ?? null,
      match_scope: scope,
      outcome: decision.outcome,
      decision: { ...decision, stopId, atStartStop, threshold },
      processed_at: new Date().toISOString(),
      attempts: c.attempts + 1,
      locked_until: null,
      error: null,
    })
    .eq("id", c.id);

  await publishOpsEvent({ type: "GATE", busId: c.bus_id, door: c.door, outcome: decision.outcome, captureId: c.id });
  return { id: c.id, status: "DECIDED", outcome: decision.outcome };
}

async function applyDecision(args: {
  c: CaptureRow;
  decision: Decision;
  matched: { student_id: string; distance: number } | null;
  reservation: { id: string; student_id: string; status: string; trip_id: string | null } | null;
  trip: any;
  stopId: string | null;
  busLabel: string;
  template: number[];
}) {
  const { c, decision, matched, reservation, trip, stopId, busLabel } = args;
  if (decision.outcome === "DUPLICATE") return;

  const at = c.captured_at;
  const studentId = matched?.student_id || null;
  const tripId = trip?.id || reservation?.trip_id || null;

  // Legacy event log (feeds existing conductor views)
  await supabaseAdmin.from("bus_gate_events").insert({
    bus_id: c.bus_id,
    trip_id: tripId,
    gate_type: c.door === "IN" ? "GATE_IN" : "GATE_OUT",
    student_id: studentId,
    matched_distance: matched?.distance ?? null,
    confidence_score: matched ? Math.max(0, Math.min(100, Math.round((1 - matched.distance) * 1000) / 10)) : 0,
    is_authorized: Boolean(studentId) && decision.outcome !== "WRONG_BUS",
    latitude: c.latitude ?? 0,
    longitude: c.longitude ?? 0,
    stop_name: null,
    created_at: at,
    metadata: { capture_id: c.id, outcome: decision.outcome, gps_missing: c.latitude === null, pipeline: "v2" },
  });

  if (decision.attendance && studentId) {
    const { data: existing } = await supabaseAdmin
      .from("attendance_records")
      .select("id")
      .eq("student_id", studentId)
      .eq("bus_id", c.bus_id)
      .eq("method", "BIOMETRIC_FACE_ID")
      .gte("timestamp", `${istDate(at)}T00:00:00+05:30`)
      .limit(1)
      .maybeSingle();
    if (!existing) {
      const unlocked = decision.attendance === "BOARDED";
      await supabaseAdmin.from("attendance_records").insert({
        id: `att-face-${c.id}`,
        student_id: studentId,
        bus_id: c.bus_id,
        trip_id: tripId,
        reservation_id: reservation?.id || null,
        method: "BIOMETRIC_FACE_ID",
        status: decision.attendance,
        verified_by: "Face ID Gate (v2)",
        notes: `Door ${c.door}; capture ${c.id}`,
        timestamp: at,
        lock_status: unlocked ? "UNLOCKED" : "LOCKED",
        unlocked_by: unlocked ? "FACE_ID" : null,
        unlock_timestamp: unlocked ? at : null,
      });
    }
  }

  if (reservation) {
    if (decision.reservationStatus === "BOARDED") {
      await supabaseAdmin
        .from("bus_reservations")
        .update({ status: "BOARDED", boarded_at: at, lock_status: "UNLOCKED", unlocked_by: "FACE_ID", unlock_timestamp: at, roaming_status: null, ...(tripId ? { trip_id: tripId } : {}) })
        .eq("id", reservation.id);
    } else if (decision.reservationStatus === "ALIGHTED") {
      await supabaseAdmin.from("bus_reservations").update({ status: "ALIGHTED", alighted_at: at, alighted_stop_id: stopId, roaming_status: null }).eq("id", reservation.id);
    }
    if (decision.roaming) {
      await supabaseAdmin.from("bus_reservations").update({ roaming_status: "ROAMING" }).eq("id", reservation.id);
    }
  }

  // Conductor + student notifications (bus number only — never trip ids, per AGENTS.md)
  if (decision.notifyConductor) {
    let conductorUser: string | null = null;
    if (trip?.conductor_id) {
      const { data: st } = await supabaseAdmin.from("staff").select("user_id").eq("id", trip.conductor_id).maybeSingle();
      conductorUser = st?.user_id || null;
    }
    const studentUser = studentId
      ? (await supabaseAdmin.from("students").select("user_id, full_name").eq("id", studentId).maybeSingle()).data
      : null;
    const who = studentUser?.full_name || "An unidentified person";
    const msg: Record<string, string> = {
      ROAMING: `${who} stepped off ${busLabel} before departure.`,
      WRONG_BUS: `${who} boarded ${busLabel} but is not booked on it.`,
      UNAUTHORIZED: `Unregistered person boarded ${busLabel}. Please verify.`,
      UNKNOWN_DEBOARDER: `Unregistered person left ${busLabel}.`,
      ALIGHTED: `${who} left ${busLabel} away from a stop.`,
      INTRUDER_LEFT: `Flagged person left ${busLabel} away from a stop.`,
    };
    await notify([conductorUser], "Gate alert", msg[decision.outcome] || `Gate event on ${busLabel}`, "GATE_ALERT");
    if (decision.outcome === "ROAMING" && studentUser?.user_id) {
      await notify([studentUser.user_id], "Your bus is waiting", `You were seen stepping off ${busLabel}. Please return before departure.`, "BOARDING");
    }
    if (decision.outcome === "WRONG_BUS" && studentUser?.user_id) {
      await notify([studentUser.user_id], "Wrong bus", `You boarded ${busLabel}, which is not your assigned bus today.`, "BOARDING");
    }
  }

  for (const inc of decision.incidents) {
    const { data: row } = await supabaseAdmin
      .from("bus_security_incidents")
      .insert({
        bus_id: c.bus_id,
        trip_id: tripId,
        incident_type: inc.type,
        severity: inc.severity,
        stop_name: null,
        latitude: c.latitude ?? 0,
        longitude: c.longitude ?? 0,
        matched_student_id: studentId,
        capture_id: c.id,
        evidence_blob_key: inc.withEvidence ? c.evidence_blob_key : null,
        face_embedding: inc.storeFaceForExitMatching ? toVectorLiteral(args.template) : null,
        status: "ACTIVE",
        metadata: { door: c.door, outcome: decision.outcome, stop_id: stopId, captured_at: at },
      })
      .select("id")
      .single();
    if (row) await publishOpsEvent({ type: "INCIDENT", busId: c.bus_id, incidentId: row.id, incidentType: inc.type });
  }

  if (decision.resolveIncidentId) {
    await supabaseAdmin
      .from("bus_security_incidents")
      .update({ status: "RESOLVED", resolved_at: at, resolution_notes: `Person matched leaving through the ${c.door} door (capture ${c.id}).`, face_embedding: null })
      .eq("id", decision.resolveIncidentId)
      .neq("status", "RESOLVED");
    await publishOpsEvent({ type: "INCIDENT_RESOLVED", busId: c.bus_id, incidentId: decision.resolveIncidentId });
  }
}

/** Process pending captures (oldest first). Used after ingest (waitUntil), by cron, and on demand. */
export async function processPending(opts: { busId?: number; captureId?: string; limit?: number } = {}): Promise<ProcessResult[]> {
  const claimed = await claimCaptures({ busId: opts.busId, captureId: opts.captureId, limit: opts.limit ?? 20 });
  const results: ProcessResult[] = [];
  // Sequential per call: keeps capture-time ordering within a bus and bounds face-service load.
  for (const c of claimed) {
    try {
      results.push(await processCapture(c));
    } catch (err: any) {
      console.error("[gate] processCapture failed", c.id, err?.message);
      await supabaseAdmin
        .from("gate_captures")
        .update({ status: "FAILED", error: String(err?.message || err).slice(0, 500), attempts: c.attempts + 1, locked_until: new Date(Date.now() + 60_000).toISOString() })
        .eq("id", c.id);
      results.push({ id: c.id, status: "FAILED", error: err?.message });
    }
  }
  return results;
}
