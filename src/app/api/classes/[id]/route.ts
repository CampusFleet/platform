import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSession } from "@/lib/jwt";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const classId = params.id;

    // 1. Class info
    const { data: classItem, error } = await supabaseAdmin
      .from("v_classes_expanded")
      .select("*")
      .eq("id", classId)
      .single();

    if (error || !classItem) {
      return NextResponse.json({ success: false, message: "Class not found." }, { status: 404 });
    }

    // 2. Enrolled students from students_full view (with joined email & phone)
    let enrolledStudents: any[] = [];
    const { data: students, error: studErr } = await supabaseAdmin
      .from("students_full")
      .select("id, full_name, email, phone, semester, transport_access_suspended")
      .eq("class_id", classId);

    if (!studErr && students) {
      enrolledStudents = students;
    } else {
      const { data: fallbackStudents } = await supabaseAdmin
        .from("students")
        .select("id, full_name, semester, transport_access_suspended, users(email, phone)")
        .eq("class_id", classId);

      enrolledStudents = (fallbackStudents || []).map((s: any) => ({
        id: s.id,
        full_name: s.full_name,
        email: s.users?.email || "",
        phone: s.users?.phone || "",
        semester: s.semester,
        transport_access_suspended: s.transport_access_suspended,
      }));
    }

    // 3. Assigned teachers
    const { data: classTeachers } = await supabaseAdmin
      .from("class_teachers")
      .select("id, is_primary, users(id, full_name, email, phone)")
      .eq("class_id", classId);

    // 4. Shift Schedules (class_timetables was replaced by class_shift_schedules) from relational table
    const { data: scheds } = await supabaseAdmin
      .from("class_shift_schedules")
      .select("*")
      .eq("class_id", classId);
    const scheduleMap: Record<string, any> = {};
    for (const sc of (scheds || [])) {
      scheduleMap[sc.day_of_week.toLowerCase()] = {
        enabled: !sc.is_today_off,
        incomingShiftId: sc.incoming_shift_id,
        outgoingShiftId: sc.outgoing_shift_id,
      };
    }

    return NextResponse.json(
      {
        success: true,
        class: {
          ...classItem,
          shiftSchedule: scheduleMap,
        },
        students: enrolledStudents || [],
        teachers: (classTeachers || []).map(ct => ({
          id: (ct.users as any)?.id,
          fullName: (ct.users as any)?.full_name,
          email: (ct.users as any)?.email,
          phone: (ct.users as any)?.phone,
          isPrimary: ct.is_primary,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load class details." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const classId = params.id;
    const isElevated = session.role === "admin" || session.role === "transport_manager" || session.role === "transport_admin";
    const isTeacher = session.role === "teacher" || session.role === "faculty";

    if (!isElevated) {
      if (!isTeacher) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
      
      // Verify the teacher is the primary teacher for this class
      const { data: allocation } = await supabaseAdmin
        .from("class_teachers")
        .select("is_primary")
        .eq("class_id", classId)
        .eq("teacher_id", session.userId)
        .maybeSingle();

      if (!allocation || !allocation.is_primary) {
        return NextResponse.json({ success: false, error: "Forbidden: Only primary advisors can update class details." }, { status: 403 });
      }
    }

    const body = await req.json();
    const { course, year, section, isActive, shiftSchedule, department, semester } = body;

    const updates: Record<string, any> = {};
    if (isActive !== undefined) updates.is_active = isActive;
    if (semester !== undefined) updates.semester = semester;

    // Save shift schedule to class_shift_schedules table (Single Source of Truth)
    if (shiftSchedule && typeof shiftSchedule === "object") {
      const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      for (const d of dayNames) {
        if (shiftSchedule[d]) {
          const entry = shiftSchedule[d];
          const incId = entry.incomingShiftId || null;
          const outId = entry.outgoingShiftId || null;
          const isOff = entry.enabled === false || (!incId && !outId);
          await supabaseAdmin.from("class_shift_schedules").upsert({
            class_id: classId,
            day_of_week: d.toUpperCase(),
            incoming_shift_id: isOff ? null : incId,
            outgoing_shift_id: isOff ? null : outId,
            is_today_off: isOff,
          }, { onConflict: "class_id,day_of_week" });
        }
      }
    }

    if (course || year || section) {
      const { data: current } = await supabaseAdmin.from("v_classes_expanded").select("*").eq("id", classId).single();
      const c = course || current?.course || current?.name;
      const y = year || current?.year || current?.semester;
      const s = section ? section.trim().toUpperCase() : (current?.section || "A");
      updates.name = `${c} - ${y} (Sec ${s})`;
    }

    const { data: updated, error } = await supabaseAdmin
      .from("classes")
      .update(updates)
      .eq("id", classId)
      .select()
      .single();

    if (error) throw error;

    // Log audit
    await supabaseAdmin.from("audit_logs").insert({
      action: "UPDATE_CLASS",
      entity: "Class",
      entity_id: classId,
      reason: `Updated class details`,
      new_value: updated,
    });

    return NextResponse.json({ success: true, class: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update class." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session || !["admin", "transport_admin", "transport_manager"].includes(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: session ? 403 : 401 });
    }
    const classId = params.id;

    // Unassign students from class
    await supabaseAdmin.from("students").update({ class_id: null }).eq("class_id", classId);

    const { error } = await supabaseAdmin.from("classes").delete().eq("id", classId);
    if (error) throw error;

    await supabaseAdmin.from("audit_logs").insert({
      action: "DELETE_CLASS",
      entity: "Class",
      entity_id: classId,
      reason: `Deleted class ${classId}`,
    });

    return NextResponse.json({ success: true, message: "Class deleted successfully." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete class." },
      { status: 500 }
    );
  }
}
