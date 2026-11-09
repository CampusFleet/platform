import StaffTransportSettingsView from "@/components/transport-admin/StaffTransportSettingsView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smart Transit Settings | CampusFleet",
  description: "Configure AI auto-assignment, walking distance limits, seat selection mode, and bus consolidation thresholds.",
};

export default function TransitSettingsPage() {
  return <StaffTransportSettingsView />;
}
