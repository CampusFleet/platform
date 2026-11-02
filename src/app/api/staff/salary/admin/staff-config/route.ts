import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

/**
 * PUT /api/staff/salary/admin/staff-config
 * Admin updates an individual staff member's base salary, payment frequency, or awards a bonus.
 * Also supports action: "SYNC_TO_BENCHMARK" for batch or single synchronization to role baseline.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    // 0. Check if batch/single benchmark sync action
    if (body.action === "SYNC_TO_BENCHMARK") {
      const targetIds: string[] = Array.isArray(body.staffIds) && body.staffIds.length > 0
        ? body.staffIds
        : body.staffId ? [body.staffId] : [];

      if (targetIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "staffIds array or staffId is required for benchmark synchronization." },
          { status: 400 }
        );
      }

      // Fetch current role benchmarks
      const { data: defaults } = await supabaseAdmin
        .from("role_salary_defaults")
        .select("role, base_salary, payment_frequency");
      const defaultsMap = new Map((defaults || []).map((d: any) => [d.role, d]));

      // Fetch targets
      const { data: staffList, error: staffErr } = await supabaseAdmin
        .from("staff")
        .select("id, user_id, full_name, role")
        .in("id", targetIds);

      if (staffErr || !staffList || staffList.length === 0) {
        return NextResponse.json(
          { success: false, error: "No matching staff members found." },
          { status: 404 }
        );
      }

      let syncedCount = 0;
      for (const s of staffList) {
        const d = defaultsMap.get(s.role);
        if (d) {
          const { error: updErr } = await supabaseAdmin
            .from("staff_salary_configs")
            .update({
              base_salary: Number(d.base_salary),
              payment_frequency: d.payment_frequency || "MONTHLY",
              updated_at: new Date().toISOString(),
            })
            .eq("staff_id", s.id);

          if (!updErr) syncedCount++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `✓ Synchronized ${syncedCount} staff member(s) to institutional role benchmark.`,
        syncedCount,
      });
    }

    const {
      staffId,
      baseSalary,
      paymentFrequency,
      bonusAmount,
      bonusReason,
      payoutMethod,
    } = body;

    if (!staffId) {
      return NextResponse.json(
        { success: false, error: "staffId is required." },
        { status: 400 }
      );
    }

    // 1. Fetch existing staff details
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, role, full_name, user_id")
      .eq("id", staffId)
      .maybeSingle();

    if (staffErr || !staff) {
      return NextResponse.json(
        { success: false, error: "Staff member not found." },
        { status: 404 }
      );
    }

    // 2. Fetch existing config or default
    const { data: existingConfig } = await supabaseAdmin
      .from("staff_salary_configs")
      .select("*")
      .eq("staff_id", staffId)
      .maybeSingle();

    const updatePayload: Record<string, any> = {
      staff_id: staffId,
      user_id: staff.user_id,
      role: staff.role,
      updated_at: new Date().toISOString(),
    };

    if (baseSalary !== undefined && baseSalary !== null) {
      const num = Number(baseSalary);
      if (isNaN(num) || num < 0) {
        return NextResponse.json({ success: false, error: "Base salary must be a positive number." }, { status: 400 });
      }
      updatePayload.base_salary = num;
    }

    if (paymentFrequency) {
      if (!["DAILY", "WEEKLY", "MONTHLY"].includes(paymentFrequency)) {
        return NextResponse.json({ success: false, error: "Payment frequency must be DAILY, WEEKLY, or MONTHLY." }, { status: 400 });
      }
      updatePayload.payment_frequency = paymentFrequency;
    }

    if (payoutMethod) {
      if (!["BANK_ACCOUNT", "UPI"].includes(payoutMethod)) {
        return NextResponse.json({ success: false, error: "Payout method must be BANK_ACCOUNT or UPI." }, { status: 400 });
      }
      updatePayload.payout_method = payoutMethod;
    }

    if (bonusAmount !== undefined && bonusAmount !== null) {
      const numBonus = Number(bonusAmount);
      updatePayload.active_bonus_amount = isNaN(numBonus) ? 0 : Math.max(0, numBonus);
      updatePayload.active_bonus_reason = bonusReason?.trim() || "Performance incentive";
    }

    // If config didn't exist yet, fill mandatory fields
    if (!existingConfig) {
      updatePayload.account_holder_name = staff.full_name;
      updatePayload.bank_account_masked = "••••••••" + Math.floor(1000 + Math.random() * 9000);
      updatePayload.bank_ifsc = "SBIN0000726";
      updatePayload.bank_name = "State Bank of India";
      if (!updatePayload.base_salary) updatePayload.base_salary = 20000.00;
      if (!updatePayload.payment_frequency) updatePayload.payment_frequency = "MONTHLY";
    }

    const { error: upsertErr } = await supabaseAdmin
      .from("staff_salary_configs")
      .upsert(updatePayload, { onConflict: "staff_id" });

    if (upsertErr) {
      console.error("Failed to update staff salary config:", upsertErr);
      return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `✓ Compensation updated for ${staff.full_name}.`,
      updated: updatePayload,
    });
  } catch (err: any) {
    console.error("PUT /api/staff/salary/admin/staff-config error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update staff compensation." },
      { status: 500 }
    );
  }
}
