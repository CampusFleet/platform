import { supabaseAdmin } from "@/lib/supabaseClient";

/**
 * Pilot / operations metrics for the hybrid Face ID pipeline (Task 11).
 * All figures come from gate_captures, incidents and devices — nothing is estimated.
 */
export interface FaceMetrics {
  windowDays: number;
  busIds: number[] | null;
  captures: number;
  decided: number;
  rejectedLowQuality: number;
  spoofRejected: number;
  failedPending: number;
  matchRate: number | null; // matched / decided (excluding duplicates)
  unknownRate: number | null;
  rosterMatchShare: number | null; // matches found in the bus roster (vs campus-wide)
  outcomes: Record<string, number>;
  falseAlertReports: number;
  unauthorizedIncidents: number;
  falseAlertRate: number | null; // false alerts / unauthorized incidents
  latencyP50Ms: number | null; // receive → decision
  latencyP95Ms: number | null;
  offlineUploadShare: number | null; // captures uploaded > 5 min after capture
  devices: { total: number; online: number; staleQueues: number };
  threshold: { modelVersion: string; threshold: number; calibratedAt: string | null; fnmr: number | null } | null;
}

function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export async function computeFaceMetrics(windowDays = 14, busIds: number[] | null = null): Promise<FaceMetrics> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  let q = supabaseAdmin
    .from("gate_captures")
    .select("status, outcome, matched_student_id, match_scope, captured_at, received_at, processed_at")
    .gte("captured_at", since)
    .limit(50000);
  if (busIds?.length) q = q.in("bus_id", busIds);
  const { data: caps } = await q;
  const rows = caps || [];

  const outcomes: Record<string, number> = {};
  for (const r of rows) if (r.outcome) outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
  const decided = rows.filter((r) => r.status === "DECIDED" && r.outcome !== "DUPLICATE");
  const matched = decided.filter((r) => r.matched_student_id);
  const latency = rows
    .filter((r) => r.processed_at && r.received_at)
    .map((r) => new Date(r.processed_at).getTime() - new Date(r.received_at).getTime())
    .sort((a, b) => a - b);
  const offline = rows.filter((r) => new Date(r.received_at).getTime() - new Date(r.captured_at).getTime() > 5 * 60_000).length;

  let iq = supabaseAdmin.from("bus_security_incidents").select("incident_type, metadata").gte("created_at", since).limit(20000);
  if (busIds?.length) iq = iq.in("bus_id", busIds);
  const { data: incs } = await iq;
  const unauthorized = (incs || []).filter((i) => i.incident_type === "UNAUTHORIZED_INTRUDER").length;
  const falseAlerts = (incs || []).filter((i) => (i.metadata as any)?.false_alert === true).length;

  let dq = supabaseAdmin.from("gate_devices").select("kind, last_seen_at, health, revoked_at, bus_id").is("revoked_at", null).neq("kind", "PHONE");
  if (busIds?.length) dq = dq.in("bus_id", busIds);
  const { data: devs } = await dq;
  const now = Date.now();
  const online = (devs || []).filter((d) => d.last_seen_at && now - new Date(d.last_seen_at).getTime() < 3 * 60_000).length;
  const staleQueues = (devs || []).filter((d) => {
    const o = (d.health as any)?.oldestQueuedAt;
    return o && now - new Date(o).getTime() > 3600_000;
  }).length;

  const { data: cfg } = await supabaseAdmin.from("face_match_config").select("model_version, threshold, calibrated_at, fnmr_measured").order("updated_at", { ascending: false }).limit(1).maybeSingle();

  return {
    windowDays,
    busIds,
    captures: rows.length,
    decided: decided.length,
    rejectedLowQuality: outcomes.LOW_QUALITY || 0,
    spoofRejected: outcomes.SPOOF_REJECTED || 0,
    failedPending: rows.filter((r) => ["PENDING", "FAILED", "PROCESSING"].includes(r.status)).length,
    matchRate: decided.length ? matched.length / decided.length : null,
    unknownRate: decided.length ? (decided.length - matched.length) / decided.length : null,
    rosterMatchShare: matched.length ? matched.filter((r) => r.match_scope === "BUS_ROSTER").length / matched.length : null,
    outcomes,
    falseAlertReports: falseAlerts,
    unauthorizedIncidents: unauthorized,
    falseAlertRate: unauthorized ? falseAlerts / unauthorized : null,
    latencyP50Ms: pct(latency, 0.5),
    latencyP95Ms: pct(latency, 0.95),
    offlineUploadShare: rows.length ? offline / rows.length : null,
    devices: { total: devs?.length || 0, online, staleQueues },
    threshold: cfg ? { modelVersion: cfg.model_version, threshold: Number(cfg.threshold), calibratedAt: cfg.calibrated_at, fnmr: cfg.fnmr_measured } : null,
  };
}

/** Go / no-go thresholds for expanding beyond the pilot buses. */
export const GO_CRITERIA = {
  minMatchRate: 0.9, // of decided crossings (enrolled riders dominate traffic)
  maxFalseAlertRate: 0.05,
  maxLatencyP95Ms: 5000,
  maxFnmrAtFmr1e4: 0.05,
};

export function goNoGo(m: FaceMetrics) {
  const checks = [
    { name: "Match rate ≥ 90%", ok: m.matchRate !== null && m.matchRate >= GO_CRITERIA.minMatchRate, value: m.matchRate },
    { name: "False alerts ≤ 5% of intruder alerts", ok: m.falseAlertRate === null || m.falseAlertRate <= GO_CRITERIA.maxFalseAlertRate, value: m.falseAlertRate },
    { name: "Decision latency p95 ≤ 5 s", ok: m.latencyP95Ms !== null && m.latencyP95Ms <= GO_CRITERIA.maxLatencyP95Ms, value: m.latencyP95Ms },
    { name: "Calibrated FNMR @ FMR 1e-4 ≤ 5%", ok: m.threshold?.fnmr !== null && m.threshold?.fnmr !== undefined && m.threshold.fnmr <= GO_CRITERIA.maxFnmrAtFmr1e4, value: m.threshold?.fnmr ?? null },
    { name: "No unprocessed captures", ok: m.failedPending === 0, value: m.failedPending },
  ];
  return { go: checks.every((c) => c.ok), checks };
}
