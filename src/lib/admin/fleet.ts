import { z } from "zod";
import { db } from "@/lib/supabaseClient";
import { cacheDel } from "@/lib/redis";

/**
 * Transport admin writes for buses, routes and special-shift allocations (server-only).
 * Replaces the browser writing these tables through the /api/db proxy. Routes and their stops are
 * saved in one transaction (migration 20261116_admin_routes.sql).
 */

export class AdminError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
type Actor = { userId: string; role: string };

const audit = (actor: Actor, action: string, entity: string, id: string, value?: unknown) =>
  db.from("audit_logs").insert({ user_id: actor.userId, user_role: actor.role, action, entity, entity_id: id, new_value: (value ?? null) as any });

// Caches built from these tables (pickup options, rides) must not serve stale buses/routes.
const bust = () => Promise.all([cacheDel("onboarding:pickup-catalog:v1")]).catch(() => {});

// ── Buses ────────────────────────────────────────────────────────────────
export const busInput = z.object({
  busNumber: z.coerce.number().int().min(1).max(9999),
  registrationNo: z.string().trim().min(2).max(30),
  model: z.string().trim().max(80).optional().nullable(),
  capacity: z.coerce.number().int().min(1).max(120),
  seatLayout: z.string().max(20).optional().nullable(),
  totalRows: z.coerce.number().int().min(1).max(40).optional().nullable(),
  teacherSeatsCount: z.coerce.number().int().min(0).max(20).optional().nullable(),
  status: z.string().trim().min(2).max(20).optional(),
  gpsDeviceId: z.string().trim().max(80).optional().nullable(),
  currentRouteId: z.string().max(128).optional().nullable(),
});
const busRow = (b: Partial<z.infer<typeof busInput>>) => {
  const r: Record<string, unknown> = {};
  if (b.busNumber !== undefined) r.bus_number = b.busNumber;
  if (b.registrationNo !== undefined) r.registration_no = b.registrationNo;
  if (b.model !== undefined) r.model = b.model;
  if (b.capacity !== undefined) r.capacity = b.capacity;
  if (b.seatLayout !== undefined) r.seat_layout = b.seatLayout;
  if (b.totalRows !== undefined) r.total_rows = b.totalRows;
  if (b.teacherSeatsCount !== undefined) r.teacher_seats_count = b.teacherSeatsCount;
  if (b.status !== undefined) r.status = b.status;
  if (b.gpsDeviceId !== undefined) r.gps_device_id = b.gpsDeviceId || null;
  if (b.currentRouteId !== undefined) r.current_route_id = b.currentRouteId || null;
  return r;
};

export async function createBus(input: z.infer<typeof busInput>, actor: Actor) {
  const { data, error } = await db.from("buses").insert(busRow(input) as any).select("id").single();
  if (error) throw new AdminError(error.code === "23505" ? "A bus with that number or registration already exists." : "Could not add the bus.", error.code === "23505" ? 409 : 500);
  await audit(actor, "BUS_CREATED", "Bus", String(data.id), input);
  return { id: data.id as number };
}

export async function updateBus(id: number, input: Partial<z.infer<typeof busInput>>, actor: Actor) {
  const row = busRow(input);
  if (Object.keys(row).length === 0) return;
  const { error } = await db.from("buses").update(row as any).eq("id", id);
  if (error) throw new AdminError(error.code === "23505" ? "A bus with that number or registration already exists." : "Could not save the bus.", error.code === "23505" ? 409 : 500);
  await audit(actor, "BUS_UPDATED", "Bus", String(id), input);
  await bust();
}

export async function deleteBus(id: number, actor: Actor) {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const { data: upcoming } = await db.from("trips").select("id").eq("bus_id", id).gte("trip_date", today).neq("status", "CANCELLED").limit(1);
  if (upcoming?.length) throw new AdminError("This bus has runs today or later. Move them to another bus on the Dispatch board first.", 409);
  const { data: past } = await db.from("trips").select("id").eq("bus_id", id).limit(1);
  if (past?.length) {
    // Keep history: retire the bus instead of deleting it.
    await db.from("buses").update({ status: "INACTIVE", current_route_id: null }).eq("id", id);
    await audit(actor, "BUS_RETIRED", "Bus", String(id));
    return { retired: true };
  }
  const { error } = await db.from("buses").delete().eq("id", id);
  if (error) throw new AdminError("Could not delete the bus.", 500);
  await audit(actor, "BUS_DELETED", "Bus", String(id));
  return { deleted: true };
}

