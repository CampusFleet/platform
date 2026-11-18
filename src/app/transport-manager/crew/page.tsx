import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { getFleetPlan } from "@/lib/manager/fleet-plan";
import CrewAssignmentView from "@/components/transport-manager/fleet-plan/CrewAssignmentView";

export const metadata: Metadata = { title: "Bus crew | Transport Manager" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session || !isManageRole(session.role)) redirect("/login?redirect=/transport-manager/crew");
  return <CrewAssignmentView initial={await getFleetPlan()} />;
}
