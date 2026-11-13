import { db } from "@/lib/supabaseClient";

/**
 * Server-side semester fee for a student. Server-only.
 * The fee is the student's zone fee (zone code + campus), else students_full.total_fee_due.
 * Used by the payments page and by POST /api/payments/razorpay/create-link, so the amount
 * a student sees is the amount they are charged. Returns null when no fee is set.
 */
export async function getSemesterFee(row: {
  zone_code: string | null;
  campus_id: string | null;
  total_fee_due: number | null;
}): Promise<number | null> {
  if (row.zone_code) {
    let q = db.from("transit_zones").select("semester_fee").eq("code", row.zone_code);
    if (row.campus_id) q = q.eq("campus_id", row.campus_id);
    const { data } = await q.limit(1).maybeSingle();
    if (data?.semester_fee) return Number(data.semester_fee);
  }
  const due = Number(row.total_fee_due);
  return due > 0 ? due : null;
}
