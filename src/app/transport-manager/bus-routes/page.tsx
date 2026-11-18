import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { getFleetPlan } from "@/lib/manager/fleet-plan";
import BusRoutesView from "@/components/transport-manager/fleet-plan/BusRoutesView";

export const metadata: Metadata = { title: "Bus routes | Transport Manager" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session || !isManageRole(session.role)) redirect("/login?redirect=/transport-manager/bus-routes");
  return <BusRoutesView initial={await getFleetPlan()} />;
}
