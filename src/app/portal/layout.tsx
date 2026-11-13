import React from "react";
import { getSession } from "@/lib/jwt";
import ClientPortalLayout from "./ClientPortalLayout";
import { getStudentAccess } from "@/lib/student-access";
import { getAttendancePolicy } from "@/lib/attendance/server-policy";
import { AttendancePolicyProvider } from "@/lib/attendance/policy";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  let isSubscribed = Boolean(session && session.role !== "student"); // staff/admin have access
  let photoUrl: string | null = null;

  if (session?.role === "student") {
    const access = await getStudentAccess(session.userId);
    isSubscribed = access.isSubscribed;
    photoUrl = access.photoUrl;
  }

  const policy = await getAttendancePolicy();
  return (
    <AttendancePolicyProvider initial={policy}>
      <ClientPortalLayout initialIsSubscribed={isSubscribed} initialPhotoUrl={photoUrl}>
        {children}
      </ClientPortalLayout>
    </AttendancePolicyProvider>
  );
}
