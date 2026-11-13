import type { SessionPayload } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";

/**
 * Who is calling an API route, resolved from the session only.
 * Routes must never trust a studentId / userId / role sent in the request body.
 */
export const MANAGE_ROLES = ["admin", "transport_admin", "transport_manager"] as const;
export const CREW_ROLES = ["conductor", "driver"] as const;
export const STAFF_ROLES = [...MANAGE_ROLES, ...CREW_ROLES] as const;

export function isManageRole(role: string): boolean {
  return (MANAGE_ROLES as readonly string[]).includes(role);
}

export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/** The students.id that belongs to the signed-in user, or null if there is no student row. */
export async function getOwnStudentId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("students").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

/**
 * Resolves the student a request may act on.
 * Staff may act on the requested student; everyone else only on themselves.
 */
export async function resolveActingStudentId(
  session: SessionPayload,
  requestedStudentId: string | null | undefined
): Promise<{ studentId: string | null; isStaff: boolean }> {
  if (isStaffRole(session.role)) return { studentId: requestedStudentId || null, isStaff: true };
  return { studentId: await getOwnStudentId(session.userId), isStaff: false };
}
