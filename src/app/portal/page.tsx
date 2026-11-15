import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { getStudentAccess } from "@/lib/student-access";
import { getDayOff, getPublicRide, getRideLive } from "@/lib/students/ride";
import CommuteHome from "@/components/portal/CommuteHome";
import OutgoingSeatPrompt from "@/components/portal/OutgoingSeatPrompt";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Student "My Commute". The server reads only this student's ride today (lib/students/ride.ts):
 * no fleet-wide lists, no trip ids, no placeholder data. Unpaid students go to onboarding.
 */
export default async function StudentPortalPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/portal");
  if (session.role !== "student") {
    return (
      <Card className="max-w-md mx-auto mt-6">
        <EmptyState title="My Commute is for students">Open your own portal from the menu.</EmptyState>
      </Card>
    );
  }
  const access = await getStudentAccess(session.userId);
  if (!access.isSubscribed) redirect("/portal/onboarding");

  const [{ dayOff, dayName }, ride, live] = await Promise.all([
    getDayOff(session.userId),
    getPublicRide(session.userId),
    getRideLive(session.userId),
  ]);

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-0 py-2 space-y-4">
      <OutgoingSeatPrompt />
      <CommuteHome ride={ride} live={live} dayOff={dayOff} dayName={dayName} />
    </div>
  );
}
