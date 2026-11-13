import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/jwt";
import { getStudentAccess } from "@/lib/student-access";

/** Students who already have an active pass never see onboarding (same rule as the portal layout). */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.role === "student" && (await getStudentAccess(session.userId)).isSubscribed) redirect("/portal");
  return <>{children}</>;
}
