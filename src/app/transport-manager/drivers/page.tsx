import { redirect } from "next/navigation";

/** Crew is now a standing assignment per bus; one-off changes are on the dispatch board (/trips). */
export default function DriversPage() {
  redirect("/transport-manager/crew");
}
