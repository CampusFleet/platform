import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSession } from "@/lib/jwt";
import { isSafeId } from "@/lib/security/safe-id";

export const dynamic = "force-dynamic";

/**
 * POST /api/students/early-departure
 * Student submits an emergency early departure request to their class teacher
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { studentId, shiftId = "shift-halfday", reason } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { success: false, error: "A valid emergency reason is required." },
        { status: 400 }
      );
    }

    const isStaffOrAdmin = ["admin", "transport_admin", "teacher", "transport_manager"].includes(session.role);
    const targetStudentId = (!isStaffOrAdmin)
      ? (session.studentId || session.userId)
      : (studentId || session.studentId || session.userId);

    if (!isSafeId(targetStudentId)) {
      return NextResponse.json({ success: false, error: "Invalid student identifier." }, { status: 400 });
    }

    // Fetch student's class_id (class_name only exists on the students_full view)
    const { data: student } = await supabaseAdmin
      .from("students_full")
      .select("id, full_name, class_id, class_name")
      .or(`id.eq.${targetStudentId},user_id.eq.${targetStudentId}`)
      .limit(1)
      .maybeSingle();

    if (!student) {
      return NextResponse.json(
        { success: false, error: "Student profile record not found." },
        { status: 404 }
      );
    }

    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const todayDateStr = nowIST.toISOString().split("T")[0];

    // Check if an active request already exists for today
    const { data: existing } = await supabaseAdmin
      .from("early_departure_requests")
      .select("id, status")
      .eq("student_id", student.id)
      .eq("request_date", todayDateStr)
      .neq("status", "REJECTED")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "An active early departure request already exists for today.",
        request: existing,
      });
    }

    const { data: requestRecord, error: insertError } = await supabaseAdmin
      .from("early_departure_requests")
      .insert({
        student_id: student.id,
        class_id: student.class_id,
        shift_id: shiftId,
        request_date: todayDateStr,
        reason: reason.trim(),
        status: "PENDING",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Emergency early departure request submitted to your class teacher.",
      request: requestRecord,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/students/early-departure
 * Student retrieves their early departure requests
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetStudentId = searchParams.get("studentId") || session.studentId || session.id;

    const { data: requests, error } = await supabaseAdmin
      .from("early_departure_requests")
      .select("*, shift:shifts(id, name, start_time, end_time)")
      .eq("student_id", targetStudentId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, requests: requests || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
