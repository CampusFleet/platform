import { z } from "zod";
import { db } from "@/lib/supabaseClient";
import { createTripId } from "@/lib/id";
import { getFleetLive } from "./fleet-live";

/**
 * Transport manager dispatch board (server-only): today's (or a chosen date's) runs plus the
 * buses, drivers, conductors, routes and shifts to choose from. Changes go through the Postgres
 * functions in migration 20261115_manager_dispatch.sql so a run, its riders and the audit log
 * change together, with overlap checks for bus and crew.
 */

export const dispatchAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    tripId: z.string().min(1).max(128),
    busId: z.number().int().nullable(),
    driverId: z.string().max(128).nullable(),
    conductorId: z.string().max(128).nullable(),
  }),
  z.object({
    action: z.literal("ADD"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    routeId: z.string().min(1).max(128),
    shiftId: z.string().min(1).max(128),
    busId: z.number().int().nullable(),
    driverId: z.string().max(128).nullable(),
    conductorId: z.string().max(128).nullable(),
    isSpecial: z.boolean().optional(),
    facilityType: z.string().max(40).optional(),
  }),
  z.object({ action: z.literal("CANCEL"), tripId: z.string().min(1).max(128), reason: z.string().max(300).optional() }),
]);
export type DispatchAction = z.infer<typeof dispatchAction>;

export async function getDispatchBoard(date: string) {
  const [runs, buses, staff, routes, shifts] = await Promise.all([
    getFleetLive(date),
    db.from("buses").select("id, bus_number, registration_no, capacity, status, current_route_id").order("bus_number"),
    db.from("staff").select("id, full_name, role, is_active, phone").in("role", ["driver", "conductor"]).order("full_name"),
    db.from("routes").select("id, name, is_active").eq("is_active", true).order("name"),
    db.from("shifts").select("id, name, start_time, end_time, direction, is_active").eq("is_active", true).order("start_time"),
  ]);
  const active = (staff.data || []).filter((s) => s.is_active !== false);
  return {
    date,
    runs,
    buses: (buses.data || []).filter((b) => b.status !== "MAINTENANCE").map((b) => ({ id: b.id, number: b.bus_number, registrationNo: b.registration_no, capacity: b.capacity, status: b.status, routeId: b.current_route_id })),
    drivers: active.filter((s) => s.role === "driver").map((s) => ({ id: s.id, name: s.full_name || "Driver" })),
    conductors: active.filter((s) => s.role === "conductor" || s.role === "driver").map((s) => ({ id: s.id, name: s.full_name || "Staff", role: s.role })),
    routes: (routes.data || []).map((r) => ({ id: r.id, name: r.name || "Route" })),
    shifts: (shifts.data || []).map((s) => ({ id: s.id, name: s.name || "Shift", start: (s.start_time || "").slice(0, 5) || null, end: (s.end_time || "").slice(0, 5) || null, direction: s.direction })),
  };
}

export class DispatchError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function runDispatchAction(a: DispatchAction, actor: { userId: string; role: string }) {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await (db as any).rpc(fn, args);
    if (error) {
      if (error.code === "PGRST202" || /function .* does not exist/i.test(error.message)) {
        throw new DispatchError("Dispatch changes need the 20261115 database update. Ask the admin to run it.", 503);
      }
      console.error(`[dispatch] ${fn}:`, error.message);
      throw new DispatchError("Could not save the change.", 500);
    }
    if (!data?.ok) throw new DispatchError(data?.error || "Could not save the change.", 409);
    return data;
  };
  if (a.action === "UPDATE") {
    return call("manager_update_run", { p_trip_id: a.tripId, p_bus_id: a.busId, p_driver_id: a.driverId || "", p_conductor_id: a.conductorId || "", p_actor: actor.userId, p_actor_role: actor.role });
  }
  if (a.action === "ADD") {
    const res = await call("manager_add_run", { p_trip_id: createTripId(), p_date: a.date, p_route_id: a.routeId, p_shift_id: a.shiftId, p_bus_id: a.busId, p_driver_id: a.driverId || "", p_conductor_id: a.conductorId || "", p_actor: actor.userId, p_actor_role: actor.role });
    if (a.isSpecial || a.facilityType) {
      await db.from("trips").update({ is_special: Boolean(a.isSpecial), facility_type: a.facilityType || null } as any).eq("id", res.tripId);
    }
    return res;
  }
  return call("manager_cancel_run", { p_trip_id: a.tripId, p_reason: a.reason || "", p_actor: actor.userId, p_actor_role: actor.role });
}
