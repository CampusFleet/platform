import { db as supabaseAdmin } from "@/lib/supabaseClient";
import type { SessionPayload } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { getTodayIST, getCurrentMinutesIST, timeStringToMinutes } from "@/lib/time-manager";

/**
 * Crew duty: which trip a driver / conductor works today and who is on it.
 * Server-only. Crew never choose a bus: trips.driver_id / conductor_id (staff ids) are set by the
 * transport manager (/transport-manager/drivers) or the daily rollover.
 */

export type CrewRole = "driver" | "conductor";

export interface DutyStop {
  stopId: string;
  order: number;
  name: string;
  latitude: number;
  longitude: number;
  arrivalOffsetMinutes: number;
}

export interface DutyTrip {
  id: string; // internal trip id: crew-only, never sent to riders
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  currentStopIndex: number;
  manifestLocked: boolean;
  bus: { id: number; busNumber: number; registrationNo: string; capacity: number; seatLayout: string; totalRows: number | null; teacherSeatsCount: number };
  route: { id: string; name: string; direction: string; stops: DutyStop[] } | null;
  shift: { id: string; name: string; direction: string; startTime: string; endTime: string; cutoffMinutes: number } | null;
  driverName: string | null;
  conductorName: string | null;
}

export interface DutyPassenger {
  reservationId: string;
  studentId: string;
  fullName: string;
  studentIdCode: string;
  photoUrl: string;
  phone: string | null;
  className: string;
  boardingStopId: string;
  boardingStopName: string;
  seat: string | null;
  status: string; // ASSIGNED | SEAT_SELECTED | BOARDED | ALIGHTED | ABSENT
  assignedBy: string;
  boardedAt: string | null;
  unlockedBy: string | null;
  roamingStatus: string | null;
  needsConfirmation: boolean;
}

export interface DutyAttendance {
  id: string;
  studentId: string;
  method: string;
  status: string;
  verifiedBy: string;
  timestamp: string;
}

export interface CrewDuty {
  me: { name: string; role: string; staffId: string | null };
  trips: DutyTrip[]; // today's trips for this crew member (managers: all of today's trips)
  trip: DutyTrip | null; // the trip being shown
  manifest: DutyPassenger[];
  attendance: DutyAttendance[];
  departureAlert: { id: string; message: string; triggeredAt: string } | null;
  pendingHaltRequests: number;
}

const TRIP_SELECT =
  "id, status, started_at, completed_at, current_stop_index, manifest_locked, route_id, driver_id, conductor_id, " +
  "bus:buses(id, bus_number, registration_no, capacity, seat_layout, total_rows, teacher_seats_count), " +
  "shift:shifts(id, name, direction, start_time, end_time, booking_cutoff_minutes)";

