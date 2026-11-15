import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/jwt";
import { getLeaveEarly } from "@/lib/students/leave-early";
import LeaveEarlyForm from "@/components/portal/LeaveEarlyForm";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leave early | CampusFleet" };

/** Student asks their class teacher to go home on an earlier bus today (lib/students/leave-early.ts). */
export default async function LeaveEarlyPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/portal/leave-early");
  if (session.role !== "student") {
    return (
      <Card className="max-w-md mx-auto mt-6">
        <EmptyState title="Leave early is for students">Teachers review requests in Gate Passes.</EmptyState>
      </Card>
    );
  }
  const initial = await getLeaveEarly(session.userId);
  return (
    <div className="w-full max-w-xl mx-auto px-3 sm:px-0 py-2">
      <LeaveEarlyForm initial={initial} />
    </div>
  );
}
