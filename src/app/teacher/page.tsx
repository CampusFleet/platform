import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import TeacherHubDashboard, {
  TeacherHubStats,
  TeacherClassOverview,
} from "@/components/teacher/TeacherHubDashboard";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teacher Desk | CampusFleet",
};

/**
 * Server Component: Teacher Hub Dashboard
 * Modular, card-based gateway matching Transport Admin Hub architecture.
 */
export default async function TeacherRootPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/teacher");
  }

  const teacherUserId = session.userId || (session as any).id;
  const isTeacherOrAdmin =
    session.role === "teacher" ||
    session.role === "faculty" ||
    session.role === "admin" ||
    session.role === "transport_manager";

  if (!isTeacherOrAdmin) {
    redirect("/portal");
  }

  // 1. Fetch allocated classes for this teacher
  const { data: allocations } = await supabaseAdmin
    .from("class_teachers")
    .select("class_id, is_primary")
    .eq("teacher_id", teacherUserId);

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
  let totalStudents = 0;
  let totalCommuters = 0;
  let studentMap: Record<string, { total: number; commuters: number }> = {};
  let studentIds: string[] = [];

  if (classIds.length > 0) {
    const { data: studentsData } = await supabaseAdmin
      .from("students")
      .select("id, class_id, transport_access_suspended")
      .in("class_id", classIds);

    (studentsData || []).forEach((s) => {
      studentIds.push(s.id);
      totalStudents += 1;
      const isCommuter = !s.transport_access_suspended;
      if (isCommuter) totalCommuters += 1;

      if (!studentMap[s.class_id]) {
        studentMap[s.class_id] = { total: 0, commuters: 0 };
      }
      studentMap[s.class_id].total += 1;
      if (isCommuter) studentMap[s.class_id].commuters += 1;
    });
  }

  // 3. Today's bus arrivals for students in teacher's classes (IST)
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0];
  const startOfDay = `${today}T00:00:00.000Z`;
  const endOfDay = `${today}T23:59:59.999Z`;

  let todayBoarded = 0;
  if (studentIds.length > 0) {
    const { count: attendanceCount } = await supabaseAdmin
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .in("student_id", studentIds)
      .gte("scanned_at", startOfDay)
      .lte("scanned_at", endOfDay);

    todayBoarded = attendanceCount || 0;
  }

  // 4. Pending gate pass requests for teacher's classes
  let pendingGatePasses = 0;
  if (classIds.length > 0) {
    const { count: passCount } = await supabaseAdmin
      .from("early_departure_requests")
      .select("id", { count: "exact", head: true })
      .in("class_id", classIds)
      .eq("status", "PENDING")
      .eq("request_date", new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10));

    pendingGatePasses = passCount || 0;
  }

  const classesOverview: TeacherClassOverview[] = allocatedClasses.map((c) => ({
    id: c.id,
    name: c.name,
    course: c.course || "B.Tech CSE",
    semester: c.semester || "Semester",
    section: c.section || "A",
    studentCount: studentMap[c.id]?.total || 0,
    activeCommuters: studentMap[c.id]?.commuters || 0,
    isPrimary: c.isPrimary ?? false,
  }));

  const stats: TeacherHubStats = {
    assignedClassesCount: allocatedClasses.length,
    totalStudents,
    todayCommuters: totalCommuters,
    todayBoarded,
    pendingGatePasses,
  };

  return (
    <TeacherHubDashboard
      teacher={{
        id: teacherUserId,
        name: session.fullName || (session as any).name || "Faculty Member",
        email: session.email,
        role: session.role,
      }}
      stats={stats}
      classes={classesOverview}
    />
  );
}
