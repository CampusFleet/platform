import { z } from "zod";
import { db } from "@/lib/supabaseClient";
import { createStudentId } from "@/lib/id";
import { cacheDel, invalidateCachedStudentProfile } from "@/lib/redis";
import { findPickupOptions, resolveChosenPickup, type PickupOption } from "./pickup";

/**
 * Onboarding save (POST /api/students/onboarding). Server-only.
 *
 * Creates or updates the signed-in student's row with details, class, home and pickup stop in one
 * upsert. Semester and campus name come from the chosen class and campus rows; zone, fee and route
 * come from the chosen stop on the server. Nothing here trusts a fee, zone or student id from the client.
 */

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{8,14}$/, "Enter a valid phone number");

export const onboardingInput = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(100),
  phone,
  studentIdCode: z.string().trim().max(30).optional().default(""),
  campusId: z.string().trim().min(1, "Choose your campus").max(80),
  classId: z.string().uuid("Choose your class"),
  emergencyName: z.string().trim().min(2, "Enter an emergency contact").max(100),
  emergencyPhone: phone,
  home: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().trim().min(3, "Enter your home address").max(300),
  }),
  stopId: z.string().trim().min(1, "Choose a pickup stop").max(80),
});
export type OnboardingInput = z.infer<typeof onboardingInput>;

export class OnboardingError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID") {
    super(message);
  }
}

export interface OnboardingResult {
  studentId: string;
  pickup: PickupOption;
}

export async function saveOnboarding(user: { userId: string; email?: string }, input: OnboardingInput): Promise<OnboardingResult> {
  const { data: existing } = await db
    .from("students_full")
    .select("id, payment_status")
    .eq("user_id", user.userId)
    .maybeSingle();
  if ((existing as { payment_status?: string | null } | null)?.payment_status === "APPROVED") {
    throw new OnboardingError("Your pass is already active. Change your details in Settings.", 409, "ALREADY_ACTIVE");
  }

  const [{ data: cls }, { data: campus }] = await Promise.all([
    db.from("v_classes_expanded").select("id, campus_id, semester, is_active").eq("id", input.classId).maybeSingle(),
    db.from("campuses").select("id, name, is_active").eq("id", input.campusId).maybeSingle(),
  ]);
  if (!campus || campus.is_active === false) throw new OnboardingError("Choose your campus.");
  if (!cls || cls.is_active === false) throw new OnboardingError("Choose your class.");
  if (cls.campus_id && cls.campus_id !== campus.id) throw new OnboardingError("That class is not on the selected campus.");

  const home = { latitude: input.home.latitude, longitude: input.home.longitude };
  const pickup = await resolveChosenPickup(home, campus.id, input.stopId);
  if (!pickup) throw new OnboardingError("That pickup stop is not served by a bus route. Choose another stop.");
  if (pickup.zoneId == null || pickup.semesterFee == null) {
    throw new OnboardingError("The fee for this stop is not set yet. Choose another stop or contact the transport office.", 400, "NO_ZONE");
  }
  const nearest = await findPickupOptions(home, campus.id, 3);

  const studentId = (existing as { id?: string } | null)?.id || createStudentId();
  const row = {
    id: studentId,
    user_id: user.userId,
    full_name: input.fullName,
    campus_id: campus.id,
    campus: campus.name,
    class_id: cls.id,
    semester: cls.semester,
    zone_id: pickup.zoneId,
    primary_stop_id: pickup.stopId,
    primary_route_id: pickup.routeId,
    auto_assigned_stop_id: nearest.defaultStopId || pickup.stopId,
    home_latitude: home.latitude,
    home_longitude: home.longitude,
    home_address: input.home.address,
    emergency_contact: { name: input.emergencyName, relationship: "Parent / Guardian", phone: input.emergencyPhone },
    ...(input.studentIdCode ? { student_id_code: input.studentIdCode.toUpperCase() } : {}),
  };

  const { error: sErr } = await db.from("students").upsert(row, { onConflict: "user_id" });
  if (sErr) {
    if (sErr.code === "23505") throw new OnboardingError("That university ID is already registered to another account.", 409, "DUPLICATE_ID");
    console.error("[onboarding] students upsert:", sErr.message);
    throw new OnboardingError("Could not save your details. Please try again.", 500, "SAVE_FAILED");
  }
  // The users row always exists for a signed-in user. If this update fails the next save repeats it.
  const { error: uErr } = await db
    .from("users")
    .update({ full_name: input.fullName, phone: input.phone, campus_id: campus.id })
    .eq("id", user.userId);
  if (uErr) console.error("[onboarding] users update:", uErr.message);

  await Promise.all([
    invalidateCachedStudentProfile([user.userId, studentId, user.email?.toLowerCase()]),
    cacheDel(`student:${user.userId}`),
  ]);
  return { studentId, pickup };
}
