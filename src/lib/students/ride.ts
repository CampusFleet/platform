import { db } from "@/lib/supabaseClient";
import { cacheGet, getOrFetchWithCache } from "@/lib/redis";
import { getHaltRequest } from "@/lib/dispatch/halt";
import { assignTripSeats } from "./seating";

/**
 * The signed-in student's ride today, for the live radar. Server-only.
 *
 * Built only from the student's own reservation and its trip. Trip ids stay on the server
 * (AGENTS.md transit rule): `RideInternal.tripId` is used here and never returned to the browser.
 * Nothing is guessed: no first-bus / first-route / any-conductor fallbacks.
 */

export interface RideStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  order: number;
  /** "HH:MM" planned time from shift start + route offset, when both are known. */
  plannedTime: string | null;
}

export interface PublicRide {
  hasRide: boolean;
  busId: number | null;
  busNumber: string | null;
  busModel: string | null;
  registrationNo: string | null;
  capacity: number | null;
  shiftName: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  direction: string | null;
  routeName: string | null;
  routeColor: string | null;
  stops: RideStop[];
  myStopId: string | null;
  myStopLandmark: string | null;
  home: { latitude: number; longitude: number } | null;
  campus: { name: string | null; latitude: number; longitude: number } | null;
  conductor: { name: string | null; phone: string | null } | null;
}

interface RideInternal extends PublicRide {
  studentId: string | null;
  tripId: string | null;
}

export interface RideLive {
  status: "NO_RIDE" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DELAYED";
  currentStopIndex: number | null;
  delayMinutes: number;
  boarded: boolean;
  /** Only once the student is on board (seat numbers are not shown before check-in). */
  seat: string | null;
  bus: { latitude: number; longitude: number; speedKmh: number; headingDeg: number; ageSeconds: number } | null;
  halt: { status: string; updatedAt: string } | null;
}

