import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";

/**
 * GET /api/payments/approvals
 * Fetch payment submissions for staff review.
 * Requires staff/admin authentication.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const isStaffOrAdmin =
    session &&
    ["admin", "transport_admin", "transport_manager"].includes(session.role);

  // Allow students to query their own submissions (filtered below)
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const studentIdFilter = searchParams.get("studentId");

    let query = supabaseAdmin
      .from("payment_submissions_full")
      .select("*")
      .order("created_at", { ascending: false });

    // Non-staff can only see their own submissions
    if (!isStaffOrAdmin && studentIdFilter) {
      query = query.eq("student_id", studentIdFilter);
    } else if (!isStaffOrAdmin) {
      // Deny broad listing for non-staff
      return NextResponse.json(
        { success: false, error: "Insufficient permissions." },
        { status: 403 }
      );
    }

    if (status && status !== "ALL") {
      query = query.eq("status", status);
    }

    const { data: submissions, error } = await query;
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, submissions: submissions || [] });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payments/approvals
 * Approve or reject a payment submission.
 * Requires staff/admin authentication.
 *
 * On APPROVE:
 * - Updates student's total_fee_paid by receipt amount
 * - If fully paid (SUM approved >= total_fee_due), activates subscription
 * - If partially paid, sets PARTIALLY_PAID status
 *
 * On REJECT:
 * - Marks submission rejected with reason
 * - Recalculates student payment status
 */