export async function getStaffIdForUser(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("staff").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

async function loadRoutes(routeIds: string[]) {
  if (routeIds.length === 0) return new Map<string, DutyTrip["route"]>();
  const [{ data: routes }, { data: rs }] = await Promise.all([
    supabaseAdmin.from("routes").select("id, name, direction").in("id", routeIds),
    supabaseAdmin
      .from("route_stops")
      .select("route_id, stop_order, arrival_offset_minutes, stop:stops(id, name, latitude, longitude)")
      .in("route_id", routeIds)
      .order("stop_order", { ascending: true }),
  ]);
  const map = new Map<string, DutyTrip["route"]>();
  for (const r of routes || []) {
    const stops = (rs || [])
      .filter((x: any) => x.route_id === r.id && x.stop)
      .map((x: any) => ({
        stopId: x.stop.id,
        order: x.stop_order,
        name: x.stop.name,
        latitude: Number(x.stop.latitude),
        longitude: Number(x.stop.longitude),
        arrivalOffsetMinutes: Number(x.arrival_offset_minutes || 0),
      }));
    map.set(r.id, { id: r.id, name: r.name || "Route", direction: r.direction || "HOME_TO_CAMPUS", stops });
  }
  return map;
}

async function loadStaffNames(ids: string[]) {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabaseAdmin.from("staff_full").select("id, full_name").in("id", ids);
  for (const s of data || []) if (s.full_name) map.set(s.id, s.full_name);
  return map;
}

async function loadTodayTrips(filter: { column: "driver_id" | "conductor_id"; staffId: string } | null): Promise<DutyTrip[]> {
  let q = supabaseAdmin.from("trips").select(TRIP_SELECT).eq("trip_date", getTodayIST()).neq("status", "CANCELLED");
  if (filter) q = q.eq(filter.column, filter.staffId);
  const { data } = await q;
  const rows: any[] = (data as any[]) || [];
  const [routes, names] = await Promise.all([
    loadRoutes(Array.from(new Set(rows.map((t) => t.route_id).filter(Boolean)))),
    loadStaffNames(Array.from(new Set(rows.flatMap((t) => [t.driver_id, t.conductor_id]).filter(Boolean)))),
  ]);
  return rows
    .filter((t) => t.bus)
    .map((t) => ({
      id: t.id,
      status: t.status || "SCHEDULED",
      startedAt: t.started_at,
      completedAt: t.completed_at,
      currentStopIndex: t.current_stop_index || 0,
      manifestLocked: Boolean(t.manifest_locked),
      bus: {
        id: Number(t.bus.id),
        busNumber: Number(t.bus.bus_number),
        registrationNo: t.bus.registration_no || "",
        capacity: Number(t.bus.capacity || 40),
        seatLayout: t.bus.seat_layout || "2x2",
        totalRows: t.bus.total_rows ?? null,
        teacherSeatsCount: Number(t.bus.teacher_seats_count ?? 0),
      },
      route: routes.get(t.route_id) || null,
      shift: t.shift
        ? {
            id: t.shift.id,
            name: t.shift.name,
            direction: t.shift.direction,
            startTime: (t.shift.start_time || "").slice(0, 5),
            endTime: (t.shift.end_time || "").slice(0, 5),
            cutoffMinutes: Number(t.shift.booking_cutoff_minutes ?? 30),
          }
        : null,
      driverName: names.get(t.driver_id) || null,
      conductorName: names.get(t.conductor_id) || null,
    }))
    .sort((a, b) => timeStringToMinutes(a.shift?.startTime) - timeStringToMinutes(b.shift?.startTime) || a.bus.busNumber - b.bus.busNumber);
}

/** Running trip first, else the next one that has not ended, else the last one of the day. */
export function pickCurrentTrip(trips: DutyTrip[], nowMinutes = getCurrentMinutesIST()): DutyTrip | null {
  if (trips.length === 0) return null;
  const running = trips.find((t) => t.status === "IN_PROGRESS");
  if (running) return running;
  const upcoming = trips.find(
    (t) => t.status !== "COMPLETED" && (!t.shift?.endTime || timeStringToMinutes(t.shift.endTime) > nowMinutes)
  );
  return upcoming || trips[trips.length - 1];
}

export async function loadManifest(trip: DutyTrip): Promise<{ manifest: DutyPassenger[]; attendance: DutyAttendance[] }> {
  const [{ data: res }, { data: att }] = await Promise.all([
    supabaseAdmin
      .from("bus_reservations")
      .select("id, student_id, boarding_stop_id, chosen_seat, auto_assigned_seat, status, assigned_by, boarded_at, unlocked_by, roaming_status, needs_confirmation")
      .eq("trip_id", trip.id)
      .neq("status", "CANCELLED"),
    supabaseAdmin
      .from("attendance_records")
      .select("id, student_id, method, status, verified_by, timestamp")
      .eq("trip_id", trip.id)
      .order("timestamp", { ascending: false })
      .limit(300),
  ]);
  const rows: any[] = res || [];
  const ids = Array.from(new Set([...rows.map((r) => r.student_id), ...(att || []).map((a: any) => a.student_id)].filter(Boolean)));
  const { data: students } = ids.length
    ? await supabaseAdmin.from("students_full").select("id, full_name, student_id_code, photo_url, phone, class_name").in("id", ids)
    : { data: [] as any[] };
  const byId = new Map((students || []).map((s: any) => [s.id, s]));
  const stopName = new Map((trip.route?.stops || []).map((s) => [s.stopId, s.name]));

  const manifest: DutyPassenger[] = rows.map((r) => {
    const s: any = byId.get(r.student_id) || {};
    return {
      reservationId: r.id,
      studentId: r.student_id,
      fullName: s.full_name || "Student",
      studentIdCode: s.student_id_code || "",
      photoUrl: s.photo_url || "",
      phone: s.phone || null,
      className: s.class_name || "",
      boardingStopId: r.boarding_stop_id || "",
      boardingStopName: stopName.get(r.boarding_stop_id) || "",
      seat: r.chosen_seat || null,
      status: r.status,
      assignedBy: r.assigned_by,
      boardedAt: r.boarded_at,
      unlockedBy: r.unlocked_by,
      roamingStatus: r.roaming_status,
      needsConfirmation: Boolean(r.needs_confirmation),
    };
  });
  const order = new Map((trip.route?.stops || []).map((s) => [s.stopId, s.order]));
  manifest.sort((a, b) => (order.get(a.boardingStopId) ?? 999) - (order.get(b.boardingStopId) ?? 999) || a.fullName.localeCompare(b.fullName));

  const attendance: DutyAttendance[] = (att || []).map((a: any) => ({
    id: a.id,
    studentId: a.student_id,
    method: a.method,
    status: a.status,
    verifiedBy: a.verified_by || "",
    timestamp: a.timestamp,
  }));
  return { manifest, attendance };
}

/**
 * Today's duty for the signed-in user. Crew see only their own trips; managers see all of today's
 * trips (to supervise) and may pick one with `requestedTripId`.
 */
export async function getCrewDuty(session: SessionPayload, requestedTripId?: string | null): Promise<CrewDuty> {
  const manager = isManageRole(session.role);
  const staffId = manager ? null : await getStaffIdForUser(session.userId);
  const column = session.role === "driver" ? "driver_id" : "conductor_id";

  const trips = manager ? await loadTodayTrips(null) : staffId ? await loadTodayTrips({ column, staffId }) : [];
  const trip = (requestedTripId && trips.find((t) => t.id === requestedTripId)) || pickCurrentTrip(trips);

  const empty = { manifest: [] as DutyPassenger[], attendance: [] as DutyAttendance[] };
  const [{ manifest, attendance }, alert, halts] = await Promise.all([
    trip ? loadManifest(trip) : Promise.resolve(empty),
    trip
      ? supabaseAdmin
          .from("bus_departure_alerts")
          .select("id, message, triggered_at")
          .eq("trip_id", trip.id)
          .eq("status", "ACTIVE")
          .order("triggered_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    trip ? countPendingHalts(trip.id) : Promise.resolve(0),
  ]);

  return {
    me: { name: session.fullName || session.email, role: session.role, staffId },
    trips,
    trip,
    manifest,
    attendance,
    departureAlert: alert.data ? { id: alert.data.id, message: alert.data.message || "Bus is about to leave. Please board now.", triggeredAt: alert.data.triggered_at || new Date().toISOString() } : null,
    pendingHaltRequests: halts,
  };
}

async function countPendingHalts(tripId: string): Promise<number> {
  try {
    const { redis } = await import("@/lib/redis");
    if (!redis) return 0;
    const keys = await redis.keys(`halt_request:${tripId}:*`);
    if (keys.length === 0) return 0;
    const rows = (await redis.mget(...keys)) as any[];
    return rows.filter((r) => r?.status === "PENDING").length;
  } catch {
    return 0;
  }
}

/** True if the session may act on this trip as `role` (own assignment, or a manager). */
export async function canActOnTrip(session: SessionPayload, tripId: string, role: CrewRole): Promise<boolean> {
  if (isManageRole(session.role)) return true;
  if (session.role !== role) return false;
  const staffId = await getStaffIdForUser(session.userId);
  if (!staffId) return false;
  const { data } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq(role === "driver" ? "driver_id" : "conductor_id", staffId)
    .maybeSingle();
  return Boolean(data);
}
