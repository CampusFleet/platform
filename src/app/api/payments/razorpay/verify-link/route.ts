import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { 
      razorpay_payment_id, 
      razorpay_payment_link_id, 
      razorpay_payment_link_reference_id,
      razorpay_payment_link_status,
      razorpay_signature
    } = body;

    if (!razorpay_payment_id || !razorpay_payment_link_id || !razorpay_signature || !razorpay_payment_link_reference_id || !razorpay_payment_link_status) {
      return NextResponse.json({ success: false, error: "Missing required payment parameters." }, { status: 400 });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json(
        { success: false, error: "Razorpay credentials not configured on the server." },
        { status: 500 }
      );
    }
    const keyId = process.env.RAZORPAY_KEY_ID.trim().replace(/['"]/g, "");
    const keySecret = process.env.RAZORPAY_KEY_SECRET.trim().replace(/['"]/g, "");

    // Razorpay signature for payment links:
    // HMAC-SHA256(payment_link_id + "|" + payment_link_reference_id + "|" + payment_link_status + "|" + payment_id, secret)
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_payment_link_id}|${razorpay_payment_link_reference_id}|${razorpay_payment_link_status}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return NextResponse.json({ success: false, error: "Invalid payment signature. Verification failed." }, { status: 400 });
    }

    // --------------------------------------------------------
    // SECURITY AUDIT: S2S Verification to prevent IDOR and forgery
    // --------------------------------------------------------
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch(`https://api.razorpay.com/v1/payment_links/${razorpay_payment_link_id}`, {
      headers: {
        "Authorization": `Basic ${auth}`
      }
    });

    if (!rzpRes.ok) {
      return NextResponse.json({ success: false, error: "Failed to fetch secure payment details from Razorpay." }, { status: 500 });
    }

    const linkData = await rzpRes.json();
    const studentId = linkData.notes?.studentId;
    const amountPaid = (linkData.amount_paid || linkData.amount) / 100; // Convert from paise to INR

    if (!studentId) {
      return NextResponse.json({ success: false, error: "Could not determine student ID securely from payment metadata." }, { status: 400 });
    }

    const { data: studentRecord, error: fetchError } = await supabaseAdmin
      .from("students_full")
      .select("id, user_id, email, total_fee_paid, full_name, zone_code, total_fee_due")
      .eq("id", studentId)
      .maybeSingle();

    if (fetchError || !studentRecord) {
      return NextResponse.json({ success: false, error: "Student record not found." }, { status: 404 });
    }

    // Check if we already processed this payment
    const { data: existingTxn } = await supabaseAdmin
      .from("payment_submissions")
      .select("id")
      .eq("transaction_id", razorpay_payment_id)
      .maybeSingle();

    if (!existingTxn) {
      // 1. Insert into payment_submissions so it shows in the app history
      // This will trigger the `trg_fulfill_subscription_submissions_insert` trigger
      // which handles extending the subscription logically.
      const receiptNumber = `RZP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await supabaseAdmin.from("payment_submissions").insert({
        student_id: studentId,
        student_name: studentRecord.full_name ?? null,
        zone_code: studentRecord.zone_code ?? null,
        amount: amountPaid,
        receipt_url: `https://dashboard.razorpay.com/app/payments/${razorpay_payment_id}`,
        transaction_id: razorpay_payment_id,
        auto_detected: true,
        status: "APPROVED",
        receipt_number: receiptNumber
      });
    }

    // 2. Ensure active subscription row exists in subscriptions table as a fail-safe
    const { data: defaultPlan } = await supabaseAdmin
      .from("subscription_plans")
      .select("id")
      .limit(1)
      .maybeSingle();

    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("student_id", studentId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (!existingSub) {
      await supabaseAdmin.from("subscriptions").insert({
        student_id: studentId,
        plan_id: defaultPlan?.id || "plan-standard",
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 180 * 86400000).toISOString().split("T")[0],
        status: "ACTIVE",
      });
    }

    await supabaseAdmin
      .from("students")
      .update({ transport_access_suspended: false })
      .eq("id", studentId);

    // 3. Actively write TRUE to Redis and bust stale profiles across all student/user/email aliases
    const { markStudentSubscriptionActiveInCache } = await import("@/lib/redis");
    await markStudentSubscriptionActiveInCache({
      studentId,
      userId: session.userId || (studentRecord as any).user_id,
      email: session.email || (studentRecord as any).email,
    });

    return NextResponse.json({
      success: true,
      message: "Payment verified and transit pass unlocked.",
      studentId,
      userId: session.userId || (studentRecord as any).user_id,
    });

  } catch (error: any) {
    console.error("Razorpay Link Verification Error:", error);
    return NextResponse.json({ success: false, error: "Server error verifying payment link." }, { status: 500 });
  }
}
