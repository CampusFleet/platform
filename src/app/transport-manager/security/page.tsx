import { getStaffServerData } from "@/lib/staff-data";
import { getSecurityIncidents } from "@/lib/biometrics";
import { SecurityIncidentsCenterView } from "@/components/transport-manager/SecurityIncidentsCenterView";
import type { BusSecurityIncident } from "@/lib/types";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Autonomous Transit Security Center | Transport Manager",
  description: "Real-time threat monitoring, unauthorized intruder interception, and autonomous biometric gate forensics.",
};

export const dynamic = "force-dynamic";

export default async function TransportManagerSecurityPage() {
  await getStaffServerData("/transport-manager/security");

  let initialIncidents: BusSecurityIncident[] = [];
  try {
    initialIncidents = await getSecurityIncidents({ limit: 100 });
  } catch (err) {
    console.warn("Server-side initial incidents fetch failed:", err);
  }

  return <SecurityIncidentsCenterView initialIncidents={initialIncidents} />;
}
