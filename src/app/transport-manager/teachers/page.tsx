import type { Metadata } from "next";
import TeacherRidesView from "@/components/transport-manager/TeacherRidesView";

export const metadata: Metadata = { title: "Teachers on the bus | Transport Manager" };

export default function TeacherRidesPage() {
  return <TeacherRidesView />;
}
