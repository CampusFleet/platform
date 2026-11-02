import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import {
  encryptSensitiveField,
  maskBankAccount,
  maskUpiId,
  isValidIfsc,
  isValidUpiVpa,
} from "@/lib/payroll-crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff/salary/profile?staffId=...&userId=...
 * Retrieves current staff member's compensation profile and payout history
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get("staffId");
    const userId = searchParams.get("userId");

    if (!staffId && !userId) {
      return NextResponse.json(
        { success: false, error: "Missing staffId or userId parameter." },
        { status: 400 }
      );
    }

    let query = supabaseAdmin.from("staff_payroll_full").select("*");
    if (staffId) {
      query = query.or(`staff_id.eq.${staffId},user_id.eq.${staffId}`);
    } else if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: profiles, error: profileErr } = await query.limit(1);

    if (profileErr || !profiles || profiles.length === 0) {
      return NextResponse.json(
        { success: false, error: "Staff salary profile not found." },
        { status: 404 }
      );
    }

    const profile = profiles[0];

    // Fetch personal disbursement history
    const { data: payouts } = await supabaseAdmin
      .from("staff_salary_payouts")
      .select("*")
      .eq("staff_id", profile.staff_id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      success: true,
      profile: {
        staffId: profile.staff_id,
        userId: profile.user_id,
        employeeCode: profile.employee_code,
        fullName: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        role: profile.role,
        category: profile.category,
        baseSalary: Number(profile.base_salary),
        paymentFrequency: profile.payment_frequency,
        payoutMethod: profile.payout_method,
        accountHolderName: profile.account_holder_name || profile.full_name,
        bankName: profile.bank_name,
        bankIfsc: profile.bank_ifsc,
        bankAccountMasked: profile.bank_account_masked,
        upiIdMasked: profile.upi_id_masked,
        isPayoutConfigured: Boolean(profile.is_payout_configured),
        isVerified: Boolean(profile.is_verified),
        activeBonusAmount: Number(profile.active_bonus_amount || 0),
        activeBonusReason: profile.active_bonus_reason,
        totalPaidYtd: Number(profile.total_paid_ytd || 0),
        lastPayoutAt: profile.last_payout_at,
        lastPayoutAmount: profile.last_payout_amount ? Number(profile.last_payout_amount) : null,
        lastPayoutStatus: profile.last_payout_status,
      },
      payouts: payouts || [],
    });
  } catch (err: any) {
    console.error("GET /api/staff/salary/profile error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load salary profile." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/staff/salary/profile
 * Staff updates their own Bank Account or UPI VPA payout details.
 * Encrypts sensitive fields with AES-256-GCM before database persistence.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      staffId,
      userId,
      payoutMethod = "BANK_ACCOUNT",
      accountHolderName,
      bankName,
      bankIfsc,
      bankAccount,
      upiId,
    } = body;

    if (!staffId && !userId) {
      return NextResponse.json(
        { success: false, error: "Target staffId or userId is required." },
        { status: 400 }
      );
    }

    // 1. Resolve actual staff record
    let targetStaffId = staffId;
    if (!targetStaffId && userId) {
      const { data: staffData } = await supabaseAdmin
        .from("staff")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      targetStaffId = staffData?.id || userId;
    }

    const { data: existingStaff } = await supabaseAdmin
      .from("staff")
      .select("id, role, full_name, user_id")
      .eq("id", targetStaffId)
      .maybeSingle();

    const role = existingStaff?.role || "driver";
    const holderName = accountHolderName?.trim() || existingStaff?.full_name || "Staff Member";

    // 2. Validate financial credentials
    const updatePayload: Record<string, any> = {
      staff_id: targetStaffId,
      user_id: existingStaff?.user_id || userId,
      role,
      payout_method: payoutMethod,
      account_holder_name: holderName,
      is_verified: true,
      updated_at: new Date().toISOString(),
    };

    if (payoutMethod === "UPI") {
      if (!upiId || !isValidUpiVpa(upiId)) {
        return NextResponse.json(
          { success: false, error: "Please provide a valid UPI Virtual Payment Address (e.g. name@okhdfcbank)." },
          { status: 400 }
        );
      }
      updatePayload.upi_id_encrypted = encryptSensitiveField(upiId.trim());
      updatePayload.upi_id_masked = maskUpiId(upiId.trim());
    } else {
      // Bank Account validation
      if (!bankAccount || bankAccount.replace(/\s+/g, "").length < 8) {
        return NextResponse.json(
          { success: false, error: "Bank account number must be at least 8 digits." },
          { status: 400 }
        );
      }
      if (!bankIfsc || !isValidIfsc(bankIfsc)) {
        return NextResponse.json(
          { success: false, error: "Please enter a valid 11-character Indian Bank IFSC code (e.g. SBIN0000726)." },
          { status: 400 }
        );
      }

      updatePayload.bank_account_encrypted = encryptSensitiveField(bankAccount.replace(/\s+/g, ""));
      updatePayload.bank_account_masked = maskBankAccount(bankAccount);
      updatePayload.bank_ifsc = bankIfsc.trim().toUpperCase();
      updatePayload.bank_name = bankName?.trim() || "Commercial Bank of India";
    }

    // 3. Upsert into staff_salary_configs
    const { error: upsertErr } = await supabaseAdmin
      .from("staff_salary_configs")
      .upsert(updatePayload, { onConflict: "staff_id" });

    if (upsertErr) {
      console.error("Failed to upsert staff salary config:", upsertErr);
      return NextResponse.json(
        { success: false, error: upsertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "✓ Payout credentials encrypted and securely saved for automated Razorpay direct deposits.",
      payoutMethod,
      accountHolderName: holderName,
      bankAccountMasked: updatePayload.bank_account_masked,
      upiIdMasked: updatePayload.upi_id_masked,
      bankIfsc: updatePayload.bank_ifsc,
      bankName: updatePayload.bank_name,
      isVerified: true,
    });
  } catch (err: any) {
    console.error("PUT /api/staff/salary/profile error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update payout credentials." },
      { status: 500 }
    );
  }
}
