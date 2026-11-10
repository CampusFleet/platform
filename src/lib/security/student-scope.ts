import { supabaseAdmin } from "@/lib/supabaseClient";
import type { SessionPayload } from "@/lib/jwt";
import { isSafeId } from "@/lib/security/safe-id";

/** Roles allowed to act on any student's record. */
export const STUDENT_ADMIN_ROLES = ["admin", "transport_admin", "transport_manager"];

export type StudentScope =
  | { ok: true; studentId: string; userId: string | null; isAdmin: boolean }
  | { ok: false; status: number; error: string };

/**
 * Resolves which student record a request may act on.
 *
 * - Transport admins/managers may target any student via `requestedId`
 *   (students.id or users.id), validated against filter injection.
 * - Everyone else is always scoped to their own students row, whatever ID the
 *   request supplies. A different requested ID is rejected (prevents IDOR).
 */
export async function resolveStudentScope(
  session: SessionPayload | null,
  requestedId?: string | null
): Promise<StudentScope> {
  if (!session) return { ok: false, status: 401, error: "Authentication required." };
  const isAdmin = STUDENT_ADMIN_ROLES.includes(session.role);

  if (isAdmin && requestedId) {
    if (!isSafeId(requestedId)) return { ok: false, status: 400, error: "Invalid student identifier." };
    const { data } = await supabaseAdmin
      .from("students")
      .select("id, user_id")
      .or(`id.eq.${requestedId},user_id.eq.${requestedId}`)
      .limit(1)
      .maybeSingle();
    if (!data) return { ok: false, status: 404, error: "Student not found." };
    return { ok: true, studentId: data.id, userId: data.user_id, isAdmin };
  }

  const { data: own } = await supabaseAdmin
    .from("students")
    .select("id, user_id")
    .eq("user_id", session.userId)
    .maybeSingle();
  if (!own) return { ok: false, status: 404, error: "No student profile for this account." };
  if (requestedId && requestedId !== own.id && requestedId !== own.user_id) {
    return { ok: false, status: 403, error: "You can only access your own student record." };
  }
  return { ok: true, studentId: own.id, userId: own.user_id, isAdmin };
}
