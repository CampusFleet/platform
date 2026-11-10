import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSession } from "@/lib/jwt";
import { resolveStudentScope } from "@/lib/security/student-scope";

export const dynamic = "force-dynamic";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * GET /api/students/timetable-eligibility
 * Dynamically evaluates whether the student has classes after the current time
 * (or after the selected shift's departure time from the database),
 * enabling bus shift booking if no classes remain,
 * or requiring an approved emergency early departure gate pass.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const scope = await resolveStudentScope(session, searchParams.get("studentId"));
    if (!scope.ok) {
      return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });
    }
    const shiftId = searchParams.get("shiftId");

    // 1. Fetch student record with class_id (students has no class_name column; it lives on students_full)
    const { data: student, error: studentError } = await supabaseAdmin
      .from("students_full")
      .select("id, full_name, class_id, class_name")
      .eq("id", scope.studentId)
      .limit(1)
      .maybeSingle();

    // Determine current day & time in IST (UTC + 5:30)
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const dayOfWeek = DAYS_OF_WEEK[nowIST.getUTCDay()];
    const todayDateStr = nowIST.toISOString().split("T")[0];
    const currentTimeIST = nowIST.toISOString().split("T")[1].substring(0, 5); // "HH:MM"

    // 2. Fetch shift details from database if shiftId is provided
    let shiftData: any = null;

    if (shiftId) {
      const { data: dbShift } = await supabaseAdmin
        .from("shifts")
        .select("*")
        .eq("id", shiftId)
        .maybeSingle();

      if (dbShift) {
        shiftData = dbShift;
      }
    }

    if (studentError || !student) {
      return NextResponse.json({
        success: true,
        dayOfWeek,
        shiftId: shiftId || null,
        shift: shiftData,
        studentId: null,
        classId: null,
        className: null,
        isShiftEnabled: true,
        isShiftRestricted: false,
        hasApprovedEmergencyPass: false,
        pendingRequest: null,
        canBookShift: true,
        canBook: true,
      });
    }

    // 3. Query class shift schedule for student's enrolled section
    let isShiftRestricted = false;
    let className = student.class_name;
    const dayKey = dayOfWeek.toLowerCase();

    if (student.class_id) {
      const { data: classRecord } = await supabaseAdmin
        .from("classes")
        .select("id, name")
        .eq("id", student.class_id)
        .maybeSingle();

      if (classRecord) {
        className = classRecord.name || className;
      }

      const { data: scheduleRow } = await supabaseAdmin
        .from("class_shift_schedules")
        .select("incoming_shift_id, outgoing_shift_id, is_today_off")
        .eq("class_id", student.class_id)
        .eq("day_of_week", dayOfWeek.toUpperCase())
        .maybeSingle();

      if (scheduleRow) {
        if (scheduleRow.is_today_off) {
          isShiftRestricted = true;
        } else if (shiftId && shiftId !== scheduleRow.incoming_shift_id && shiftId !== scheduleRow.outgoing_shift_id) {
          isShiftRestricted = true;
        }
      }
    }

    // 4. Check today's emergency departure requests for this student (if shift is disabled)
    let approvedPass = null;
    let pendingRequest = null;

    if (isShiftRestricted) {
      let requestQuery = supabaseAdmin
        .from("early_departure_requests")
        .select("*")
        .eq("student_id", student.id)
        .eq("request_date", todayDateStr)
        .order("created_at", { ascending: false });

      if (shiftId) {
        requestQuery = requestQuery.eq("shift_id", shiftId);
      }

      const { data: emergencyRequests } = await requestQuery;
      approvedPass = (emergencyRequests || []).find((r) => r.status === "APPROVED");
      pendingRequest = (emergencyRequests || []).find((r) => r.status === "PENDING");
    }

    const isAllowed = !isShiftRestricted || Boolean(approvedPass);

    return NextResponse.json({
      success: true,
      dayOfWeek,
      shiftId: shiftId || null,
      shift: shiftData,
      studentId: student.id,
      classId: student.class_id,
      className,
      isShiftEnabled: !isShiftRestricted,
      isShiftRestricted,
      hasApprovedEmergencyPass: Boolean(approvedPass),
      approvedPass: approvedPass || null,
      pendingRequest: pendingRequest || null,
      canBookShift: isAllowed,
      canBookHalfDay: isAllowed,
      canBook: isAllowed,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
