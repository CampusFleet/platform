import TransportManagerHubView from "@/components/transport-manager/TransportManagerHubView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transport Manager | CampusFleet",
};

export default function TransportManagerDashboardPage() {
  return <TransportManagerHubView />;
}
