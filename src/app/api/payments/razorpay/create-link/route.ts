import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId } = body;

    // Fetch student details including zone_code and campus_id for server-side price verification
    const { data: studentRecord } = await supabaseAdmin
      .from("students_full")
      .select("user_id, phone, full_name, email, zone_code, campus_id, total_fee_due, total_fee_paid")
      .eq("id", studentId)
      .maybeSingle();

    if (!studentRecord) {
      return NextResponse.json({ success: false, error: "Student record not found. Please complete your profile first." }, { status: 404 });
    }

    // Server-authoritative price: look up the fee from transit_zones based on student's zone + campus
    let serverFee = Number(studentRecord.total_fee_due) || 0;
    if (studentRecord.zone_code && studentRecord.campus_id) {
      const { data: zone } = await supabaseAdmin
        .from("transit_zones")
        .select("semester_fee")
        .eq("code", studentRecord.zone_code)
        .eq("campus_id", studentRecord.campus_id)
        .maybeSingle();
      if (zone?.semester_fee) {
        serverFee = Number(zone.semester_fee);
      }
    } else if (studentRecord.zone_code) {
      const { data: zone } = await supabaseAdmin
        .from("transit_zones")
        .select("semester_fee")
        .eq("code", studentRecord.zone_code)
        .limit(1)
        .maybeSingle();
      if (zone?.semester_fee) {
        serverFee = Number(zone.semester_fee);
      }
    }

    const alreadyPaid = Number(studentRecord.total_fee_paid) || 0;
    const amountToPay = Math.max(0, serverFee - alreadyPaid);

    if (amountToPay <= 0) {
      return NextResponse.json({ success: false, error: "No outstanding balance. Your fees are fully paid." }, { status: 400 });
    }

    const amountInPaise = Math.round(amountToPay * 100);

    // Verify ownership
    const isStaffOrAdmin = ["admin", "transport_admin", "transport_manager"].includes(session.role);
    if (!isStaffOrAdmin) {
      if (!studentRecord || studentRecord.user_id !== session.userId) {
        return NextResponse.json(
          { success: false, error: "You can only generate orders for your own account." },
          { status: 403 }
        );
      }
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json(
        { success: false, error: "Razorpay credentials not configured on the server." },
        { status: 500 }
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID.trim().replace(/['"]/g, "").replace(/\\n/g, "").replace(/\\r/g, "");
    const keySecret = process.env.RAZORPAY_KEY_SECRET.trim().replace(/['"]/g, "").replace(/\\n/g, "").replace(/\\r/g, "");

    const host = request.headers.get("host") || "campusfleet.vercel.app";
    const protocol = host.includes("localhost") ? "http" : "https";
    const callbackPath = body.callbackPath || `/portal/onboarding?student_id=${studentId}`;
    const callbackUrl = callbackPath.startsWith("http") ? callbackPath : `${protocol}://${host}${callbackPath}`;

    const options = {
      amount: amountInPaise,
      currency: "INR",
      accept_partial: false,
      reference_id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      description: "CampusFleet Transit Pass",
      customer: {
        name: studentRecord?.full_name || session.fullName || "Student",
        email: studentRecord?.email || session.email || "student@example.com",
        ...(studentRecord?.phone ? { contact: studentRecord.phone } : {})
      },
      notify: {
        sms: !!studentRecord?.phone,
        email: true
      },
      reminder_enable: false,
      notes: {
        studentId: studentId,
        userId: session.userId,
      },
      callback_url: callbackUrl,
      callback_method: "get"
    };

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options),
    });

    const linkData = await rzpRes.json();

    if (!rzpRes.ok) {
      console.error("Razorpay API Error:", linkData);
      let errMsg = linkData.error?.description || linkData.error?.message || "Failed to create payment link";
      if (errMsg.includes("Authentication failed") || rzpRes.status === 401) {
        errMsg = `Razorpay Authentication Failed: Your keys (${keyId.substring(0, 5)}...) are invalid.`;
      }
      return NextResponse.json({ success: false, error: errMsg }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      short_url: linkData.short_url,
      link_id: linkData.id
    });
  } catch (err: any) {
    console.error("Razorpay create-link error:", err);
    return NextResponse.json({ success: false, error: "Internal server error generating link." }, { status: 500 });
  }
}
