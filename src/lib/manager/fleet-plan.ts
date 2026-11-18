import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseClient";

/**
 * Standing fleet plan (server-only), edited on two manager pages:
 *   /transport-manager/bus-routes  bus → route   (buses.current_route_id, rpc set_bus_route)
 *   /transport-manager/crew        staff → bus   (bus_crew_assignments, rpc set_bus_crew)
 * The nightly rollover plans each day from these. One-off changes for a single run stay on the
 * dispatch board (/transport-manager/trips). Migration 20261122_fleet_assignments.sql.
 */

export interface PlanBus {
  id: number;
  number: number;
  registrationNo: string | null;
  capacity: number | null;
  status: string | null;
  routeId: string | null;
  driverId: string | null;
  conductorId: string | null;
  /** Today's runs of this bus (shift label + who is on it), for the impact preview. */
  today: { tripId: string; shift: string; start: string | null; status: string; driverId: string | null; conductorId: string | null }[];
}
export interface PlanStaff {
  id: string;
  name: string;
  role: "driver" | "conductor";
  phone: string | null;
  licenseNo: string | null;
}
export interface PlanRoute {
  id: string;
  name: string;
  stops: number;
  riders: number;
}
export interface FleetPlan {
  ready: boolean; // false until migration 20261122 is applied
  buses: PlanBus[];
  staff: PlanStaff[];
  routes: PlanRoute[];
}

const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const db = supabaseAdmin as any; // bus_crew_assignments / rpcs are not in database.types until regenerated

export async function getFleetPlan(): Promise<FleetPlan> {
  const [buses, crew, staff, routes, stops, riders, trips] = await Promise.all([
    supabaseAdmin.from("buses").select("id, bus_number, registration_no, capacity, status, current_route_id").order("bus_number"),
    db.from("bus_crew_assignments").select("bus_id, driver_id, conductor_id"),
    supabaseAdmin.from("staff").select("id, full_name, role, phone, license_no, is_active").in("role", ["driver", "conductor"]).order("full_name"),
    supabaseAdmin.from("routes").select("id, name, is_active").eq("is_active", true).order("name"),
    supabaseAdmin.from("route_stops").select("route_id"),
    supabaseAdmin.from("students").select("primary_route_id").not("primary_route_id", "is", null),
    supabaseAdmin
      .from("trips")
      .select("id, bus_id, status, driver_id, conductor_id, shift:shifts(name, start_time)")
      .eq("trip_date", todayIst())
      .neq("status", "CANCELLED")
      .not("bus_id", "is", null),
  ]);
  const crewBy = new Map<number, { driver_id: string | null; conductor_id: string | null }>(
    ((crew.data || []) as any[]).map((c) => [c.bus_id, c])
  );
  const count = (rows: { [k: string]: any }[] | null, key: string) => {
    const m = new Map<string, number>();
    for (const r of rows || []) if (r[key]) m.set(r[key], (m.get(r[key]) || 0) + 1);
    return m;
  };
  const stopCount = count(stops.data, "route_id");
  const riderCount = count(riders.data, "primary_route_id");
  const runsBy = new Map<number, PlanBus["today"]>();
  for (const t of (trips.data || []) as any[]) {
    const list = runsBy.get(t.bus_id) || [];
    list.push({
      tripId: t.id,
      shift: t.shift?.name || "Shift",
      start: (t.shift?.start_time || "").slice(0, 5) || null,
      status: t.status || "SCHEDULED",
      driverId: t.driver_id,
      conductorId: t.conductor_id,
    });
    runsBy.set(t.bus_id, list);
  }
  runsBy.forEach((l) => l.sort((a, b) => String(a.start).localeCompare(String(b.start))));

  return {
    ready: !crew.error,
    buses: (buses.data || []).map((b) => ({
      id: b.id,
      number: b.bus_number,
      registrationNo: b.registration_no,
      capacity: b.capacity,
      status: b.status,
      routeId: b.current_route_id,
      driverId: crewBy.get(b.id)?.driver_id ?? null,
      conductorId: crewBy.get(b.id)?.conductor_id ?? null,
      today: runsBy.get(b.id) || [],
    })),
    staff: (staff.data || [])
      .filter((s) => s.is_active !== false)
      .map((s) => ({ id: s.id, name: s.full_name || "Name not set", role: s.role as PlanStaff["role"], phone: s.phone, licenseNo: s.license_no })),
    routes: (routes.data || []).map((r) => ({ id: r.id, name: r.name || "Route", stops: stopCount.get(r.id) || 0, riders: riderCount.get(r.id) || 0 })),
  };
}

export const fleetPlanAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ROUTE"), busId: z.number().int(), routeId: z.string().max(128).nullable() }),
  z.object({
    action: z.literal("CREW"),
    busId: z.number().int(),
    driverId: z.string().max(128).nullable(),
    conductorId: z.string().max(128).nullable(),
    applyToday: z.boolean().default(true),
  }),
]);
export type FleetPlanAction = z.infer<typeof fleetPlanAction>;

export type FleetPlanResult =
  | { ok: true; runsUpdated?: number; otherRunsChanged?: number; movedFrom?: { bus: number; staff: string }[] }
  | { ok: false; error: string; status: number };

export async function runFleetPlanAction(a: FleetPlanAction, actor: { userId: string; role: string }): Promise<FleetPlanResult> {
  const { data, error } =
    a.action === "ROUTE"
      ? await db.rpc("set_bus_route", { p_bus_id: a.busId, p_route_id: a.routeId ?? "", p_actor: actor.userId, p_actor_role: actor.role })
      : await db.rpc("set_bus_crew", {
          p_bus_id: a.busId,
          p_driver_id: a.driverId ?? "",
          p_conductor_id: a.conductorId ?? "",
          p_apply_today: a.applyToday,
          p_actor: actor.userId,
          p_actor_role: actor.role,
        });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, error: "This page needs the 20261122 database update. Ask the admin to run it.", status: 503 };
    console.error("[fleet-plan]", a.action, error.message);
    return { ok: false, error: "Could not save the change.", status: 500 };
  }
  if (!data?.ok) return { ok: false, error: data?.error || "Could not save the change.", status: 409 };
  return { ok: true, runsUpdated: data.runsUpdated, otherRunsChanged: data.otherRunsChanged, movedFrom: data.movedFrom };
}
