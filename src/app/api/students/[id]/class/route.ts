import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { isSafeId } from "@/lib/security/safe-id";
import { STUDENT_ADMIN_ROLES } from "@/lib/security/student-scope";

// PATCH /api/students/[id]/class
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Class assignment is an administrative action
    const session = await getSessionFromRequest(req);
    if (!session || !STUDENT_ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: session ? 403 : 401 });
    }
    const studentId = params.id;
    if (!isSafeId(studentId)) {
      return NextResponse.json({ success: false, message: "Invalid student identifier." }, { status: 400 });
    }
    const body = await req.json();
    const { classId } = body;

    // 1. Fetch class details from DB
    let classItem: any = null;
    if (classId) {
      const { data, error } = await supabaseAdmin
        .from("classes")
        .select("id, name")
        .eq("id", classId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, message: "Selected university class does not exist." },
          { status: 404 }
        );
      }
      classItem = data;
    }

    // 2. Fetch current student
    const { data: studentsFound, error: stuErr } = await supabaseAdmin
      .from("students")
      .select("id, full_name, class_id")
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
      .limit(1);

    const student = studentsFound?.[0];

    if (stuErr || !student) {
      return NextResponse.json({ success: false, message: "Student record not found." }, { status: 404 });
    }

    // 3. Update student class directly in database
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("students")
      .update({
        class_id: classItem?.id || null,
      })
      .eq("id", student.id)
      .select()
      .single();

    if (upErr) throw upErr;

    // 4. Audit Log
    await supabaseAdmin.from("audit_logs").insert({
      user_role: "admin",
      action: "UPDATE_STUDENT_CLASS",
      entity: "Student",
      entity_id: student.id,
      previous_value: { class_id: student.class_id },
      new_value: { class_id: classItem?.id, class_name: classItem?.name },
      reason: classItem
        ? `Reassigned ${student.full_name} to ${classItem.name}`
        : `Removed ${student.full_name} from assigned class`,
    });

    return NextResponse.json({
      success: true,
      message: `Student assigned to ${classItem?.name || "Unassigned"}.`,
      student: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update student class." },
      { status: 500 }
    );
  }
}
