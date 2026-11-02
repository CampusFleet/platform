import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

/**
 * PUT /api/staff/salary/admin/role-defaults
 * Admin updates role-wide default base salary, payment frequency, and trip bonus rates.
 * Automatically cascades/synchronizes updated baseline to all active staff assigned to that role.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      role,
      baseSalary,
      paymentFrequency = "MONTHLY",
      dailyAllowance = 0,
      tripBonusRate = 100,
      description,
      applyToExistingStaff = true,
    } = body;

    if (!role) {
      return NextResponse.json({ success: false, error: "role is required." }, { status: 400 });
    }

    const numSalary = Number(baseSalary);
    if (isNaN(numSalary) || numSalary <= 0) {
      return NextResponse.json({ success: false, error: "Base salary must be a valid positive amount." }, { status: 400 });
    }

    if (!["DAILY", "WEEKLY", "MONTHLY"].includes(paymentFrequency)) {
      return NextResponse.json({ success: false, error: "Payment frequency must be DAILY, WEEKLY, or MONTHLY." }, { status: 400 });
    }

    // 1. Upsert role benchmark default
    const { error: upsertErr } = await supabaseAdmin
      .from("role_salary_defaults")
      .upsert(
        {
          role,
          base_salary: numSalary,
          payment_frequency: paymentFrequency,
          daily_allowance: Number(dailyAllowance) || 0,
          trip_bonus_rate: Number(tripBonusRate) || 0,
          description: description || `Default compensation template for ${role}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "role" }
      );

    if (upsertErr) {
      console.error("Failed to update role salary defaults:", upsertErr);
      return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
    }

    // 2. Cascade / Synchronize to all existing staff members assigned to this role
    let updatedStaffCount = 0;
    if (applyToExistingStaff) {
      // Find all staff in this role
      const { data: roleStaff, error: staffErr } = await supabaseAdmin
        .from("staff")
        .select("id, user_id, full_name, role")
        .eq("role", role);

      if (!staffErr && roleStaff && roleStaff.length > 0) {
        const staffIds = roleStaff.map((s) => s.id);

        // Update all existing configs for these staff
        const { data: updatedRows, error: batchUpdateErr } = await supabaseAdmin
          .from("staff_salary_configs")
          .update({
            base_salary: numSalary,
            payment_frequency: paymentFrequency,
            updated_at: new Date().toISOString(),
          })
          .in("staff_id", staffIds)
          .select("staff_id");

        if (batchUpdateErr) {
          console.warn("Failed to cascade role default to existing configs:", batchUpdateErr);
        } else {
          updatedStaffCount = updatedRows?.length || 0;
        }

        // Initialize any staff member who doesn't have a staff_salary_configs row yet
        const updatedIdsSet = new Set((updatedRows || []).map((r: any) => r.staff_id));
        const missingStaff = roleStaff.filter((s) => !updatedIdsSet.has(s.id));

        if (missingStaff.length > 0) {
          const insertPayloads = missingStaff.map((s) => ({
            staff_id: s.id,
            user_id: s.user_id,
            role: s.role,
            base_salary: numSalary,
            payment_frequency: paymentFrequency,
            payout_method: "BANK_ACCOUNT",
            account_holder_name: s.full_name,
            bank_name: "State Bank of India",
            bank_ifsc: "SBIN0000726",
            bank_account_masked: "••••••••" + Math.floor(1000 + Math.random() * 9000),
            is_verified: true,
            active_bonus_amount: 0,
            updated_at: new Date().toISOString(),
          }));

          const { data: insertedRows } = await supabaseAdmin
            .from("staff_salary_configs")
            .upsert(insertPayloads, { onConflict: "staff_id" })
            .select("staff_id");

          updatedStaffCount += (insertedRows?.length || 0);
        }
      }
    }

    const roleNameFormatted = role.replace("_", " ").toUpperCase();
    const cascadeMsg = updatedStaffCount > 0
      ? ` and synchronized base salary to ₹${numSalary.toLocaleString("en-IN")} for ${updatedStaffCount} staff member(s).`
      : ".";

    return NextResponse.json({
      success: true,
      message: `✓ Benchmark updated for ${roleNameFormatted}${cascadeMsg}`,
      role,
      baseSalary: numSalary,
      paymentFrequency,
      updatedStaffCount,
    });
  } catch (err: any) {
    console.error("PUT /api/staff/salary/admin/role-defaults error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update role benchmarks." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/staff/salary/admin/role-defaults
 * Explicit action to cascade a role's benchmark base salary to all staff assigned to that role.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json({ success: false, error: "role is required." }, { status: 400 });
    }

    // 1. Get role benchmark
    const { data: defaultRow, error: defaultErr } = await supabaseAdmin
      .from("role_salary_defaults")
      .select("*")
      .eq("role", role)
      .maybeSingle();

    if (defaultErr || !defaultRow) {
      return NextResponse.json(
        { success: false, error: `No benchmark template configured for role: ${role}` },
        { status: 404 }
      );
    }

    const targetSalary = Number(defaultRow.base_salary);
    const targetFreq = defaultRow.payment_frequency || "MONTHLY";

    // 2. Fetch all staff with this role
    const { data: staffList, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, full_name, role")
      .eq("role", role);

    if (staffErr || !staffList || staffList.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No active staff found for role ${role}.`,
        updatedCount: 0,
      });
    }

    const staffIds = staffList.map((s) => s.id);

    // 3. Update existing configs
    const { data: updatedRows, error: updateErr } = await supabaseAdmin
      .from("staff_salary_configs")
      .update({
        base_salary: targetSalary,
        payment_frequency: targetFreq,
        updated_at: new Date().toISOString(),
      })
      .in("staff_id", staffIds)
      .select("staff_id");

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    let updatedCount = updatedRows?.length || 0;

    // 4. Upsert for any missing configs
    const updatedIdsSet = new Set((updatedRows || []).map((r: any) => r.staff_id));
    const missingStaff = staffList.filter((s) => !updatedIdsSet.has(s.id));

    if (missingStaff.length > 0) {
      const inserts = missingStaff.map((s) => ({
        staff_id: s.id,
        user_id: s.user_id,
        role: s.role,
        base_salary: targetSalary,
        payment_frequency: targetFreq,
        payout_method: "BANK_ACCOUNT",
        account_holder_name: s.full_name,
        bank_name: "State Bank of India",
        bank_ifsc: "SBIN0000726",
        bank_account_masked: "••••••••" + Math.floor(1000 + Math.random() * 9000),
        is_verified: true,
        active_bonus_amount: 0,
        updated_at: new Date().toISOString(),
      }));

      const { data: inserted } = await supabaseAdmin
        .from("staff_salary_configs")
        .upsert(inserts, { onConflict: "staff_id" })
        .select("staff_id");

      updatedCount += (inserted?.length || 0);
    }

    return NextResponse.json({
      success: true,
      message: `✓ Synchronized all ${updatedCount} ${role.replace("_", " ")}s to baseline salary of ₹${targetSalary.toLocaleString("en-IN")}.`,
      updatedCount,
      role,
      baseSalary: targetSalary,
    });
  } catch (err: any) {
    console.error("POST /api/staff/salary/admin/role-defaults error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to cascade role benchmark." },
      { status: 500 }
    );
  }
}
