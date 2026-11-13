import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { getCrewDuty } from "@/lib/crew/duty";
import DriverConsole from "@/components/driver/DriverConsole";

export const dynamic = "force-dynamic";

const ALLOWED = ["driver", "admin", "transport_admin", "transport_manager"];

/** Driver console: today's trip assigned to this driver by the transport manager. */
export default async function DriverPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/driver");
  if (!ALLOWED.includes(session.role)) redirect(session.role === "conductor" ? "/conductor" : "/portal");
  const duty = await getCrewDuty(session).catch(() => null);
  return <DriverConsole initialUser={session} initialDuty={duty} />;
}
