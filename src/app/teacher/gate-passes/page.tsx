import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/jwt";
import { REVIEW_ALL_ROLES, listGatePasses } from "@/lib/teachers/gate-passes";
import TeacherGatePassesView from "@/components/teacher/TeacherGatePassesView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gate passes | CampusFleet" };

export default async function TeacherGatePassesPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/teacher/gate-passes");
  if (!["teacher", "faculty", ...REVIEW_ALL_ROLES].includes(session.role)) redirect("/portal");
  const { items, classes } = await listGatePasses(session.userId, session.role);
  return <TeacherGatePassesView initialRequests={items} classes={classes} />;
}
