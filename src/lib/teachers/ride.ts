import { z } from "zod";
import { db } from "@/lib/supabaseClient";
import { cacheGet, cacheDel, getOrFetchWithCache } from "@/lib/redis";
import { EMPTY_RIDE, rideFromReservations, type PublicRide, type RideInternal, type RideLive, type RideReservation } from "@/lib/students/ride";

/**
 * Teachers on the bus. Server-only. Tables from migration 20261114_teacher_rides.sql.
 *
 * - teacher_rides: the teacher's route, pickup stop, incoming/outgoing shift and weekdays (Settings).
 * - teacher_reservations: created by teacher_chart_tick() (pg_cron, 5 min) on the matching trips.
 *   Seats: lib/students/seating.ts gives teachers the bus's front seats before any student.
 *
 * `any` casts: these tables are newer than src/lib/database.types.ts; regenerate types after the
 * migration is applied (tools/gen-db-types.sh) and drop the casts.
 */

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export const teacherRideInput = z.object({
  routeId: z.string().min(1).max(80),
  stopId: z.string().min(1).max(80),
  incomingShiftId: z.string().max(80).nullable(),
  outgoingShiftId: z.string().max(80).nullable(),
  days: z.array(z.enum(DAYS)).min(1, "Choose at least one day").max(7),
  isActive: z.boolean(),
});
export type TeacherRideInput = z.infer<typeof teacherRideInput>;

export class TeacherRideError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Current settings plus what can be chosen: routes with their stops, and shifts by direction. */
export async function getTeacherRideSettings(userId: string) {
  const [{ data: user }, ride, { data: routes }, { data: rs }, { data: shifts }] = await Promise.all([
    db.from("users").select("campus_id").eq("id", userId).maybeSingle(),
    db.from("teacher_rides").select("*").eq("user_id", userId).maybeSingle(),
    db.from("routes").select("id, name, campus_id, is_active").eq("is_active", true).order("name"),
    db.from("route_stops").select("route_id, stop_id, stop_order, stop:stops(id, name)").order("stop_order"),
    db.from("shifts").select("id, name, direction, start_time, is_active, is_special").eq("is_active", true).order("start_time"),
  ]);
  const campusId = user?.campus_id ?? null;
  const stopsByRoute = new Map<string, { id: string; name: string }[]>();
  for (const r of rs || []) {
    const stop = r.stop;
    if (!r.route_id || !stop) continue;
    const list = stopsByRoute.get(r.route_id) || [];
    if (!list.some((x) => x.id === stop.id)) list.push({ id: stop.id, name: stop.name || "Stop" });
    stopsByRoute.set(r.route_id, list);
  }
  const routeOptions = (routes || [])
    .filter((r) => !campusId || !r.campus_id || r.campus_id === campusId)
    .map((r) => ({ id: r.id, name: r.name || "Route", stops: stopsByRoute.get(r.id) || [] }))
    .filter((r) => r.stops.length > 0);
  const regular = (shifts || []).filter((s) => !s.is_special);
  const sh = (dir: string) => regular.filter((s) => s.direction === dir).map((s) => ({ id: s.id, name: s.name || "Shift", startTime: (s.start_time || "").slice(0, 5) || null }));
  const row = ride.error ? null : ride.data;
  return {
    ready: !ride.error, // false until the migration is applied
    settings: row
      ? {
          routeId: row.route_id as string | null,
          stopId: row.stop_id as string | null,
          incomingShiftId: row.incoming_shift_id as string | null,
          outgoingShiftId: row.outgoing_shift_id as string | null,
          days: (row.days as string[]) || [],
          isActive: Boolean(row.is_active),
        }
      : null,
    routes: routeOptions,
    incomingShifts: sh("HOME_TO_CAMPUS"),
    outgoingShifts: sh("CAMPUS_TO_HOME"),
  };
}

