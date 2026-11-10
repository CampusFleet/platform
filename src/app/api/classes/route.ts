import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // 1. Fetch all classes from 3NF expanded view
    const { data: classes, error: classErr } = await supabaseAdmin
      .from("v_classes_expanded")
      .select("*")
      .order("name", { ascending: true });

    if (classErr) throw classErr;

    // 2. Fetch student counts per class
    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, class_id");

    const countMap = new Map<string, number>();
    if (students) {
      for (const s of students) {
        if (s.class_id) {
          countMap.set(s.class_id, (countMap.get(s.class_id) || 0) + 1);
        }
      }
    }

    // 3. Fetch assigned teachers
    const { data: classTeachers } = await supabaseAdmin
      .from("class_teachers")
      .select("class_id, is_primary, users(id, full_name, email)");

    const teachersMap = new Map<string, any[]>();
    if (classTeachers) {
      for (const ct of classTeachers) {
        const list = teachersMap.get(ct.class_id) || [];
        if (ct.users) {
          list.push({
            id: (ct.users as any).id,
            fullName: (ct.users as any).full_name,
            email: (ct.users as any).email,
            isPrimary: ct.is_primary,
          });
        }
        teachersMap.set(ct.class_id, list);
      }
    }

    const result = (classes || []).map(c => ({
      id: c.id,
      course: c.course,
      department: c.department || "Computer Science & Engineering",
      semester: c.semester || "4th Sem",
      year: c.year,
      section: c.section,
      specialization: c.specialization || "Core",
      name: c.name,
      isActive: c.is_active,
      createdAt: c.created_at,
      studentCount: countMap.get(c.id) || 0,
      assignedTeachers: teachersMap.get(c.id) || [],
      shiftSchedule: {},
    }));

    return NextResponse.json(
      { success: true, classes: result },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/classes error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load classes" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { course, year, section, assignedTeacherId } = body;

    // Every class belongs to a campus; default to the primary campus.
    let campusId: string | null = typeof body.campusId === "string" && body.campusId ? body.campusId : null;
    if (!campusId) {
      const { data: primary } = await supabaseAdmin
        .from("campuses")
        .select("id")
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();
      campusId = primary?.id || null;
    }
    if (!campusId) {
      return NextResponse.json({ success: false, message: "A campus is required for the class." }, { status: 400 });
    }

    if (!course || !year || !section) {
      return NextResponse.json(
        { success: false, message: "Course, Year, and Section are required." },
        { status: 400 }
      );
    }

    const name = `${course.trim()} - ${year.trim()} (Sec ${section.trim().toUpperCase()})`;

    // Check duplicate (same name at the same campus)
    const { data: existing } = await supabaseAdmin
      .from("classes")
      .select("id, name")
      .eq("name", name)
      .eq("campus_id", campusId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, message: `Class '${name}' already exists in the database.` },
        { status: 409 }
      );
    }

    // Resolve section_id from academic_sections
    const cleanSection = section.trim().toUpperCase();
    const { data: secRow } = await supabaseAdmin
      .from("academic_sections")
      .select("id")
      .eq("code", cleanSection)
      .maybeSingle();

    const insertPayload: Record<string, any> = {
      name,
      is_active: true,
      semester: year.trim(),
      campus_id: campusId,
    };
    if (secRow?.id) {
      insertPayload.section_id = secRow.id;
    }

    const { data: newClass, error } = await supabaseAdmin
      .from("classes")
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;

    // If a teacher was assigned during creation, allocate them
    if (assignedTeacherId) {
      await supabaseAdmin.from("class_teachers").insert({
        class_id: newClass.id,
        teacher_id: assignedTeacherId,
        is_primary: true,
      });
    }

    // Log audit trail
    await supabaseAdmin.from("audit_logs").insert({
      action: "CREATE_CLASS",
      entity: "Class",
      entity_id: newClass.id,
      reason: `Created class ${name}${assignedTeacherId ? " with primary teacher assigned" : ""}`,
      new_value: newClass,
    });

    return NextResponse.json({ success: true, class: newClass });
  } catch (error: any) {
    console.error("POST /api/classes error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create class" },
      { status: 500 }
    );
  }
}
