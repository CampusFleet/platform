import { Metadata } from "next";
import { getStaffServerData } from "@/lib/staff-data";
import { FaceIdMetricsView } from "@/components/transport-manager/FaceIdMetricsView";

export const metadata: Metadata = {
  title: "Face ID Pilot Metrics | Transport Manager",
  description: "Match rate, false alerts, latency and go/no-go criteria for Face ID boarding.",
};

export const dynamic = "force-dynamic";

export default async function FaceIdMetricsPage() {
  await getStaffServerData("/transport-manager/face-metrics");
  return <FaceIdMetricsView />;
}
