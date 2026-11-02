import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import TeacherCommuteView from "@/components/teacher/TeacherCommuteView";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Faculty Commute | CampusFleet",
};

export default async function TeacherCommutePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/teacher/commute");
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

  // Fetch teacher profile
  const { data: dbUser } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", teacherUserId)
    .single();

  const user = dbUser || {
    id: teacherUserId,
    name: session.fullName || (session as any).name || "Faculty",
    email: session.email,
    role: session.role,
  };

  // Fetch transit fleet data in parallel
  const [
    { data: buses },
    { data: stops },
    { data: shifts },
    { data: trips },
    { data: bookings },
    { data: routes },
  ] = await Promise.all([
    supabaseAdmin.from("buses").select("*").order("bus_number"),
    supabaseAdmin.from("stops").select("*").order("name"),
    supabaseAdmin.from("shifts").select("*").eq("is_active", true).order("start_time"),
    supabaseAdmin.from("trips").select("*").order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("bus_reservations_full").select("*").or(`student_id.eq.${teacherUserId},student_id.eq.stud-${teacherUserId}`).order("created_at", { ascending: false }).limit(10),
    supabaseAdmin.from("routes").select("*").eq("is_active", true).order("name"),
  ]);

  return (
    <TeacherCommuteView
      user={user}
      buses={buses || []}
      stops={stops || []}
      shifts={shifts || []}
      trips={trips || []}
      bookings={bookings || []}
      routes={routes || []}
    />
  );
}
