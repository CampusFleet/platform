import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Courses (academic_departments was replaced by the normalized academic_courses table)
    const { data: dbCourses } = await supabaseAdmin
      .from("academic_courses")
      .select("id, code, name, total_semesters")
      .order("name", { ascending: true });

    const dbDepartments = (dbCourses || []).map((c) => ({ id: c.id, code: c.code, name: c.name }));

    // 2. Semesters (academic_semesters no longer exists): 1..max(total_semesters)
    const maxSemesters = Math.max(0, ...(dbCourses || []).map((c) => Number(c.total_semesters) || 0));
    const dbSemesters = Array.from({ length: maxSemesters }, (_, i) => ({
      id: `semester-${i + 1}`,
      code: `SEM${i + 1}`,
      name: `Semester ${i + 1}`,
      order_index: i + 1,
    }));

    // 3. Fetch any additional distinct courses and years created by admins in classes table
    const { data: dbClasses } = await supabaseAdmin
      .from("v_classes_expanded")
      .select("course, year")
      .eq("is_active", true);

    const departmentMap = new Map<string, { id: string; code: string; name: string }>();
    if (dbDepartments && dbDepartments.length > 0) {
      for (const d of dbDepartments) {
        departmentMap.set(d.name.toLowerCase(), {
          id: d.id,
          code: d.code,
          name: d.name,
        });
      }
    }

    const semesterMap = new Map<string, { id: string; code: string; name: string; orderIndex: number }>();
    if (dbSemesters && dbSemesters.length > 0) {
      for (const s of dbSemesters) {
        semesterMap.set(s.name.toLowerCase(), {
          id: s.id,
          code: s.code,
          name: s.name,
          orderIndex: s.order_index,
        });
      }
    }

    // Merge in any custom courses from admin classes
    if (dbClasses) {
      for (const c of dbClasses) {
        if (c.course && !departmentMap.has(c.course.toLowerCase())) {
          departmentMap.set(c.course.toLowerCase(), {
            id: `course-${c.course.toLowerCase().replace(/\s+/g, "-")}`,
            code: c.course.slice(0, 10).toUpperCase(),
            name: c.course,
          });
        }
        if (c.year && !semesterMap.has(c.year.toLowerCase())) {
          semesterMap.set(c.year.toLowerCase(), {
            id: `year-${c.year.toLowerCase().replace(/\s+/g, "-")}`,
            code: c.year.slice(0, 10).toUpperCase(),
            name: c.year,
            orderIndex: 99,
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        departments: Array.from(departmentMap.values()),
        semesters: Array.from(semesterMap.values()).sort((a, b) => a.orderIndex - b.orderIndex),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/academic/programs error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load academic programs" },
      { status: 500 }
    );
  }
}
