import TransportAdminHubView from "@/components/transport-admin/TransportAdminHubView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transport Admin Desk | CampusFleet",
};

export default function StaffRootPage() {
  return <TransportAdminHubView />;
}
