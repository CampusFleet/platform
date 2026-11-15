import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { getFleetLive } from "@/lib/manager/fleet-live";
import LiveFleetTelematicsView from "@/components/transport-manager/LiveFleetTelematicsView";

export const metadata: Metadata = { title: "Live fleet | Transport Manager" };
export const dynamic = "force-dynamic";

export default async function TransportManagerLiveFleetPage() {
  const session = await getSession();
  if (!session || !isManageRole(session.role)) redirect("/login?redirect=/transport-manager/live");
  return <LiveFleetTelematicsView initialRuns={await getFleetLive()} />;
}
