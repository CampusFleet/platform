import { supabaseAdmin } from "@/lib/supabaseClient";
import { isBoardingMethodOn } from "@/lib/attendance/server-policy";

/** Student has active face templates under a consent that is not withdrawn. Server-only. */
export async function hasActiveFaceId(studentId: string): Promise<boolean> {
  const [{ data: consent }, { count }] = await Promise.all([
    supabaseAdmin
      .from("biometric_consents")
      .select("withdrawn_at")
      .eq("student_id", studentId)
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin.from("face_templates").select("id", { count: "exact", head: true }).eq("student_id", studentId).is("revoked_at", null),
  ]);
  return Boolean(consent && !consent.withdrawn_at) && (count || 0) > 0;
}

/**
 * Face ID is required to activate a pass while camera (Face ID) boarding is switched on in
 * transport_settings.validation_locks, because the door cameras can only check in enrolled riders.
 */
export async function faceIdRequiredButMissing(studentId: string): Promise<boolean> {
  if (!(await isBoardingMethodOn("faceId"))) return false;
  return !(await hasActiveFaceId(studentId));
}
