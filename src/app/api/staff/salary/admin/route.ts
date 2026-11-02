import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff/salary/admin
 * Admin dashboard data for staff payroll, role base salary benchmarks, and disbursement history
 */
export async function GET(req: NextRequest) {
  try {
    const [
      { data: staffList, error: staffErr },
      { data: roleDefaults, error: defaultsErr },
      { data: recentPayouts, error: payoutsErr },
    ] = await Promise.all([
      supabaseAdmin
        .from("staff_payroll_full")
        .select("*")
        .order("role", { ascending: true })
        .order("full_name", { ascending: true }),
      supabaseAdmin
        .from("role_salary_defaults")
        .select("*")
        .order("role", { ascending: true }),
      supabaseAdmin
        .from("staff_salary_payouts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (staffErr) {
      console.error("Error fetching staff_payroll_full:", staffErr);
      return NextResponse.json({ success: false, error: staffErr.message }, { status: 500 });
    }

    const mappedStaff = (staffList || []).map((s: any) => ({
      staffId: s.staff_id,
      userId: s.user_id,
      employeeCode: s.employee_code,
      fullName: s.full_name,
      email: s.email,
      photoUrl: s.photo_url || null,
      licenseNo: s.license_no || null,
      role: s.role,
      category: s.category,
      isActive: Boolean(s.is_active ?? true),
      staffCreatedAt: s.staff_created_at,
      baseSalary: Number(s.base_salary || 20000),
      paymentFrequency: s.payment_frequency || "MONTHLY",
      payoutMethod: s.payout_method || "BANK_ACCOUNT",
      accountHolderName: s.account_holder_name || s.full_name,
      bankName: s.bank_name || "State Bank of India",
      bankIfsc: s.bank_ifsc || "SBIN0000726",
      bankAccountMasked: s.bank_account_masked,
      upiIdMasked: s.upi_id_masked,
      isPayoutConfigured: Boolean(s.is_payout_configured),
      isVerified: Boolean(s.is_verified),
      activeBonusAmount: Number(s.active_bonus_amount || 0),
      activeBonusReason: s.active_bonus_reason,
      netPayable: Number(s.net_payable || (Number(s.base_salary || 20000) + Number(s.active_bonus_amount || 0))),
      completedTripsMonth: Number(s.completed_trips_month || 0),
      totalPaidYtd: Number(s.total_paid_ytd || 0),
      lastPayoutAt: s.last_payout_at,
      lastPayoutAmount: s.last_payout_amount ? Number(s.last_payout_amount) : null,
      lastPayoutStatus: s.last_payout_status,
    }));

    // Computed Stats
    const totalMonthlyObligation = mappedStaff.reduce((acc, s) => {
      // Normalize daily/weekly to monthly equivalent for KPI overview
      let monthlyEquiv = s.baseSalary;
      if (s.paymentFrequency === "DAILY") monthlyEquiv = s.baseSalary * 26;
      else if (s.paymentFrequency === "WEEKLY") monthlyEquiv = s.baseSalary * 4;
      return acc + monthlyEquiv;
    }, 0);

    const configuredCount = mappedStaff.filter((s) => s.isPayoutConfigured).length;

    const currentMonthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const disbursedThisMonth = (recentPayouts || [])
      .filter((p: any) => p.status === "PAID" && p.created_at?.startsWith(currentMonthPrefix))
      .reduce((acc: number, p: any) => acc + Number(p.net_amount || 0), 0);

    return NextResponse.json({
      success: true,
      stats: {
        totalStaffCount: mappedStaff.length,
        configuredCount,
        unconfiguredCount: mappedStaff.length - configuredCount,
        totalMonthlyObligation,
        disbursedThisMonth,
        driverCount: mappedStaff.filter((s) => s.role === "driver").length,
        conductorCount: mappedStaff.filter((s) => s.role === "conductor").length,
        managerCount: mappedStaff.filter((s) => s.role === "transport_manager").length,
        adminCount: mappedStaff.filter((s) => s.role === "transport_admin" || s.role === "admin").length,
      },
      staffList: mappedStaff,
      roleDefaults: roleDefaults || [],
      recentPayouts: recentPayouts || [],
    });
  } catch (err: any) {
    console.error("GET /api/staff/salary/admin error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load admin payroll data." },
      { status: 500 }
    );
  }
}