const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : null);
function addMinutes(t: string, mins: number) {
  const [h, m] = t.split(":").map(Number);
  const total = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
const nowIstMinutes = () => {
  const d = new Date(Date.now() + 5.5 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);

const EMPTY: RideInternal = {
  hasRide: false, studentId: null, tripId: null, busId: null, busNumber: null, busModel: null, registrationNo: null, capacity: null,
  shiftName: null, departureTime: null, arrivalTime: null, direction: null, routeName: null, routeColor: null, stops: [],
  myStopId: null, myStopLandmark: null, home: null, campus: null, conductor: null,
};

async function buildRide(userId: string): Promise<RideInternal> {
  const { data: s } = await db
    .from("students_full")
    .select("id, campus_id, primary_stop_id, home_latitude, home_longitude")
    .eq("user_id", userId)
    .maybeSingle();
  if (!s) return EMPTY;

  const base: RideInternal = {
    ...EMPTY,
    studentId: s.id,
    myStopId: s.primary_stop_id,
    home: s.home_latitude != null && s.home_longitude != null ? { latitude: Number(s.home_latitude), longitude: Number(s.home_longitude) } : null,
  };

  const { data: reservations } = await db
    .from("bus_reservations")
    .select("trip_id, bus_id, boarding_stop_id, status, shift:shifts(name, start_time, end_time, direction)")
    .eq("student_id", s.id)
    .eq("reservation_date", todayIst())
    .neq("status", "CANCELLED");
  const list = ((reservations || []) as any[]).filter((r) => r.trip_id);
  if (list.length === 0) return base;

  // The ride that matters now: one in progress, else the next one, else the last one today.
  const tripIds = list.map((r) => r.trip_id);
  const { data: trips } = await db.from("trips").select("id, bus_id, route_id, status, conductor_id").in("id", tripIds);
  const tripById = new Map((trips || []).map((t) => [t.id, t]));
  const now = nowIstMinutes();
  const sorted = [...list].sort((a, b) => toMin(a.shift?.start_time) - toMin(b.shift?.start_time));
  const pick =
    sorted.find((r) => tripById.get(r.trip_id)?.status === "IN_PROGRESS") ||
    sorted.find((r) => toMin(hhmm(r.shift?.end_time)) >= now && tripById.get(r.trip_id)?.status !== "COMPLETED") ||
    sorted[sorted.length - 1];
  const trip = tripById.get(pick.trip_id);
  if (!trip) return base;

  const busId = trip.bus_id ?? pick.bus_id ?? null;
  await assignTripSeats(trip.id, busId != null ? Number(busId) : null).catch(() => 0);
  const [busRes, routeRes, rsRes, conductorRes, campusRes] = await Promise.all([
    busId != null ? db.from("buses").select("bus_number, model, registration_no, capacity").eq("id", busId).maybeSingle() : Promise.resolve({ data: null }),
    trip.route_id ? db.from("routes").select("name, color").eq("id", trip.route_id).maybeSingle() : Promise.resolve({ data: null }),
    trip.route_id
      ? db.from("route_stops").select("stop_id, stop_order, arrival_offset_minutes, stop:stops(id, name, landmark, latitude, longitude)").eq("route_id", trip.route_id).order("stop_order")
      : Promise.resolve({ data: [] as any[] }),
    trip.conductor_id ? db.from("staff").select("full_name, phone").eq("id", trip.conductor_id).maybeSingle() : Promise.resolve({ data: null }),
    s.campus_id ? db.from("campuses").select("name, latitude, longitude").eq("id", s.campus_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const start = hhmm(pick.shift?.start_time);
  const stops: RideStop[] = ((rsRes.data || []) as any[])
    .filter((r) => r.stop && r.stop.latitude != null && r.stop.longitude != null)
    .map((r) => ({
      id: r.stop.id,
      name: r.stop.name || "Stop",
      latitude: Number(r.stop.latitude),
      longitude: Number(r.stop.longitude),
      order: r.stop_order ?? 0,
      plannedTime: start && r.arrival_offset_minutes != null ? addMinutes(start, Number(r.arrival_offset_minutes)) : null,
    }));
  const campus = campusRes.data as { name: string | null; latitude: number | null; longitude: number | null } | null;
  const conductor = conductorRes.data as { full_name: string | null; phone: string | null } | null;

  const bus = busRes.data as { bus_number: string | null; model: string | null; registration_no: string | null; capacity: number | null } | null;
  const myStopId = pick.boarding_stop_id || s.primary_stop_id;
  const myStopRow = ((rsRes.data || []) as any[]).find((r) => r.stop?.id === myStopId)?.stop;
  return {
    ...base,
    hasRide: true,
    busModel: bus?.model ?? null,
    registrationNo: bus?.registration_no ?? null,
    capacity: bus?.capacity ?? null,
    arrivalTime: hhmm(pick.shift?.end_time),
    myStopLandmark: myStopRow?.landmark ?? null,
    tripId: trip.id,
    busId: busId != null ? Number(busId) : null,
    busNumber: bus?.bus_number ?? null,
    shiftName: pick.shift?.name ?? null,
    departureTime: start,
    direction: pick.shift?.direction ?? null,
    routeName: (routeRes.data as { name: string | null } | null)?.name ?? null,
    routeColor: (routeRes.data as { color: string | null } | null)?.color ?? null,
    stops,
    myStopId,
    campus: campus?.latitude != null && campus.longitude != null ? { name: campus.name, latitude: Number(campus.latitude), longitude: Number(campus.longitude) } : null,
    conductor: conductor ? { name: conductor.full_name, phone: conductor.phone } : null,
  };
}

/** Cached 20 s per student: the ride changes only when the chart or rollover runs. */
export function getRideInternal(userId: string): Promise<RideInternal> {
  return getOrFetchWithCache<RideInternal>({ key: `ride:v2:${userId}`, ttl: 20, allowEmpty: true, fetchFn: () => buildRide(userId) });
}

export async function getPublicRide(userId: string): Promise<PublicRide> {
  const { tripId: _t, studentId: _s, ...pub } = await getRideInternal(userId);
  return pub;
}

/** Live status for the radar: one call covers trip status, bus position, boarding and the halt request. */
export async function getRideLive(userId: string): Promise<RideLive> {
  const ride = await getRideInternal(userId);
  if (!ride.hasRide || !ride.tripId || !ride.studentId) {
    return { status: "NO_RIDE", currentStopIndex: null, delayMinutes: 0, boarded: false, seat: null, bus: null, halt: null };
  }
  const [{ data: trip }, { data: resv }, loc, halt] = await Promise.all([
    db.from("trips").select("status, current_stop_index, delay_minutes").eq("id", ride.tripId).maybeSingle(),
    db.from("bus_reservations").select("status, chosen_seat").eq("trip_id", ride.tripId).eq("student_id", ride.studentId).maybeSingle(),
    ride.busId != null ? cacheGet<any>(`telematics:bus:${ride.busId}`).catch(() => null) : Promise.resolve(null),
    getHaltRequest(ride.tripId, ride.studentId).catch(() => null),
  ]);
  let bus: RideLive["bus"] = null;
  if (loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))) {
    const ts = new Date(loc.timestamp || loc.lastPingAt || 0).getTime();
    const ageSeconds = ts ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : 9999;
    bus = { latitude: Number(loc.latitude), longitude: Number(loc.longitude), speedKmh: Number(loc.speedKmh) || 0, headingDeg: Number(loc.headingDeg) || 0, ageSeconds };
  }
  const status = (trip?.status as RideLive["status"]) || "SCHEDULED";
  return {
    status,
    currentStopIndex: trip?.current_stop_index ?? null,
    delayMinutes: Number(trip?.delay_minutes) || 0,
    boarded: resv?.status === "BOARDED",
    seat: resv?.status === "BOARDED" ? resv.chosen_seat ?? null : null,
    bus,
    halt: halt ? { status: halt.status, updatedAt: halt.updatedAt } : null,
  };
}

/** Is today off for the student's class (class timetable, else shift demand)? Cached 2 min per class. */
export async function getDayOff(userId: string): Promise<{ dayOff: boolean; dayName: string }> {
  const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const dayName = days[new Date(Date.now() + 5.5 * 3600_000).getUTCDay()];
  const { data: s } = await db.from("students").select("class_id").eq("user_id", userId).maybeSingle();
  if (!s?.class_id) return { dayOff: false, dayName };
  const row = await getOrFetchWithCache<{ is_today_off: boolean | null; incoming_shift_id: string | null; outgoing_shift_id: string | null } | null>({
    key: `schedule:class:${s.class_id}:${dayName}`,
    ttl: 120,
    allowEmpty: true,
    fetchFn: async () => {
      const cols = "incoming_shift_id, outgoing_shift_id, is_today_off";
      const a = await db.from("class_shift_schedules").select(cols).eq("class_id", s.class_id!).eq("day_of_week", dayName).maybeSingle();
      if (a.data) return a.data;
      const b = await db.from("shift_demands").select(cols).eq("class_id", s.class_id!).eq("day_of_week", dayName).maybeSingle();
      return b.data ?? null;
    },
  });
  const dayOff = Boolean(row?.is_today_off || (row && !row.incoming_shift_id && !row.outgoing_shift_id));
  return { dayOff, dayName };
}
