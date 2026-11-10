import { getStaffServerData } from "@/lib/transport-admin-data";
import { supabaseAdmin } from "@/lib/supabaseClient";
import StaffStudentsView from "@/components/transport-admin/StaffStudentsView";

export const dynamic = "force-dynamic";

export default async function StaffAcademicsStudentsPage() {
  const data = await getStaffServerData("/transport-admin/academics/students");

  // The legacy `guardians` table was dropped; guardian details live in students.emergency_contact.
  const { data: dbClasses } = await supabaseAdmin
    .from("v_classes_expanded")
    .select("*")
    .order("name");

  return (
    <StaffStudentsView
      initialStudents={data.students}
      initialStops={data.stops}
      initialRoutes={data.routes}
      initialGuardians={[]}
      initialClasses={dbClasses || []}
    />
  );
}
