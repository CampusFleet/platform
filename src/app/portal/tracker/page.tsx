import { redirect } from "next/navigation";

export default function TrackerPage() {
  // Live tracking is automatically integrated into the student commute cockpit on /portal
  // when a bus starts or when the student is boarded. Redirect directly to /portal.
  redirect("/portal");
}
