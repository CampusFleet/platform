import { supabaseAdmin } from "@/lib/supabaseClient";
import { getTodayIST } from "@/lib/time-manager";

/**
 * Persists a verified gate event (In / Out door) into the live schema:
 *   - GATE_IN  → attendance_records row (BOARDED) + bus_reservations BOARDED / UNLOCKED
 *   - GATE_OUT → bus_reservations ALIGHTED
 *
 * Column names match the live database (attendance_records has no `date`,
 * `boarding_method`, `is_verified`… columns, and bus_reservations has no
 * `boarding_time` / `boarding_lat` columns). Every write checks the Supabase
 * error object instead of assuming success.
 */
export interface GateAttendanceInput {
  studentId: string;
  busId: number;
  tripId?: string | null;
  gateType: "GATE_IN" | "GATE_OUT";
  /** Value stored in attendance_records.method, e.g. "BIOMETRIC_FACE_ID", "QR_SCAN", "RFID_VERIFIED" */
  method: string;
  /** Value stored in lock_status unlock source, e.g. "FACE_ID" */
  unlockedBy: string;
  latitude?: number | null;
  longitude?: number | null;
  stopName?: string | null;
  verifiedBy?: string | null;
}

export interface GateAttendanceResult {
  attendanceMarked: boolean;
  alreadyMarked: boolean;
  reservationUpdated: boolean;
  reservationId: string | null;
  isAssignedBus: boolean | null;
  errors: string[];
}

function todayCandidates(): string[] {
  const ist = getTodayIST();
  const utc = new Date().toISOString().split("T")[0];
  return Array.from(new Set([ist, utc]));
}

export async function persistGateAttendance(input: GateAttendanceInput): Promise<GateAttendanceResult> {
  const result: GateAttendanceResult = {
    attendanceMarked: false,
    alreadyMarked: false,
    reservationUpdated: false,
    reservationId: null,
    isAssignedBus: null,
    errors: [],
  };

  const nowIso = new Date().toISOString();
  const dates = todayCandidates();

  // Today's active reservation(s) for this student; prefer one on this bus.
  const { data: reservations, error: resErr } = await supabaseAdmin
    .from("bus_reservations")
    .select("id, bus_id, trip_id, status")
    .eq("student_id", input.studentId)
    .in("reservation_date", dates)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false });

  if (resErr) result.errors.push(`reservation lookup: ${resErr.message}`);

  const onThisBus = (reservations || []).find((r) => Number(r.bus_id) === Number(input.busId));
  const reservation = onThisBus || null;
  result.reservationId = reservation?.id || null;
  result.isAssignedBus = reservations && reservations.length > 0 ? Boolean(onThisBus) : null;
  const tripId = input.tripId || reservation?.trip_id || null;

  if (input.gateType === "GATE_IN") {
    // Anti-passback: one record per student per bus per day for this method.
    let dupQuery = supabaseAdmin
      .from("attendance_records")
      .select("id")
      .eq("student_id", input.studentId)
      .eq("bus_id", input.busId)
      .eq("method", input.method)
      .gte("timestamp", `${dates.slice().sort()[0]}T00:00:00.000Z`);
    if (tripId) dupQuery = dupQuery.eq("trip_id", tripId);
    const { data: existing } = await dupQuery.limit(1).maybeSingle();

    if (existing) {
      result.alreadyMarked = true;
      result.attendanceMarked = true;
    } else {
      const coords =
        typeof input.latitude === "number" && typeof input.longitude === "number"
          ? ` @ ${input.latitude.toFixed(6)},${input.longitude.toFixed(6)}`
          : "";
      const { error: insErr } = await supabaseAdmin.from("attendance_records").insert({
        id: `att-${input.unlockedBy.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        student_id: input.studentId,
        bus_id: input.busId,
        trip_id: tripId,
        reservation_id: reservation?.id || null,
        method: input.method,
        status: result.isAssignedBus === false ? "WRONG_BUS_TAP" : "BOARDED",
        verified_by: input.verifiedBy || `${input.unlockedBy} Gate`,
        notes: `Gate IN at ${input.stopName || "bus door"}${coords}`,
        timestamp: nowIso,
        lock_status: result.isAssignedBus === false ? "LOCKED" : "UNLOCKED",
        unlocked_by: result.isAssignedBus === false ? null : input.unlockedBy,
        unlock_timestamp: result.isAssignedBus === false ? null : nowIso,
      });
      if (insErr) result.errors.push(`attendance insert: ${insErr.message}`);
      else result.attendanceMarked = true;
    }

    if (reservation) {
      const { error: updErr } = await supabaseAdmin
        .from("bus_reservations")
        .update({
          status: "BOARDED",
          boarded_at: nowIso,
          lock_status: "UNLOCKED",
          unlocked_by: input.unlockedBy,
          unlock_timestamp: nowIso,
          roaming_status: null,
          ...(tripId ? { trip_id: tripId } : {}),
        })
        .eq("id", reservation.id);
      if (updErr) result.errors.push(`reservation update: ${updErr.message}`);
      else result.reservationUpdated = true;
    }
  } else if (reservation) {
    const { error: updErr } = await supabaseAdmin
      .from("bus_reservations")
      .update({ status: "ALIGHTED" })
      .eq("id", reservation.id);
    if (updErr) result.errors.push(`reservation update: ${updErr.message}`);
    else result.reservationUpdated = true;
  }

  if (result.errors.length > 0) {
    console.error("[persistGateAttendance]", input.studentId, result.errors.join("; "));
  }
  return result;
}
