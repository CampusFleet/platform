import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { getCrewDuty } from "@/lib/crew/duty";
import { ConductorProvider } from "@/components/conductor/ConductorContext";
import ConductorLayoutClient from "@/components/conductor/ConductorLayoutClient";
import { getAttendancePolicy } from "@/lib/attendance/server-policy";
import { AttendancePolicyProvider } from "@/lib/attendance/policy";

export const dynamic = "force-dynamic";

const ALLOWED = ["conductor", "admin", "transport_admin", "transport_manager"];

/**
 * Conductor portal. Data = the trip assigned to this conductor today (getCrewDuty), not a bus
 * the conductor picks. Drivers do not have access (they use /driver).
 */
export default async function ConductorLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/conductor");
  if (!ALLOWED.includes(session.role)) redirect(session.role === "driver" ? "/driver" : "/portal");

  const [duty, policy] = await Promise.all([getCrewDuty(session).catch(() => null), getAttendancePolicy()]);

  return (
    <AttendancePolicyProvider initial={policy}>
      <ConductorProvider initialUser={session} initialDuty={duty}>
        <ConductorLayoutClient>{children}</ConductorLayoutClient>
      </ConductorProvider>
    </AttendancePolicyProvider>
  );
}
