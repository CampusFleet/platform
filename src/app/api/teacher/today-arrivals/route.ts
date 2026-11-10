import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSession } from "@/lib/jwt";

export const dynamic = "force-dynamic";

// GET /api/teacher/today-arrivals?teacherId=...&classId=...&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get("teacherId") || session?.userId || (session as any)?.id;
    const classIdParam = searchParams.get("classId");
    const isElevated = session?.role === "admin" || session?.role === "transport_manager";

    // 1. Determine authorized class IDs
    let authorizedClassIds: string[] = [];

    if (classIdParam && classIdParam !== "ALL") {
      authorizedClassIds = [classIdParam];
    } else if (teacherId && !isElevated) {
      // Find classes allocated to this teacher
      const { data: allocations } = await supabaseAdmin
        .from("class_teachers")
        .select("class_id, is_primary")
        .eq("teacher_id", teacherId);

      authorizedClassIds = (allocations || []).map((a) => a.class_id);

      if (authorizedClassIds.length === 0) {
        return NextResponse.json({
          success: true,
          arrivals: [],
          stats: { totalBoarded: 0, totalEnrolled: 0, pending: 0 },
          message: "No classes currently allocated to this teacher.",
        });
      }
    }

    // 2. Fetch all enrolled students for the target class(es), ordered ascending by name
    let studentQuery = supabaseAdmin
      .from("students_full")
      .select("id, full_name, class_id, class_name, email, phone")
      .order("full_name", { ascending: true });

    if (authorizedClassIds.length > 0) {
      studentQuery = studentQuery.in("class_id", authorizedClassIds);
    }

    const { data: enrolledStudents, error: stuErr } = await studentQuery;
    if (stuErr) throw stuErr;

    if (!enrolledStudents || enrolledStudents.length === 0) {
      return NextResponse.json({
        success: true,
        arrivals: [],
        stats: { totalBoarded: 0, totalEnrolled: 0, pending: 0 },
      });
    }

    // 3. Determine target date range (IST timezone aware)
    const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0];
    const startOfDay = `${today}T00:00:00.000Z`;
    const endOfDay = `${today}T23:59:59.999Z`;

    const studentIds = enrolledStudents.map((s) => s.id);

    // 4. Query today's attendance_records for all enrolled students
    const { data: attendances, error: attErr } = await supabaseAdmin
      .from("attendance_records")
      .select("id, student_id, trip_id, bus_id, status, timestamp, verified_by, notes")
      .in("student_id", studentIds)
      .gte("timestamp", startOfDay)
      .lte("timestamp", endOfDay)
      .order("timestamp", { ascending: false });

    if (attErr) throw attErr;

    // 5. Gather unique bus IDs & trip IDs to resolve bus names
    const busIds = Array.from(new Set((attendances || []).map((a) => a.bus_id).filter(Boolean)));
    const tripIds = Array.from(new Set((attendances || []).map((a) => a.trip_id).filter(Boolean)));

    const { data: buses } = busIds.length > 0
      ? await supabaseAdmin.from("buses").select("id, bus_number, plate_number:registration_no").in("id", busIds)
      : { data: [] };

    const { data: trips } = tripIds.length > 0
      ? await supabaseAdmin.from("trips").select("id, bus_id, route_id").in("id", tripIds)
      : { data: [] };

    const busMap = new Map<string, any>((buses || []).map((b) => [b.id, b]));
    const tripMap = new Map<string, any>((trips || []).map((t) => [t.id, t]));

    // Map the latest attendance record per student
    const attendanceByStudent = new Map<string, any>();
    for (const record of attendances || []) {
      if (!attendanceByStudent.has(record.student_id)) {
        attendanceByStudent.set(record.student_id, record);
      }
    }

    // 6. Build manifest for ALL enrolled students, ordered ascending by full_name
    let presentCount = 0;
    const arrivals = enrolledStudents.map((student, index) => {
      const record = attendanceByStudent.get(student.id);

      if (record) {
        presentCount++;
        let busLabel = "Bus";
        if (record.bus_id && busMap.has(record.bus_id)) {
          const b = busMap.get(record.bus_id);
          busLabel = b.bus_number ? `Bus ${b.bus_number}` : b.plate_number || b.name;
        } else if (record.trip_id && tripMap.has(record.trip_id)) {
          const trip = tripMap.get(record.trip_id);
          if (trip?.bus_id && busMap.has(trip.bus_id)) {
            const b = busMap.get(trip.bus_id);
            busLabel = b.bus_number ? `Bus ${b.bus_number}` : b.plate_number || b.name;
          } else {
            busLabel = `Trip ${record.trip_id.slice(-6)}`;
          }
        } else if (record.notes) {
          const match = record.notes.match(/Bus\s+([A-Za-z0-9-]+)/i);
          if (match) busLabel = match[1];
        }

        const boardingTimeFormatted = new Date(record.timestamp).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        });

        return {
          id: record.id,
          sno: index + 1,
          studentId: student.id,
          studentName: student.full_name,
          classId: student.class_id,
          className: student.class_name || "Assigned Section",
          busId: record.bus_id,
          busName: busLabel,
          boardingTime: boardingTimeFormatted,
          timestamp: record.timestamp,
          status: "Present",
          verifiedBy: record.verified_by,
        };
      }

      // Student is enrolled in this class but has NOT scanned onto a bus today -> Absent
      return {
        id: `absent-${student.id}`,
        sno: index + 1,
        studentId: student.id,
        studentName: student.full_name,
        classId: student.class_id,
        className: student.class_name || "Assigned Section",
        busId: undefined,
        busName: "—",
        boardingTime: "—",
        timestamp: "",
        status: "Absent",
        verifiedBy: undefined,
      };
    });

    const totalEnrolled = enrolledStudents.length;
    const totalBoarded = presentCount;
    const pending = totalEnrolled - totalBoarded;

    return NextResponse.json({
      success: true,
      arrivals,
      stats: {
        totalBoarded,
        totalEnrolled,
        pending,
      },
    });
  } catch (error: any) {
    console.error("GET /api/teacher/today-arrivals error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load today's bus arrivals." },
      { status: 500 }
    );
  }
}
