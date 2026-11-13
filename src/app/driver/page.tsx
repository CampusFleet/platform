import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { getCrewDuty } from "@/lib/crew/duty";
import DriverConsole from "@/components/driver/DriverConsole";
import { getAttendancePolicy } from "@/lib/attendance/server-policy";
import { AttendancePolicyProvider } from "@/lib/attendance/policy";

export const dynamic = "force-dynamic";

const ALLOWED = ["driver", "admin", "transport_admin", "transport_manager"];

/** Driver console: today's trip assigned to this driver by the transport manager. */
export default async function DriverPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/driver");
  if (!ALLOWED.includes(session.role)) redirect(session.role === "conductor" ? "/conductor" : "/portal");
  const [duty, policy] = await Promise.all([getCrewDuty(session).catch(() => null), getAttendancePolicy()]);
  return (
    <AttendancePolicyProvider initial={policy}>
      <DriverConsole initialUser={session} initialDuty={duty} />
    </AttendancePolicyProvider>
  );
}