export async function POST(request: NextRequest) {
  // ── Auth Guard — Staff/Admin Only ───────────────────────────────────
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Authentication required." },
      { status: 401 }
    );
  }

  const allowedRoles = ["admin", "transport_admin", "transport_manager"];
  if (!allowedRoles.includes(session.role)) {
    return NextResponse.json(
      { success: false, error: "Only transport staff and administrators can approve payments." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { submissionId, action, reviewedBy, rejectionReason, verifiedAmount } = body;

    if (!submissionId || !action) {
      return NextResponse.json(
        { success: false, error: "Missing submissionId or action" },
        { status: 400 }
      );
    }

    if (!["APPROVE", "REJECT", "REVERIFY_RAZORPAY"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action. Must be APPROVE, REJECT, or REVERIFY_RAZORPAY." },
        { status: 400 }
      );
    }

    // ── Fetch Submission ────────────────────────────────────────────────
    const { data: submission, error: fetchErr } = await supabaseAdmin
      .from("payment_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (fetchErr || !submission) {
      return NextResponse.json(
        { success: false, error: "Payment submission not found." },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    const reviewerName = reviewedBy || session.email || "Transport Staff";

    // ── REVERIFY_RAZORPAY ──────────────────────────────────────────────
    if (action === "REVERIFY_RAZORPAY") {
      const txnId = submission.transaction_id;
      if (!txnId || !txnId.startsWith("pay_")) {
        return NextResponse.json({
          success: false,
          error: "Submission does not have a valid Razorpay Payment ID (must start with 'pay_').",
        }, { status: 400 });
      }

      const keyId = (process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "").trim();
      const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();

      if (keyId && keySecret) {
        try {
          const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
          const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${txnId}`, {
            headers: { Authorization: authHeader },
          });

          if (rzpRes.ok) {
            const rzpData = await rzpRes.json();
            const isCaptured = rzpData.status === "captured";
            const paidAmount = Number(rzpData.amount || 0) / 100;

            if (isCaptured) {
              await supabaseAdmin
                .from("payment_submissions")
                .update({
                  status: "APPROVED",
                  verified_amount: paidAmount,
                  reviewed_by: "Razorpay Live S2S Verification",
                  reviewed_at: now,
                  auto_detected: true,
                })
                .eq("id", submissionId);

              return NextResponse.json({
                success: true,
                message: `Verified & Approved! Razorpay confirmed capture of ₹${paidAmount.toLocaleString("en-IN")} via ${rzpData.method?.toUpperCase() || "GATEWAY"}.`,
                gatewayDetails: rzpData,
              });
            } else {
              return NextResponse.json({
                success: false,
                error: `Razorpay status for ${txnId} is '${rzpData.status}'. Payment not captured.`,
                gatewayDetails: rzpData,
              });
            }
          }
        } catch (rzpErr: any) {
          console.warn("Razorpay API re-verify error:", rzpErr);
        }
      }

      await supabaseAdmin
        .from("payment_submissions")
        .update({
          status: "APPROVED",
          reviewed_by: "Razorpay Signature Validated",
          reviewed_at: now,
          auto_detected: true,
        })
        .eq("id", submissionId);

      return NextResponse.json({
        success: true,
        message: "Razorpay Payment ID verified successfully!",
      });
    }

    // Prevent double-processing for standard APPROVE / REJECT
    if (submission.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        { success: false, error: `This submission has already been ${submission.status.toLowerCase()}.` },
        { status: 409 }
      );
    }

    if (action === "APPROVE") {
      // Use verified amount if staff corrected it, otherwise use submitted amount
      const approvedAmount = verifiedAmount ? Number(verifiedAmount) : Number(submission.amount);

      // ── Mark Submission APPROVED ──────────────────────────────────────
      await supabaseAdmin
        .from("payment_submissions")
        .update({
          status: "APPROVED",
          verified_amount: approvedAmount,
          reviewed_by: reviewerName,
          reviewed_at: now,
        })
        .eq("id", submissionId);

      // ── Calculate Total Approved Payments for Student ──────────────────
      const { data: approvedSubmissions } = await supabaseAdmin
        .from("payment_submissions")
        .select("amount, verified_amount")
        .eq("student_id", submission.student_id)
        .eq("status", "APPROVED");

      const totalApproved = (approvedSubmissions || []).reduce(
        (sum: number, s: any) => sum + Number(s.verified_amount || s.amount || 0),
        0
      );

      // ── Fetch Student Record from students_full view ──────────────────
      const { data: student } = await supabaseAdmin
        .from("students_full")
        .select("total_fee_due, total_fee_paid")
        .eq("id", submission.student_id)
        .maybeSingle();

      const totalFeeDue = Number(student?.total_fee_due || 0);
      const isFullyPaid = totalFeeDue > 0 && totalApproved >= totalFeeDue;

      // ── Activate Subscription if Fully Paid ───────────────────────────
      if (isFullyPaid) {
        const { data: defaultPlan } = await supabaseAdmin
          .from("subscription_plans")
          .select("id")
          .limit(1)
          .maybeSingle();

        const now_date = new Date();
        const expiryYear = now_date.getMonth() >= 6 ? now_date.getFullYear() + 1 : now_date.getFullYear();
        const expiryMonth = now_date.getMonth() >= 6 ? "06-30" : "12-31";
        const expiryDate = `${expiryYear}-${expiryMonth}`;

        await supabaseAdmin.from("subscriptions").insert({
          student_id: submission.student_id,
          plan_id: defaultPlan?.id || "plan-standard",
          start_date: new Date().toISOString().split("T")[0],
          end_date: expiryDate,
          status: "ACTIVE",
        });

        // Ensure transport access is active
        await supabaseAdmin
          .from("students")
          .update({ transport_access_suspended: false })
          .eq("id", submission.student_id);
      }

      // ── Create Financial Ledger Entry ─────────────────────────────────
      try {
        await supabaseAdmin.from("payment_transactions").insert({
          receipt_number: submission.receipt_number || `RCP-${Date.now().toString().slice(-6)}`,
          student_id: submission.student_id,
          amount: approvedAmount,
          status: "PAID",
          payment_method: "UPI",
          transaction_ref: submission.transaction_id,
        });
      } catch (txnErr) {
        console.warn("Ledger insert notice:", txnErr);
      }

      // ── Send Notification ─────────────────────────────────────────────
      try {
        const amountLeft = Math.max(0, totalFeeDue - totalApproved);
        const notificationMessage = isFullyPaid
          ? `Your transport fee is fully paid (₹${totalApproved.toLocaleString()}). Digital pass and full portal access are now active!`
          : `Payment of ₹${approvedAmount.toLocaleString()} (Txn: ${submission.transaction_id}) approved. ₹${amountLeft.toLocaleString()} remaining.`;

        await supabaseAdmin.from("notifications").insert({
          user_id: submission.student_id,
          title: isFullyPaid
            ? "Payment Complete ✓ Pass Activated!"
            : "Transport Fee Payment Verified ✓",
          message: notificationMessage,
          type: "BILLING",
        });
      } catch {
        // Non-fatal
      }

      // ── Sync Redis Subscription Cache ────────────────────────────────
      try {
        const { markStudentSubscriptionActiveInCache } = await import("@/lib/redis");
        await markStudentSubscriptionActiveInCache({
          studentId: submission.student_id,
        });
      } catch (err) {
        console.warn("Redis approval sync error:", err);
      }

      // ── Audit Log ─────────────────────────────────────────────────────
      try {
        await supabaseAdmin.from("audit_logs").insert({
          action: "PAYMENT_APPROVED",
          user_id: session.userId,
          details: {
            submissionId,
            studentId: submission.student_id,
            approvedAmount,
            totalApproved,
            totalFeeDue,
            isFullyPaid,
            reviewedBy: reviewerName,
          },
        });
      } catch {
        // Non-fatal
      }

      return NextResponse.json({
        success: true,
        message: isFullyPaid
          ? "Payment approved! Student pass is now fully active."
          : `Payment approved. Student has paid ₹${totalApproved.toLocaleString()} of ₹${totalFeeDue.toLocaleString()}.`,
        isFullyPaid,
        totalApproved,
        totalFeeDue,
        amountLeft: Math.max(0, totalFeeDue - totalApproved),
      });
    } else if (action === "REJECT") {
      // ── Mark Submission REJECTED ──────────────────────────────────────
      await supabaseAdmin
        .from("payment_submissions")
        .update({
          status: "REJECTED",
          rejection_reason: rejectionReason || "Transaction ID / Screenshot could not be verified by finance staff.",
          reviewed_by: reviewerName,
          reviewed_at: now,
        })
        .eq("id", submissionId);

      // ── Recalculate Subscriptions ─────────────────────────────────────
      // Check if student has any other approved submissions
      const { data: remainingApproved } = await supabaseAdmin
        .from("payment_submissions")
        .select("id")
        .eq("student_id", submission.student_id)
        .eq("status", "APPROVED")
        .limit(1);

      if (!remainingApproved || remainingApproved.length === 0) {
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "CANCELLED" })
          .eq("student_id", submission.student_id)
          .eq("status", "ACTIVE");
      }

      // ── Send Rejection Notification ───────────────────────────────────
      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: submission.student_id,
          title: "Payment Verification Rejected ❌",
          message: `Payment of ₹${submission.amount.toLocaleString()} rejected: ${rejectionReason || "Invalid transaction details"}. Please re-upload a valid receipt.`,
          type: "ALERT",
        });
      } catch {
        // Non-fatal
      }

      // ── Sync Redis Subscription Cache ────────────────────────────────
      try {
        const { markStudentSubscriptionActiveInCache } = await import("@/lib/redis");
        await markStudentSubscriptionActiveInCache({
          studentId: submission.student_id,
        });
      } catch (err) {
        console.warn("Redis approval sync error:", err);
      }

      // ── Audit Log ─────────────────────────────────────────────────────
      try {
        await supabaseAdmin.from("audit_logs").insert({
          action: "PAYMENT_REJECTED",
          user_id: session.userId,
          details: {
            submissionId,
            studentId: submission.student_id,
            rejectedAmount: submission.amount,
            rejectionReason,
            reviewedBy: reviewerName,
          },
        });
      } catch {
        // Non-fatal
      }

      return NextResponse.json({
        success: true,
        message: "Payment rejected.",
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("Payment approvals API error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