export async function saveTeacherRideSettings(userId: string, input: TeacherRideInput) {
  const [{ data: onRoute }, { data: shifts }] = await Promise.all([
    db.from("route_stops").select("stop_id").eq("route_id", input.routeId).eq("stop_id", input.stopId).limit(1).maybeSingle(),
    db.from("shifts").select("id, direction, is_active").in("id", [input.incomingShiftId, input.outgoingShiftId].filter(Boolean) as string[]),
  ]);
  if (!onRoute) throw new TeacherRideError("That stop is not on the chosen route.");
  const ok = (id: string | null, dir: string) => !id || (shifts || []).some((s) => s.id === id && s.direction === dir && s.is_active !== false);
  if (!ok(input.incomingShiftId, "HOME_TO_CAMPUS") || !ok(input.outgoingShiftId, "CAMPUS_TO_HOME")) throw new TeacherRideError("Choose a valid shift.");
  if (!input.incomingShiftId && !input.outgoingShiftId) throw new TeacherRideError("Choose at least one shift.");

  const { error } = await db.from("teacher_rides").upsert(
    {
      user_id: userId,
      route_id: input.routeId,
      stop_id: input.stopId,
      incoming_shift_id: input.incomingShiftId,
      outgoing_shift_id: input.outgoingShiftId,
      days: input.days,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new TeacherRideError("Bus settings are not available yet. Ask the admin to finish the update.", 503);
  // Today's not-yet-boarded seats on a route the teacher left are released.
  await db
    .from("teacher_reservations")
    .update({ status: "CANCELLED", chosen_seat: null })
    .eq("user_id", userId)
    .eq("reservation_date", todayIst())
    .eq("status", "ASSIGNED");
  await cacheDel(`teacher-ride:${userId}`);
}

async function buildTeacherRide(userId: string): Promise<RideInternal> {
  const [{ data: user }, ride] = await Promise.all([
    db.from("users").select("campus_id").eq("id", userId).maybeSingle(),
    db.from("teacher_rides").select("stop_id").eq("user_id", userId).maybeSingle(),
  ]);
  const base: RideInternal = { ...EMPTY_RIDE, myStopId: ride.data?.stop_id ?? null };
  const { data: res, error } = await db
    .from("teacher_reservations")
    .select("trip_id, bus_id, boarding_stop_id, shift_id, status")
    .eq("user_id", userId)
    .eq("reservation_date", todayIst())
    .neq("status", "CANCELLED");
  if (error || !res?.length) return base;
  const shiftIds = Array.from(new Set((res || []).map((r) => r.shift_id)));
  const { data: shifts } = await db.from("shifts").select("id, name, start_time, end_time, direction").in("id", shiftIds);
  const byId = new Map((shifts || []).map((s) => [s.id, s]));
  const list: RideReservation[] = (res || []).map((r) => ({
    trip_id: r.trip_id,
    bus_id: r.bus_id,
    boarding_stop_id: r.boarding_stop_id,
    shift: byId.get(r.shift_id) ?? null,
  }));
  return rideFromReservations(base, list, user?.campus_id ?? null, base.myStopId);
}

function getTeacherRideInternal(userId: string) {
  return getOrFetchWithCache<RideInternal>({ key: `teacher-ride:${userId}`, ttl: 20, allowEmpty: true, fetchFn: () => buildTeacherRide(userId) });
}

export async function getTeacherRide(userId: string): Promise<PublicRide> {
  const { tripId: _t, studentId: _s, ...pub } = await getTeacherRideInternal(userId);
  return pub;
}

export async function getTeacherRideLive(userId: string): Promise<RideLive> {
  const ride = await getTeacherRideInternal(userId);
  if (!ride.hasRide || !ride.tripId) return { status: "NO_RIDE", currentStopIndex: null, delayMinutes: 0, boarded: false, seat: null, bus: null, halt: null };
  const [{ data: trip }, { data: resv }, loc] = await Promise.all([
    db.from("trips").select("status, current_stop_index, delay_minutes").eq("id", ride.tripId).maybeSingle(),
    db.from("teacher_reservations").select("status, chosen_seat").eq("trip_id", ride.tripId).eq("user_id", userId).maybeSingle(),
    ride.busId != null ? cacheGet<any>(`telematics:bus:${ride.busId}`).catch(() => null) : Promise.resolve(null),
  ]);
  let bus: RideLive["bus"] = null;
  if (loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))) {
    const ts = new Date(loc.timestamp || loc.lastPingAt || 0).getTime();
    bus = { latitude: Number(loc.latitude), longitude: Number(loc.longitude), speedKmh: Number(loc.speedKmh) || 0, headingDeg: Number(loc.headingDeg) || 0, ageSeconds: ts ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : 9999 };
  }
  return {
    status: ((trip?.status as RideLive["status"]) || "SCHEDULED"),
    currentStopIndex: trip?.current_stop_index ?? null,
    delayMinutes: Number(trip?.delay_minutes) || 0,
    boarded: resv?.status === "BOARDED",
    // Teachers see their seat as soon as it is assigned (front seat).
    seat: resv?.chosen_seat ?? null,
    bus,
    halt: null,
  };
}
