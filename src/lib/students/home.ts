import { db } from "@/lib/supabaseClient";
import { cacheDel, invalidateCachedStudentProfile } from "@/lib/redis";
import { findPickupOptions, resolveChosenPickup, type PickupOption } from "./pickup";

/**
 * Home location and pickup stop after onboarding (Settings → /api/students/home-location). Server-only.
 *
 * Same stop rules as onboarding (lib/students/pickup.ts). Before payment a new stop may change the
 * zone and fee. After payment the zone is locked: only stops in the same zone are accepted, and a
 * zone change goes through the transport office.
 */

export class HomeUpdateError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID") {
    super(message);
  }
}

interface StudentRow {
  id: string;
  user_id: string | null;
  campus_id: string | null;
  zone_id: string | null;
  payment_status: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  home_address: string | null;
  primary_stop_id: string | null;
}

/** `ref` is the student id or the student's user id. */
async function loadStudent(ref: string): Promise<StudentRow | null> {
  const cols = "id, user_id, campus_id, zone_id, payment_status, home_latitude, home_longitude, home_address, primary_stop_id";
  const byId = await db.from("students_full").select(cols).eq("id", ref).maybeSingle();
  if (byId.data) return byId.data as StudentRow;
  const byUser = await db.from("students_full").select(cols).eq("user_id", ref).maybeSingle();
  return (byUser.data as StudentRow) ?? null;
}

export async function getHomeSettings(ref: string) {
  const s = await loadStudent(ref);
  if (!s) throw new HomeUpdateError("Complete onboarding first.", 404, "NO_PROFILE");
  const home =
    s.home_latitude != null && s.home_longitude != null
      ? { latitude: Number(s.home_latitude), longitude: Number(s.home_longitude), address: s.home_address || "" }
      : null;
  const picks = home ? await findPickupOptions(home, s.campus_id) : { options: [] as PickupOption[], defaultStopId: null, outOfServiceArea: false };
  return {
    home,
    stopId: s.primary_stop_id,
    campusId: s.campus_id,
    zoneLocked: s.payment_status === "APPROVED",
    zoneId: s.zone_id,
    ...picks,
  };
}

export async function updateHome(
  ref: string,
  actor: { userId: string; role: string },
  input: { latitude: number; longitude: number; address: string; stopId: string }
): Promise<PickupOption> {
  const s = await loadStudent(ref);
  if (!s) throw new HomeUpdateError("Complete onboarding first.", 404, "NO_PROFILE");
  const home = { latitude: input.latitude, longitude: input.longitude };
  const pickup = await resolveChosenPickup(home, s.campus_id, input.stopId);
  if (!pickup) throw new HomeUpdateError("That stop is not served by a bus route. Choose another stop.");

  const paid = s.payment_status === "APPROVED";
  if (paid && pickup.zoneId !== s.zone_id) {
    throw new HomeUpdateError("Your paid pass is for a different zone. Ask the transport office to change your zone.", 403, "ZONE_LOCKED");
  }
  if (!paid && pickup.zoneId == null) {
    throw new HomeUpdateError("The fee for this stop is not set yet. Choose another stop or contact the transport office.", 400, "NO_ZONE");
  }
  const nearest = await findPickupOptions(home, s.campus_id, 3);

  const { error } = await db
    .from("students")
    .update({
      home_latitude: input.latitude,
      home_longitude: input.longitude,
      home_address: input.address,
      primary_stop_id: pickup.stopId,
      primary_route_id: pickup.routeId,
      auto_assigned_stop_id: nearest.defaultStopId || pickup.stopId,
      ...(paid ? {} : { zone_id: pickup.zoneId }),
    })
    .eq("id", s.id);
  if (error) {
    console.error("[home] update:", error.message);
    throw new HomeUpdateError("Could not save. Please try again.", 500, "SAVE_FAILED");
  }

  await db.from("audit_logs").insert({
    user_id: actor.userId,
    user_role: actor.role,
    action: "STUDENT_PICKUP_STOP_SELECTED",
    entity: "Student",
    entity_id: s.id,
    reason: `Pickup stop set to "${pickup.name}"${pickup.zoneName ? ` (${pickup.zoneName})` : ""}.`,
    previous_value: { primaryStopId: s.primary_stop_id, zoneId: s.zone_id },
    new_value: { primaryStopId: pickup.stopId, zoneId: paid ? s.zone_id : pickup.zoneId },
  });
  await Promise.all([invalidateCachedStudentProfile([s.id, s.user_id]), cacheDel(`student:${s.user_id}`)]);
  return pickup;
}
