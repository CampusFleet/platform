import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

/**
 * PUT /api/staff/salary/admin/role-defaults
 * Admin updates role-wide default base salary, payment frequency, and trip bonus rates
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

    return NextResponse.json({
      success: true,
      message: `✓ Role benchmarks updated for ${role.replace("_", " ").toUpperCase()}.`,
      role,
      baseSalary: numSalary,
      paymentFrequency,
    });
  } catch (err: any) {
    console.error("PUT /api/staff/salary/admin/role-defaults error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update role benchmarks." },
      { status: 500 }
    );
  }
}
