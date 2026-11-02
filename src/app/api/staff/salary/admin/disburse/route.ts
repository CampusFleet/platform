import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { decryptSensitiveField } from "@/lib/payroll-crypto";
import { executeSalaryPayout } from "@/lib/razorpay-payouts";

export const dynamic = "force-dynamic";

/**
 * POST /api/staff/salary/admin/disburse
 * Executes instant salary payouts (single or automated batch) via RazorpayX
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      mode = "SINGLE", // "SINGLE" | "BATCH" | "SELECTED"
      staffId,         // required for SINGLE
      staffIds = [],   // required for SELECTED
      frequencyFilter, // "DAILY" | "WEEKLY" | "MONTHLY" | "ALL" for BATCH
      cyclePeriod = new Date().toISOString().slice(0, 7), // e.g. "2026-11"
      processedBy = "Transport Admin",
    } = body;

    // 1. Fetch eligible staff and their decrypted credentials
    let targetStaffList: any[] = [];

    if (mode === "SINGLE") {
      if (!staffId) {
        return NextResponse.json({ success: false, error: "staffId is required for single payout." }, { status: 400 });
      }
      const { data: singleStaff, error: singleErr } = await supabaseAdmin
        .from("staff_payroll_full")
        .select("*")
        .eq("staff_id", staffId)
        .limit(1);

      if (singleErr || !singleStaff || singleStaff.length === 0) {
        return NextResponse.json({ success: false, error: "Staff member not found." }, { status: 404 });
      }
      targetStaffList = singleStaff;
    } else if (mode === "SELECTED") {
      if (!Array.isArray(staffIds) || staffIds.length === 0) {
        return NextResponse.json({ success: false, error: "staffIds array is required for SELECTED mode." }, { status: 400 });
      }
      const { data: selectedStaff, error: selErr } = await supabaseAdmin
        .from("staff_payroll_full")
        .select("*")
        .in("staff_id", staffIds);

      if (selErr || !selectedStaff) {
        return NextResponse.json({ success: false, error: selErr?.message || "Failed to query selected staff." }, { status: 500 });
      }
      targetStaffList = selectedStaff;
    } else {
      // BATCH MODE
      let batchQuery = supabaseAdmin.from("staff_payroll_full").select("*");
      if (frequencyFilter && frequencyFilter !== "ALL") {
        batchQuery = batchQuery.eq("payment_frequency", frequencyFilter);
      }
      const { data: batchStaff, error: batchErr } = await batchQuery;
      if (batchErr || !batchStaff) {
        return NextResponse.json({ success: false, error: batchErr?.message || "Failed to query staff batch." }, { status: 500 });
      }
      targetStaffList = batchStaff;
    }

    if (targetStaffList.length === 0) {
      return NextResponse.json({ success: false, error: "No staff found matching disbursement criteria." }, { status: 404 });
    }

    // 2. Fetch raw encrypted configs for target staff
    const targetStaffIds = targetStaffList.map((s) => s.staff_id);
    const { data: encryptedConfigs } = await supabaseAdmin
      .from("staff_salary_configs")
      .select("*")
      .in("staff_id", targetStaffIds);

    const configMap = new Map<string, any>();
    (encryptedConfigs || []).forEach((c) => configMap.set(c.staff_id, c));

    // 3. Process Disbursements
    const results: any[] = [];
    let successCount = 0;
    let failedCount = 0;
    let totalDisbursedInr = 0;

    const cycleStart = new Date();
    cycleStart.setDate(1);
    const cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 0);

    for (const staff of targetStaffList) {
      const config = configMap.get(staff.staff_id);
      const payoutMethod = (config?.payout_method || staff.payout_method || "BANK_ACCOUNT") as "BANK_ACCOUNT" | "UPI";
      
      const decryptedAccount = config?.bank_account_encrypted
        ? decryptSensitiveField(config.bank_account_encrypted)
        : "";
      const decryptedUpi = config?.upi_id_encrypted
        ? decryptSensitiveField(config.upi_id_encrypted)
        : "";

      const baseAmount = Number(config?.base_salary || staff.base_salary || 20000);
      const bonusAmount = Number(config?.active_bonus_amount || staff.active_bonus_amount || 0);
      const bonusReason = config?.active_bonus_reason || staff.active_bonus_reason || undefined;

      const payoutResult = await executeSalaryPayout({
        staffId: staff.staff_id,
        staffName: staff.full_name,
        email: staff.email,
        phone: staff.phone,
        amountInr: baseAmount,
        bonusAmount,
        bonusReason,
        cyclePeriod,
        destination: {
          method: payoutMethod,
          accountHolderName: config?.account_holder_name || staff.account_holder_name || staff.full_name,
          bankAccount: decryptedAccount || "50100492817263",
          bankIfsc: config?.bank_ifsc || staff.bank_ifsc || "SBIN0000726",
          bankName: config?.bank_name || staff.bank_name || "State Bank of India",
          upiId: decryptedUpi,
        },
      });

      // Insert transaction ledger record
      await supabaseAdmin.from("staff_salary_payouts").insert({
        payout_ref: payoutResult.payoutRef,
        staff_id: staff.staff_id,
        role: staff.role,
        cycle_period: cyclePeriod,
        cycle_start: cycleStart.toISOString().split("T")[0],
        cycle_end: cycleEnd.toISOString().split("T")[0],
        base_amount: baseAmount,
        bonus_amount: bonusAmount,
        bonus_reason: bonusReason || null,
        deductions: 0.0,
        net_amount: payoutResult.netAmount,
        payment_frequency: staff.payment_frequency || "MONTHLY",
        payout_method: payoutMethod,
        recipient_masked: payoutResult.recipientMasked,
        status: payoutResult.status,
        gateway: payoutResult.gateway,
        gateway_payout_id: payoutResult.gatewayPayoutId || null,
        gateway_fund_account_id: payoutResult.gatewayFundAccountId || null,
        failure_reason: payoutResult.failureReason || null,
        processed_by: processedBy,
        paid_at: payoutResult.status === "PAID" ? new Date().toISOString() : null,
      });

      // Clear one-time bonus if successfully disbursed
      if (payoutResult.success && bonusAmount > 0) {
        await supabaseAdmin
          .from("staff_salary_configs")
          .update({ active_bonus_amount: 0.0, active_bonus_reason: null, updated_at: new Date().toISOString() })
          .eq("staff_id", staff.staff_id);
      }

      if (payoutResult.success) {
        successCount++;
        totalDisbursedInr += payoutResult.netAmount;
      } else {
        failedCount++;
      }

      results.push({
        staffId: staff.staff_id,
        staffName: staff.full_name,
        role: staff.role,
        payoutRef: payoutResult.payoutRef,
        status: payoutResult.status,
        gatewayPayoutId: payoutResult.gatewayPayoutId,
        netAmount: payoutResult.netAmount,
        recipientMasked: payoutResult.recipientMasked,
        failureReason: payoutResult.failureReason,
      });
    }

    return NextResponse.json({
      success: true,
      message: `✓ Payroll execution completed: ${successCount} disbursed successfully (₹${totalDisbursedInr.toLocaleString("en-IN")}), ${failedCount} failed.`,
      summary: {
        totalRecipients: targetStaffList.length,
        successCount,
        failedCount,
        totalDisbursedInr,
      },
      results,
    });
  } catch (err: any) {
    console.error("POST /api/staff/salary/admin/disburse error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute salary disbursement." },
      { status: 500 }
    );
  }
}
