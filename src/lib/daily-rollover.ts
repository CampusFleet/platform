import { supabaseAdmin } from "./supabaseClient";
import { getTodayIST } from "./time-manager";
import { createTripId } from "./id";
import { planTrips, type PlanShift } from "./trip-planner";

export interface DailyRolloverResult {
  success: boolean;
  targetDate: string;
  alreadyInitialized?: boolean;
  archivedTripsCount: number;
  archivedBookingsCount: number;
  newTripsCount: number;
  resetBusesCount: number;
  /** Trips created without a bus because every bus on the route was busy. */
  needsBusCount?: number;
  message: string;
}

/**
 * Executes the daily operational rollover:
 * 1. Archives yesterday's incomplete trips to COMPLETED.
 * 2. Marks unboarded CONFIRMED bookings on past trips as NO_SHOW (preserving historical records).
 * 3. Creates one trip per (route, shift) the students' class timetables need today (lib/trip-planner.ts).
 *    With force, only missing (route, shift) trips are added; existing trips are never duplicated.
 * 4. Resets bus occupancy to 0.
 * 5. Records an immutable audit log entry.
 */
export async function executeDailyRollover(
  targetDateParam?: string,
  options: { force?: boolean; triggeredBy?: string } = {}
): Promise<DailyRolloverResult> {
  const targetDate = targetDateParam || getTodayIST();

  try {
    // 1. Check if trips already exist for targetDate
    const { data: existingTrips, error: checkErr } = await supabaseAdmin
      .from("trips")
      .select("id, status, route_id, shift_id")
      .eq("trip_date", targetDate);

    if (checkErr) {
      console.error("[DailyRollover] Error checking existing trips:", checkErr);
    }

    if (existingTrips && existingTrips.length > 0 && !options.force) {
      return {
        success: true,
        targetDate,
        alreadyInitialized: true,
        archivedTripsCount: 0,
        archivedBookingsCount: 0,
        newTripsCount: existingTrips.length,
        resetBusesCount: 0,
        message: `Operational trips for ${targetDate} are already active (${existingTrips.length} trips).`,
      };
    }

    // 2. Archive past incomplete trips (trip_date < targetDate)
    let archivedTripsCount = 0;
    let archivedBookingsCount = 0;

    const { data: pastIncompleteTrips } = await supabaseAdmin
      .from("trips")
      .select("id, trip_code, trip_date, status")
      .lt("trip_date", targetDate)
      .in("status", ["SCHEDULED", "IN_PROGRESS", "DELAYED"]);

    if (pastIncompleteTrips && pastIncompleteTrips.length > 0) {
      const pastTripIds = pastIncompleteTrips.map((t) => t.id);

      // Transition past trips to COMPLETED
      const { error: archiveTripErr } = await supabaseAdmin
        .from("trips")
        .update({
          status: "COMPLETED",
          completed_at: new Date().toISOString(),
        })
        .in("id", pastTripIds);

      if (!archiveTripErr) {
        archivedTripsCount = pastTripIds.length;
      }

      // Transition unboarded reservations on those past trips from CONFIRMED to NO_SHOW
      const { data: pastConfirmedBookings } = await supabaseAdmin
        .from("bus_reservations")
        .select("id")
        .in("trip_id", pastTripIds)
        .eq("status", "CONFIRMED");

      if (pastConfirmedBookings && pastConfirmedBookings.length > 0) {
        const bkIds = pastConfirmedBookings.map((b) => b.id);
        const { error: bkErr } = await supabaseAdmin
          .from("bus_reservations")
          .update({ status: "NO_SHOW" })
          .in("id", bkIds);

        if (!bkErr) {
          archivedBookingsCount = bkIds.length;
        }
      }
    }

    // 3. Master data
    const [{ data: routes }, { data: shifts }, { data: buses }, { data: staffList }] = await Promise.all([
      supabaseAdmin.from("routes").select("id, code, is_active").eq("is_active", true),
      supabaseAdmin.from("shifts").select("id, type, direction, start_time, end_time, is_special, is_active").eq("is_active", true),
      supabaseAdmin.from("buses").select("id, bus_number, current_route_id, status").eq("status", "ACTIVE"),
      supabaseAdmin.from("staff").select("id, employee_code, role, is_active"),
    ]);

    // Direction from the shift row; old rows without a direction fall back to the shift type.
    const planShifts: PlanShift[] = (shifts || [])
      .filter((s: any) => !s.is_special)
      .map((s: any) => ({
        id: s.id,
        direction: s.direction || (s.type === "MORNING" ? "HOME_TO_CAMPUS" : s.type === "AFTERNOON" || s.type === "EVENING" ? "CAMPUS_TO_HOME" : null),
        start: s.start_time,
        end: s.end_time,
      }));

    // 4. Which shifts each route needs today, from the students' class timetables.
    const demand = await loadRouteShiftDemand(targetDate);
    const existingPairs = new Set((existingTrips || []).map((t: any) => `${t.route_id}|${t.shift_id}`));
    const plan = planTrips({
      routes: (routes || []).map((r: any) => ({ id: r.id })),
      buses: (buses || []).map((b: any) => ({ id: b.id, routeId: b.current_route_id })),
      shifts: planShifts,
      demand,
      existing: existingPairs,
    });

    // 5. Crew: the bus's crew from its most recent trip (set by the transport manager), else the
    //    DRV-/CND-<bus number> employee-code convention.
    const busIds = (buses || []).map((b: any) => b.id);
    const { data: recentTrips } = busIds.length
      ? await supabaseAdmin
          .from("trips")
          .select("bus_id, driver_id, conductor_id, trip_date")
          .in("bus_id", busIds)
          .lt("trip_date", targetDate)
          .order("trip_date", { ascending: false })
          .limit(500)
      : { data: [] as any[] };
    const lastCrew = new Map<number, { driver: string | null; conductor: string | null }>();
    for (const t of recentTrips || []) {
      const cur = lastCrew.get(t.bus_id) || { driver: null, conductor: null };
      lastCrew.set(t.bus_id, { driver: cur.driver || t.driver_id, conductor: cur.conductor || t.conductor_id });
    }
    const staff = (staffList || []).filter((s: any) => s.is_active !== false);
    const byCode = (prefix: string, busNumber: string) => {
      const n = String(Number(busNumber));
      return staff.find((s: any) => s.employee_code === `${prefix}-${n.padStart(2, "0")}` || s.employee_code === `${prefix}-${n}`)?.id ?? null;
    };
    const busById = new Map((buses || []).map((b: any) => [b.id, b]));
    const routeById = new Map((routes || []).map((r: any) => [r.id, r]));
    const shiftById = new Map((shifts || []).map((s: any) => [s.id, s]));
    const dateClean = targetDate.replace(/[^0-9]/g, "");

    const newTripsToInsert: any[] = plan.map((p) => {
      const bus = p.busId != null ? busById.get(p.busId) : null;
      const crew = p.busId != null ? lastCrew.get(p.busId) : undefined;
      const route = routeById.get(p.routeId);
      const time = String(shiftById.get(p.shiftId)?.start_time || "").slice(0, 5).replace(":", "");
      return {
        id: createTripId(),
        // Internal only (never shown to students).
        trip_code: `TRIP-${String(route?.code || p.routeId).toUpperCase().replace(/[^A-Z0-9]/g, "")}-${time}-${dateClean}`,
        route_id: p.routeId,
        bus_id: p.busId,
        shift_id: p.shiftId,
        driver_id: bus ? crew?.driver || byCode("DRV", bus.bus_number) : null,
        conductor_id: bus ? crew?.conductor || byCode("CND", bus.bus_number) : null,
        trip_date: targetDate,
        status: "SCHEDULED",
        delay_minutes: 0,
        manifest_locked: false,
        current_stop_index: 0,
      };
    });
    const needsBus = plan.filter((p) => p.busId == null).length;
    const operationalBuses = buses || [];

    // Deduplicate by trip id
    const uniqueTripsToInsert = Array.from(new Map(newTripsToInsert.map((t) => [t.id, t])).values());

    let newTripsCount = 0;
    if (uniqueTripsToInsert.length > 0) {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("trips")
        .upsert(uniqueTripsToInsert, { onConflict: "id" })
        .select("id");

      if (insertErr) {
        console.error("[DailyRollover] Trip upsert error:", insertErr);
        throw insertErr;
      }
      newTripsCount = inserted ? inserted.length : newTripsToInsert.length;
    }

    // 5. Reset Bus Occupancy to 0
    let resetBusesCount = 0;
    // Only on a fresh day: a forced re-run mid-day just fills in missing trips.
    if (!existingTrips || existingTrips.length === 0) {
      const { error: resetBusErr } = await supabaseAdmin
        .from("buses")
        .update({ occupancy: 0 })
        .neq("status", "MAINTENANCE");
      if (!resetBusErr) resetBusesCount = operationalBuses.length;
    }

    // 6. Expire past dynamic bus merge suggestions
    try {
      await supabaseAdmin
        .from("bus_merge_suggestions")
        .update({ status: "EXPIRED" })
        .eq("status", "PENDING")
        .lt("created_at", targetDate);
    } catch {
      // Non-critical if table doesn't have created_at column
    }

    // 7. Record Immutable Audit Log Entry
    await supabaseAdmin.from("audit_logs").insert({
      user_role: "system",
      action: "DAILY_ROLLOVER_SUCCESS",
      entity: "DailyTransitLifecycle",
      entity_id: targetDate,
      reason: `Rollover to operational date ${targetDate} triggered by ${options.triggeredBy || "SYSTEM_CRON"}. Archived ${archivedTripsCount} past trips and ${archivedBookingsCount} bookings. Generated ${newTripsCount} fresh scheduled trips.`,
      new_value: {
        targetDate,
        archivedTripsCount,
        archivedBookingsCount,
        newTripsCount,
        resetBusesCount,
        needsBusCount: needsBus,
      },
      created_at: new Date().toISOString(),
    });

    return {
      success: true,
      targetDate,
      alreadyInitialized: false,
      archivedTripsCount,
      archivedBookingsCount,
      newTripsCount,
      resetBusesCount,
      needsBusCount: needsBus,
      message: `Created ${newTripsCount} trips for ${targetDate}${needsBus ? `; ${needsBus} need a bus (no free bus on the route at that time)` : ""}.`,
    };
  } catch (error: any) {
    console.error("[DailyRollover] Fatal error during daily rollover:", error);
    return {
      success: false,
      targetDate,
      archivedTripsCount: 0,
      archivedBookingsCount: 0,
      newTripsCount: 0,
      resetBusesCount: 0,
      message: `Failed to complete daily rollover: ${error.message || error}`,
    };
  }
}

