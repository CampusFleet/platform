import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { getDispatchBoard } from "@/lib/manager/dispatch";
import DispatchBoard from "@/components/transport-manager/DispatchBoard";

export const metadata: Metadata = { title: "Dispatch | Transport Manager" };
export const dynamic = "force-dynamic";

/** Today's trips and crew assignment share one dispatch board (lib/manager/dispatch.ts). */
export default async function DispatchPage() {
  const session = await getSession();
  if (!session || !isManageRole(session.role)) redirect("/login?redirect=/transport-manager/trips");
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return <DispatchBoard initial={await getDispatchBoard(today)} />;
}
