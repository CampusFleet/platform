import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import TeacherAttendanceView, {
  AttendanceClassItem,
  StudentArrivalItem,
} from "@/components/teacher/TeacherAttendanceView";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Class Attendance & Arrivals | CampusFleet",
};

export default async function TeacherAttendancePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/teacher/attendance");
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

  // 2. Fetch students in these classes
  let studentsData: any[] = [];
  if (classIds.length > 0) {
    const { data: stdRes } = await supabaseAdmin
      .from("students_full")
      .select("id, full_name, email, phone, class_id, class_name, primary_stop_name, photo_url")
      .in("class_id", classIds)
      .order("full_name", { ascending: true });
    studentsData = stdRes || [];
  }

  // 3. Fetch today's attendance records (IST)
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0];
  const startOfDay = `${today}T00:00:00.000Z`;
  const endOfDay = `${today}T23:59:59.999Z`;

  const studentIds = studentsData.map((s) => s.id);
  const attendanceMap = new Map<string, any>();

  if (studentIds.length > 0) {
    const { data: attRecords } = await supabaseAdmin
      .from("attendance_records")
      .select("id, student_id, trip_id, scanned_at:timestamp, buses(bus_number)")
      .in("student_id", studentIds)
      .gte("timestamp", startOfDay)
      .lte("scanned_at", endOfDay)
      .order("scanned_at", { ascending: false });

    (attRecords || []).forEach((r) => {
      if (!attendanceMap.has(r.student_id)) {
        attendanceMap.set(r.student_id, r);
      }
    });
  }

  // Count students per class
  const studentCountByClass = new Map<string, number>();
  studentsData.forEach((s) => {
    if (s.class_id) {
      studentCountByClass.set(s.class_id, (studentCountByClass.get(s.class_id) || 0) + 1);
    }
  });

  const classes: AttendanceClassItem[] = allocatedClasses.map((c) => ({
    id: c.id,
    name: c.name,
    course: c.course || "B.Tech CSE",
    semester: c.semester || "Semester",
    section: c.section || "A",
    studentCount: studentCountByClass.get(c.id) || 0,
  }));

  const arrivals: StudentArrivalItem[] = studentsData.map((s) => {
    const att = attendanceMap.get(s.id);
    return {
      id: s.id,
      name: s.full_name || "Student",
      email: s.email,
      phone: s.phone,
      photoUrl: s.photo_url,
      classId: s.class_id,
      className: s.class_name,
      stopName: s.primary_stop_name || "Assigned Stop",
      busNumber: (att?.buses as any)?.bus_number || null,
      hasBoarded: Boolean(att),
      boardedAt: att?.scanned_at || null,
    };
  });

  return (
    <TeacherAttendanceView
      initialClasses={classes}
      initialArrivals={arrivals}
    />
  );
}