// ── Routes ───────────────────────────────────────────────────────────────
export const routeInput = z.object({
  id: z.string().min(1).max(128),
  code: z.string().trim().max(40).optional().nullable(),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  direction: z.string().max(40).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  totalDistanceKm: z.number().min(0).max(1000).optional().nullable(),
  estimatedDurationMins: z.number().int().min(0).max(1440).optional().nullable(),
  isActive: z.boolean().optional(),
  campusId: z.string().max(128).optional().nullable(),
  stops: z
    .array(z.object({ stopId: z.string().min(1).max(128), stopOrder: z.number().int().optional(), arrivalOffsetMinutes: z.number().int().optional(), bufferTimeMinutes: z.number().int().optional() }))
    .max(200)
    .optional(),
});

export async function saveRoute(input: z.infer<typeof routeInput>, actor: Actor) {
  const route = {
    id: input.id,
    code: input.code ?? null,
    name: input.name,
    description: input.description ?? null,
    direction: input.direction ?? null,
    color: input.color ?? null,
    total_distance_km: input.totalDistanceKm ?? null,
    estimated_duration_mins: input.estimatedDurationMins ?? null,
    is_active: input.isActive ?? null,
    campus_id: input.campusId ?? null,
  };
  const stops = input.stops
    ? input.stops.map((s, i) => ({ stop_id: s.stopId, stop_order: s.stopOrder ?? i + 1, arrival_offset_minutes: s.arrivalOffsetMinutes ?? 0, buffer_time_minutes: s.bufferTimeMinutes ?? 0 }))
    : null;
  const { data: raw, error } = await db.rpc("admin_save_route", { p_route: route, p_stops: stops, p_actor: actor.userId, p_actor_role: actor.role });
  if (error) {
    if (error.code === "PGRST202") throw new AdminError("Saving routes needs the 20261116 database update. Ask the admin to run it.", 503);
    console.error("[admin] save route:", error.message);
    throw new AdminError("Could not save the route.", 500);
  }
  const data = raw as { ok?: boolean; error?: string; id?: string } | null;
  if (!data?.ok) throw new AdminError(data?.error || "Could not save the route.");
  await bust();
  return { id: data.id as string };
}

export async function deleteRoute(id: string, actor: Actor) {
  const { data: raw, error } = await db.rpc("admin_delete_route", { p_route_id: id, p_actor: actor.userId, p_actor_role: actor.role });
  if (error) {
    if (error.code === "PGRST202") throw new AdminError("Deleting routes needs the 20261116 database update. Ask the admin to run it.", 503);
    throw new AdminError("Could not delete the route.", 500);
  }
  const data = raw as { ok?: boolean; error?: string; deleted?: boolean; deactivated?: boolean } | null;
  if (!data?.ok) throw new AdminError(data?.error || "Could not delete the route.", 409);
  await bust();
  return { deleted: data.deleted, deactivated: data.deactivated };
}

// ── Special-shift allocations (placement drives, events) ─────────────────
export async function allocateSpecial(input: { shiftId: string; studentId: string; tripId?: string | null; notes?: string | null }, actor: Actor) {
  const { data: existing } = await db.from("special_shift_allocations").select("id").eq("shift_id", input.shiftId).eq("student_id", input.studentId).maybeSingle();
  if (existing) return { already: true };
  const { error } = await db.from("special_shift_allocations").insert({ shift_id: input.shiftId, student_id: input.studentId, trip_id: input.tripId ?? null, notes: input.notes ?? null, allocated_by: actor.userId });
  if (error) throw new AdminError("Could not add the student.", 500);
  await audit(actor, "SPECIAL_SHIFT_ALLOCATED", "Student", input.studentId, input);
  return { added: true };
}

export async function removeSpecial(shiftId: string, studentId: string, actor: Actor) {
  const { error } = await db.from("special_shift_allocations").delete().eq("shift_id", shiftId).eq("student_id", studentId);
  if (error) throw new AdminError("Could not remove the student.", 500);
  await audit(actor, "SPECIAL_SHIFT_REMOVED", "Student", studentId, { shiftId });
}
