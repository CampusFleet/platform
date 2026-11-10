import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import PortalPaymentsView from "@/components/portal/PortalPaymentsView";
import type { Student, TransitZone } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Server Component: Student Subscription & UPI Billing Gateway
 * - Server-side authentication and fee status verification
 * - Queries past payment transactions, transit zones, and fee balances
 * - Delivers pre-rendered HTML with immediate receipt visibility
 */
export default async function SubscriptionsAndBillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/portal/payments");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const hasPaymentCallback = Boolean(
    resolvedSearchParams.razorpay_payment_id ||
    resolvedSearchParams.razorpay_payment_link_id
  );

  const [
    { data: dbStudents },
    { data: dbZones },
  ] = await Promise.all([
    supabaseAdmin.from("students_full").select("*").eq("user_id", session.userId),
    supabaseAdmin.from("transit_zones").select("*").order("code"),
  ]);

  // Only this student's own payment submissions (the legacy `payments` table was dropped).
  const ownStudentId = dbStudents?.[0]?.id;
  const { data: dbPayments } = ownStudentId
    ? await supabaseAdmin
        .from("payment_submissions")
        .select("*")
        .eq("student_id", ownStudentId)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] as any[] };

  const activeStudentRow = dbStudents?.[0];
  const isStudentSubscribed =
    Boolean(activeStudentRow?.has_active_subscription) ||
    activeStudentRow?.payment_status === "APPROVED" ||
    activeStudentRow?.payment_status === "COMPLETED";

  // If new / unsubscribed student visits /portal/payments directly without payment callback params, guide them to Unified Onboarding & Pass Activation
  if (session.role === "student" && !isStudentSubscribed && !hasPaymentCallback) {
    redirect("/portal/onboarding");
  }

  const students: Student[] = (dbStudents || []).map((s: any) => ({
    id: s.id,
    userId: s.user_id || s.id,
    fullName: s.full_name || s.name || "Student",
    email: s.email || "",
    phone: s.phone || "",
    department: s.department || "Computer Science",
    semester: String(s.semester || "4"),
    zoneCode: s.zone_code || "ZONE_B",
    primaryStopId: s.primary_stop_id || s.stop_id || "",
    primaryRouteId: s.primary_route_id || s.route_id || "",
    campusId: s.campus_id || s.campus || "",
    campus: s.campus || "",
    emergencyContact: {
      name: s.emergency_contact_name || "Parent/Guardian",
      relationship: "Parent",
      phone: s.emergency_contact_phone || s.phone || "+91 9876543210",
    },
    transportAccessSuspended: Boolean(s.transport_access_suspended),
    hasActiveSubscription: Boolean(s.has_active_subscription),
    subscriptionExpiryDate: s.subscription_expiry_date || "2026-12-31",
    classId: s.class_id,
    className: s.class_name,
    paymentStatus: s.payment_status || "UNPAID",
    totalFeeDue: Number(s.total_fee_due) || 0,
    totalFeePaid: Number(s.total_fee_paid) || 0,
  }));

  const zones: TransitZone[] = (dbZones || []).map((z: any) => ({
    id: z.id,
    campusId: z.campus_id,
    code: z.code,
    name: z.name,
    corridorDescription: z.corridor_description || z.description || "",
    semesterFee: Number(z.semester_fee) || 14000,
    installmentsAllowed: Number(z.installments_allowed) || 3,
    isActive: z.is_active ?? true,
  }));

  return (
    <PortalPaymentsView
      initialUser={session}
      initialStudents={students}
      initialPayments={dbPayments || []}
      initialZones={zones}
    />
  );
}
