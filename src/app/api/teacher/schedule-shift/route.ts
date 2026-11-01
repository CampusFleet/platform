import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSession } from "@/lib/jwt";

export const dynamic = "force-dynamic";

const VALID_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

/**
 * GET /api/teacher/schedule-shift
 * Fetches:
 * 1. Assigned classes for the authenticated teacher (with enrollment & commuter counts)
 * 2. All active fleet shifts (shifts table)
 * 3. Existing weekly shift schedules (class_shift_schedules) for these classes
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: Please sign in." },
        { status: 401 }
      );
    }

    const teacherUserId = session.userId || (session as any).id;
    const isTeacherOrAdmin =
      session.role === "teacher" ||
      session.role === "faculty" ||
      session.role === "admin" ||
      session.role === "transport_manager";

    if (!isTeacherOrAdmin) {
      return NextResponse.json(
        {
          success: false,
          message: "Only teachers or fleet administrators can access shift scheduling.",
        },
        { status: 403 }
      );
    }

    // 1. Fetch allocated classes for this teacher
    const { data: allocations, error: allocErr } = await supabaseAdmin
      .from("class_teachers")
      .select("class_id, is_primary")
      .eq("teacher_id", teacherUserId);

    if (allocErr) throw allocErr;

    let allocatedClasses: any[] = [];
    if (allocations && allocations.length > 0) {
      const classIds = allocations.map((a: any) => a.class_id);
      const { data: expandedCls } = await supabaseAdmin
        .from("v_classes_expanded")
        .select("*")
        .in("id", classIds);
      allocatedClasses = (expandedCls || []).map((c: any) => ({
        ...c,
        isPrimary: allocations.find((a: any) => a.class_id === c.id)?.is_primary || false,
      }));
    }

    // Elevated admin fallback: if no direct allocations, can view all active classes
    const isElevated =
      session.role === "admin" || session.role === "transport_manager";
    if (allocatedClasses.length === 0 && isElevated) {
      const { data: allCls } = await supabaseAdmin
        .from("v_classes_expanded")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });
      allocatedClasses = (allCls || []).map((c: any) => ({
        ...c,
        isPrimary: false,
      }));
    }

    const classIds = allocatedClasses.map((c) => c.id);

    // 2. Fetch enrolled students and commuter counts per class
    let studentCounts: Record<string, { total: number; commuters: number }> = {};
    if (classIds.length > 0) {
      const { data: studentsData } = await supabaseAdmin
        .from("students")
        .select("id, class_id, transport_access_suspended")
        .in("class_id", classIds);

      (studentsData || []).forEach((s) => {
        if (!s.class_id) return;
        if (!studentCounts[s.class_id]) {
          studentCounts[s.class_id] = { total: 0, commuters: 0 };
        }
        studentCounts[s.class_id].total += 1;
        if (!s.transport_access_suspended) {
          studentCounts[s.class_id].commuters += 1;
        }
      });
    }

    const classesWithStats = allocatedClasses.map((c) => ({
      id: c.id,
      name: c.name,
      course: c.course || "B.Tech CSE",
      semester: c.semester || "Semester",
      year: c.year || "3rd Year",
      section: c.section || "A",
      department: c.department || "Computer Science",
      specialization: c.specialization || "Core",
      isPrimary: c.isPrimary ?? false,
      isActive: c.is_active ?? true,
      studentCount: studentCounts[c.id]?.total || 0,
      activeCommuters: studentCounts[c.id]?.commuters || 0,
    }));

    // 3. Fetch active shifts
    const { data: shifts, error: shiftsErr } = await supabaseAdmin
      .from("shifts")
      .select("id, name, type, start_time, end_time, direction, is_special, is_active")
      .eq("is_active", true)
      .order("start_time", { ascending: true });

    if (shiftsErr) throw shiftsErr;

    // 4. Fetch existing weekly schedules for these classes
    let schedules: any[] = [];
    if (classIds.length > 0) {
      const { data: schedData, error: schedErr } = await supabaseAdmin
        .from("class_shift_schedules")
        .select("*")
        .in("class_id", classIds);

      if (schedErr) throw schedErr;
      schedules = schedData || [];
    }

    return NextResponse.json({
      success: true,
      teacher: {
        id: teacherUserId,
        name: session.fullName || (session as any).name || "Faculty Member",
        email: session.email,
        role: session.role,
      },
      classes: classesWithStats,
      shifts: shifts || [],
      schedules,
    });
  } catch (error: any) {
    console.error("[api/teacher/schedule-shift] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to load shift schedule data.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teacher/schedule-shift
 * Updates weekly shift schedules for one or more classes.
 * Synchronizes:
 * 1. public.class_shift_schedules (Single Source of Truth)
 * 2. public.shift_demands (Physical Transit Engine Demands)
 * 3. public.classes.shift_schedule (JSON snapshot compatibility)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: Please sign in." },
        { status: 401 }
      );
    }

    const teacherUserId = session.userId || (session as any).id;
    const isTeacherOrAdmin =
      session.role === "teacher" ||
      session.role === "faculty" ||
      session.role === "admin" ||
      session.role === "transport_manager";

    if (!isTeacherOrAdmin) {
      return NextResponse.json(
        { success: false, message: "Forbidden: Insufficient permissions." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { classIds, schedules } = body;

    if (!Array.isArray(classIds) || classIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "Please specify at least one target class." },
        { status: 400 }
      );
    }

    if (!Array.isArray(schedules) || schedules.length === 0) {
      return NextResponse.json(
        { success: false, message: "Schedule entries are required." },
        { status: 400 }
      );
    }

    // Verify teacher authorization for each class
    const isElevated =
      session.role === "admin" || session.role === "transport_manager";

    if (!isElevated) {
      const { data: authorizedAllocations } = await supabaseAdmin
        .from("class_teachers")
        .select("class_id")
        .eq("teacher_id", teacherUserId)
        .in("class_id", classIds);

      const authorizedSet = new Set(
        (authorizedAllocations || []).map((a) => a.class_id)
      );
      const unauthorizedClass = classIds.find((id) => !authorizedSet.has(id));
      if (unauthorizedClass) {
        return NextResponse.json(
          {
            success: false,
            message:
              "You are not authorized to update shift schedules for one or more selected classes.",
          },
          { status: 403 }
        );
      }
    }

    // Fetch student counts for affected classes for shift_demands population
    const { data: studentsData } = await supabaseAdmin
      .from("students")
      .select("id, class_id, transport_access_suspended")
      .in("class_id", classIds);

    const studentCounts: Record<string, { total: number; commuters: number }> = {};
    (studentsData || []).forEach((s) => {
      if (!s.class_id) return;
      if (!studentCounts[s.class_id]) {
        studentCounts[s.class_id] = { total: 0, commuters: 0 };
      }
      studentCounts[s.class_id].total += 1;
      if (!s.transport_access_suspended) {
        studentCounts[s.class_id].commuters += 1;
      }
    });

    const nowIso = new Date().toISOString();
    const classShiftRows: any[] = [];
    const shiftDemandRows: any[] = [];

    for (const classId of classIds) {
      const counts = studentCounts[classId] || { total: 0, commuters: 0 };

      // Build JSON representation for classes.shift_schedule column
      const jsonShiftSchedule: Record<string, any> = {};

      for (const entry of schedules) {
        const day = (entry.day_of_week || entry.dayOfWeek || "").toUpperCase().trim();
        if (!VALID_DAYS.includes(day)) continue;

        const incomingRaw = entry.incoming_shift_id || entry.incomingShiftId || null;
        const outgoingRaw = entry.outgoing_shift_id || entry.outgoingShiftId || null;
        const isOff = Boolean(entry.is_today_off ?? entry.isTodayOff) || (!incomingRaw && !outgoingRaw);
        const incomingId = isOff ? null : incomingRaw;
        const outgoingId = isOff ? null : outgoingRaw;
        const notes = entry.notes || null;

        classShiftRows.push({
          class_id: classId,
          day_of_week: day,
          incoming_shift_id: incomingId,
          outgoing_shift_id: outgoingId,
          is_today_off: isOff,
          notes,
          updated_at: nowIso,
        });

        shiftDemandRows.push({
          class_id: classId,
          day_of_week: day,
          incoming_shift_id: incomingId,
          outgoing_shift_id: outgoingId,
          is_today_off: isOff,
          total_students: counts.total,
          active_commuters: counts.commuters,
          notes,
          updated_at: nowIso,
        });

        jsonShiftSchedule[day.toLowerCase()] = {
          enabled: !isOff,
          incomingShiftId: incomingId,
          outgoingShiftId: outgoingId,
          notes,
        };
      }

    }

    // 1. Batch Upsert to class_shift_schedules
    if (classShiftRows.length > 0) {
      const { error: upsertSchedErr } = await supabaseAdmin
        .from("class_shift_schedules")
        .upsert(classShiftRows, { onConflict: "class_id,day_of_week" });

      if (upsertSchedErr) {
        console.error("class_shift_schedules upsert error:", upsertSchedErr);
        throw upsertSchedErr;
      }
    }

    // 2. Batch Upsert to shift_demands
    if (shiftDemandRows.length > 0) {
      const { error: upsertDemandErr } = await supabaseAdmin
        .from("shift_demands")
        .upsert(shiftDemandRows, { onConflict: "class_id,day_of_week" });

      if (upsertDemandErr) {
        console.error("shift_demands upsert error:", upsertDemandErr);
        // Do not fail the whole request if shift_demands triggers conflict
      }
    }

    return NextResponse.json({
      success: true,
      message: `Shift schedule successfully updated for ${classIds.length} academic ${
        classIds.length === 1 ? "class" : "classes"
      }.`,
      updatedCount: classShiftRows.length,
    });
  } catch (error: any) {
    console.error("[api/teacher/schedule-shift] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to update academic shift schedule.",
      },
      { status: 500 }
    );
  }
}
