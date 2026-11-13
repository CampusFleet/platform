import { db as supabaseAdmin } from "@/lib/supabaseClient";

/**
 * The single rule for "may this student use the transport pass right now?".
 * Used by the portal layout (redirects) and the onboarding layout, so the two can never disagree
 * (that disagreement caused the onboarding ↔ portal redirect flicker).
 * Reads the database directly; no Redis or browser state is involved.
 */
export interface StudentAccess {
  studentId: string | null;
  isSubscribed: boolean;
  photoUrl: string | null;
}

export function isSubscriptionRowActive(row: {
  has_active_subscription?: boolean | null;
  payment_status?: string | null;
  transport_access_suspended?: boolean | null;
  subscription_expiry_date?: string | null;
}): boolean {
  if (row.transport_access_suspended) return false;
  const paid = Boolean(row.has_active_subscription) || row.payment_status === "APPROVED" || row.payment_status === "COMPLETED";
  if (!paid) return false;
  if (row.subscription_expiry_date) {
    const expiry = new Date(row.subscription_expiry_date).getTime();
    if (!isNaN(expiry) && Date.now() > expiry) return false;
  }
  return true;
}

export async function getStudentAccess(userId: string): Promise<StudentAccess> {
  const { data } = await supabaseAdmin
    .from("students_full")
    .select("id, has_active_subscription, payment_status, transport_access_suspended, subscription_expiry_date, photo_url")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) return { studentId: null, isSubscribed: false, photoUrl: null };
  return { studentId: data.id, isSubscribed: isSubscriptionRowActive(data), photoUrl: data.photo_url || null };
}
