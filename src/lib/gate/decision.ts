/**
 * Door decision rules (design doc pages 6–7). Pure function: no I/O, fully table-tested.
 *
 * IN camera
 *   matched rider, reserved on THIS bus          → BOARDED
 *   matched rider, not reserved on this bus      → WRONG_BUS        (incident WRONG_BUS_BOARDING, MEDIUM)
 *   unknown face                                 → UNAUTHORIZED     (incident UNAUTHORIZED_INTRUDER, CRITICAL, evidence)
 * OUT camera, bus at the trip's start stop (not departed yet)
 *   matched rider                                → ROAMING          (rider stepped out before departure → conductor alert)
 *   unknown face matching an open intruder       → INTRUDER_LEFT    (resolve that incident)
 *   unknown face otherwise                       → UNKNOWN_LEFT_AT_START (logged only)
 * OUT camera elsewhere
 *   matched rider, bus inside a stop geofence    → ALIGHTED
 *   matched rider, bus outside every geofence    → ALIGHTED + UNEXPECTED_EXIT alert (HIGH)
 *   unknown face matching an open intruder       → INTRUDER_LEFT    (resolve) — plus UNEXPECTED_EXIT if off-stop
 *   unknown face otherwise                       → UNKNOWN_DEBOARDER (incident MEDIUM, evidence)
 * Any door: same student + same door within DUPLICATE_WINDOW_S of a decided capture → DUPLICATE (no side effects).
 */
export const DUPLICATE_WINDOW_S = 120;

export type Door = "IN" | "OUT";

export type Outcome =
  | "BOARDED"
  | "WRONG_BUS"
  | "UNAUTHORIZED"
  | "ROAMING"
  | "ALIGHTED"
  | "INTRUDER_LEFT"
  | "UNKNOWN_LEFT_AT_START"
  | "UNKNOWN_DEBOARDER"
  | "DUPLICATE";

export interface DecisionInput {
  door: Door;
  /** Matched student (any scope) or null when no template is within threshold. */
  matchedStudentId: string | null;
  /** Student has an active reservation today on this bus. */
  reservedOnThisBus: boolean;
  /** Bus is still at its start stop / trip not yet departed at capture time. */
  atStartStop: boolean;
  /** Stop whose geofence contains the capture position, or null. */
  stopIdAtPosition: string | null;
  /** Open intruder incident on this bus whose stored face matches this capture. */
  matchingOpenIncidentId: string | null;
  /** Seconds since the last decided capture of the same student at the same door on this bus. */
  secondsSinceSameStudentSameDoor: number | null;
}

export interface IncidentAction {
  type: "UNAUTHORIZED_INTRUDER" | "WRONG_BUS_BOARDING" | "UNEXPECTED_EXIT" | "UNKNOWN_DEBOARDER";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  withEvidence: boolean;
  storeFaceForExitMatching: boolean;
}

export interface Decision {
  outcome: Outcome;
  attendance: "BOARDED" | "WRONG_BUS_TAP" | null;
  reservationStatus: "BOARDED" | "ALIGHTED" | null;
  roaming: boolean;
  notifyConductor: boolean;
  incidents: IncidentAction[];
  resolveIncidentId: string | null;
}

const base = (outcome: Outcome): Decision => ({
  outcome,
  attendance: null,
  reservationStatus: null,
  roaming: false,
  notifyConductor: false,
  incidents: [],
  resolveIncidentId: null,
});

export function decide(i: DecisionInput): Decision {
  if (
    i.matchedStudentId &&
    i.secondsSinceSameStudentSameDoor !== null &&
    i.secondsSinceSameStudentSameDoor >= 0 &&
    i.secondsSinceSameStudentSameDoor < DUPLICATE_WINDOW_S
  ) {
    return base("DUPLICATE");
  }

  const offStop = !i.atStartStop && i.stopIdAtPosition === null;
  const unexpectedExit: IncidentAction = { type: "UNEXPECTED_EXIT", severity: "HIGH", withEvidence: true, storeFaceForExitMatching: false };

  if (i.door === "IN") {
    if (!i.matchedStudentId) {
      return {
        ...base("UNAUTHORIZED"),
        notifyConductor: true,
        incidents: [{ type: "UNAUTHORIZED_INTRUDER", severity: "CRITICAL", withEvidence: true, storeFaceForExitMatching: true }],
      };
    }
    if (!i.reservedOnThisBus) {
      return {
        ...base("WRONG_BUS"),
        attendance: "WRONG_BUS_TAP",
        notifyConductor: true,
        incidents: [{ type: "WRONG_BUS_BOARDING", severity: "MEDIUM", withEvidence: true, storeFaceForExitMatching: false }],
      };
    }
    return { ...base("BOARDED"), attendance: "BOARDED", reservationStatus: "BOARDED" };
  }

  // OUT door
  if (i.atStartStop) {
    if (i.matchedStudentId) return { ...base("ROAMING"), roaming: true, notifyConductor: true };
    if (i.matchingOpenIncidentId) return { ...base("INTRUDER_LEFT"), resolveIncidentId: i.matchingOpenIncidentId };
    return base("UNKNOWN_LEFT_AT_START");
  }

  if (i.matchedStudentId) {
    return {
      ...base("ALIGHTED"),
      reservationStatus: i.reservedOnThisBus ? "ALIGHTED" : null,
      notifyConductor: offStop,
      incidents: offStop ? [unexpectedExit] : [],
    };
  }
  if (i.matchingOpenIncidentId) {
    return {
      ...base("INTRUDER_LEFT"),
      resolveIncidentId: i.matchingOpenIncidentId,
      notifyConductor: offStop,
      incidents: offStop ? [unexpectedExit] : [],
    };
  }
  return {
    ...base("UNKNOWN_DEBOARDER"),
    notifyConductor: true,
    incidents: [
      { type: "UNKNOWN_DEBOARDER", severity: "MEDIUM", withEvidence: true, storeFaceForExitMatching: false },
      ...(offStop ? [unexpectedExit] : []),
    ],
  };
}

/** Haversine distance in metres. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface StopGeo {
  id: string;
  latitude: number;
  longitude: number;
  geofence_radius: number | null;
}

/** Stop whose geofence contains the point (closest wins). Default radius 120 m; GPS accuracy widens it up to +50 m. */
export function stopAtPosition(stops: StopGeo[], lat: number | null, lon: number | null, accuracyM = 0): string | null {
  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: { id: string; d: number } | null = null;
  for (const s of stops) {
    if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) continue;
    const radius = (s.geofence_radius && s.geofence_radius > 0 ? s.geofence_radius : 120) + Math.min(50, Math.max(0, accuracyM));
    const d = distanceMeters(lat, lon, s.latitude, s.longitude);
    if (d <= radius && (!best || d < best.d)) best = { id: s.id, d };
  }
  return best?.id ?? null;
}
