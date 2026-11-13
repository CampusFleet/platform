import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { db } from "@/lib/supabaseClient";
import { isSubscriptionRowActive } from "@/lib/student-access";
import { getSemesterFee } from "@/lib/students/fees";
import PortalPaymentsView, { type PaymentsData } from "@/components/portal/PortalPaymentsView";

export const dynamic = "force-dynamic";

/**
 * Pass and payments. Everything is read on the server for the signed-in student; the fee comes from
 * getSemesterFee (the same helper create-link charges with). Missing values are null and shown as "Not set".
 * Students without a paid pass go to onboarding, except when returning from Razorpay.
 */
export default async function PaymentsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/portal/payments");
  const params = searchParams ? await searchParams : {};
  const isPaymentReturn = Boolean(params.razorpay_payment_id || params.razorpay_payment_link_id);

  const { data: s } = await db
    .from("students_full")
    .select("id, full_name, zone_id, zone_code, campus_id, total_fee_due, total_fee_paid, has_active_subscription, payment_status, transport_access_suspended, subscription_expiry_date, primary_stop_name, primary_route_name")
    .eq("user_id", session.userId)
    .limit(1)
    .maybeSingle();

  const isActive = s ? isSubscriptionRowActive(s) : false;
  if (session.role === "student" && !isActive && !isPaymentReturn) redirect("/portal/onboarding");

  const [zoneRes, historyRes, fee] = await Promise.all([
    s?.zone_id ? db.from("transit_zones").select("name").eq("id", s.zone_id).maybeSingle() : Promise.resolve({ data: null }),
    s?.id
      ? db.from("payment_submissions").select("id, created_at, amount, status, transaction_id, receipt_number").eq("student_id", s.id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as never[] }),
    s ? getSemesterFee(s) : Promise.resolve(null),
  ]);

  const paid = Number(s?.total_fee_paid) || 0;
  const data: PaymentsData = {
    studentId: s?.id ?? null,
    fullName: s?.full_name ?? null,
    isActive,
    expiry: s?.subscription_expiry_date ?? null,
    zoneName: (zoneRes.data as { name: string | null } | null)?.name ?? s?.zone_code ?? null,
    stopName: s?.primary_stop_name ?? null,
    routeName: s?.primary_route_name ?? null,
    fee,
    paid,
    due: fee != null ? Math.max(0, fee - paid) : null,
    history: (historyRes.data || []).map((p) => ({
      id: p.id,
      createdAt: p.created_at,
      amount: Number(p.amount) || 0,
      status: p.status || "PENDING",
      reference: p.receipt_number || p.transaction_id || null,
    })),
  };

  return <PortalPaymentsView data={data} />;
}
