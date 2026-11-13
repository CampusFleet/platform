import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { getPublicRide } from "@/lib/students/ride";
import FullScreenLiveRadarView from "@/components/portal/FullScreenLiveRadarView";

export const dynamic = "force-dynamic";

/**
 * Student live radar. The server reads only this student's ride today (src/lib/students/ride.ts);
 * the client then refreshes /api/students/ride/live. A ?busId= query is ignored: a student can only
 * watch their own bus.
 */
export default async function LiveRadarPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/portal/radar");
  if (session.role !== "student") redirect("/portal");
  const ride = await getPublicRide(session.userId);
  return <FullScreenLiveRadarView initialRide={ride} />;
}
