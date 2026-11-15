import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/jwt";
import { getTeacherRide, getTeacherRideLive } from "@/lib/teachers/ride";
import CommuteHome from "@/components/portal/CommuteHome";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Commute | CampusFleet" };

/** Teacher commute: the teacher's own ride today (lib/teachers/ride.ts), same screen as students. */
export default async function TeacherCommutePage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/teacher/commute");
  if (!["teacher", "faculty"].includes(session.role)) {
    return (
      <Card className="max-w-md mx-auto mt-6">
        <EmptyState title="This page is for teachers" />
      </Card>
    );
  }
  const [ride, live] = await Promise.all([getTeacherRide(session.userId), getTeacherRideLive(session.userId)]);
  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-0 py-2">
      <CommuteHome ride={ride} live={live} dayOff={false} dayName="" audience="teacher" />
    </div>
  );
}