/**
 * Shift ids each route needs on `date`: for every class with transport that day (timetable, else
 * shift demand), the incoming and outgoing shift, on the routes its paying students ride.
 * Returns null when no class has a timetable row for that weekday (rollover then uses defaults).
 */
async function loadRouteShiftDemand(date: string): Promise<Map<string, Set<string>> | null> {
  const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const dow = days[new Date(`${date}T12:00:00+05:30`).getUTCDay()];
  const cols = "class_id, incoming_shift_id, outgoing_shift_id, is_today_off";
  const [{ data: css }, { data: demandRows }] = await Promise.all([
    supabaseAdmin.from("class_shift_schedules").select(cols).eq("day_of_week", dow),
    supabaseAdmin.from("shift_demands").select(cols).eq("day_of_week", dow),
  ]);
  const byClass = new Map<string, { incoming_shift_id: string | null; outgoing_shift_id: string | null; is_today_off: boolean | null }>();
  for (const r of demandRows || []) if (r.class_id) byClass.set(r.class_id, r);
  for (const r of css || []) if (r.class_id) byClass.set(r.class_id, r); // the timetable wins over demand
  // Teachers who ride that day also need a trip on their route + shifts (migration 20261114).
  const { data: teacherRides, error: trErr } = await (supabaseAdmin as any)
    .from("teacher_rides")
    .select("route_id, incoming_shift_id, outgoing_shift_id, days, is_active")
    .eq("is_active", true);
  const riding = (trErr ? [] : teacherRides || []).filter((t: any) => t.route_id && (t.days || []).includes(dow));
  if (byClass.size === 0 && riding.length === 0) return null;

  const { data: students } = await supabaseAdmin
    .from("students_full")
    .select("class_id, primary_route_id, primary_stop_id, auto_assigned_stop_id, has_active_subscription, payment_status, transport_access_suspended")
    .not("class_id", "is", null);
  const { data: rs } = await supabaseAdmin.from("route_stops").select("route_id, stop_id");
  const routeOfStop = new Map<string, string>();
  for (const r of rs || []) if (r.stop_id && r.route_id && !routeOfStop.has(r.stop_id)) routeOfStop.set(r.stop_id, r.route_id);

  const demand = new Map<string, Set<string>>();
  for (const s of students || []) {
    if (s.transport_access_suspended) continue;
    if (!(s.has_active_subscription || s.payment_status === "APPROVED" || s.payment_status === "COMPLETED")) continue;
    const sched = byClass.get(s.class_id as string);
    if (!sched || sched.is_today_off) continue;
    const stop = s.auto_assigned_stop_id || s.primary_stop_id;
    const route = s.primary_route_id || (stop ? routeOfStop.get(stop) : undefined);
    if (!route) continue;
    const set = demand.get(route) || new Set<string>();
    if (sched.incoming_shift_id) set.add(sched.incoming_shift_id);
    if (sched.outgoing_shift_id) set.add(sched.outgoing_shift_id);
    demand.set(route, set);
  }
  for (const t of riding) {
    const set = demand.get(t.route_id) || new Set<string>();
    if (t.incoming_shift_id) set.add(t.incoming_shift_id);
    if (t.outgoing_shift_id) set.add(t.outgoing_shift_id);
    demand.set(t.route_id, set);
  }
  return demand;
}
