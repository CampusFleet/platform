import { HubDashboardView, HubModule } from "@/components/common/HubDashboardView";
import { 
  BusFront,
  Users,
  Navigation,
  BarChart3,
  GitMerge,
  Building2,
  Radio,
  ShieldAlert,
} from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transport Manager | CampusFleet",
};

const logisticsModules: HubModule[] = [
  {
    title: "Live Fleet Radar",
    description: "Multi-bus god-view GPS telematics, live vehicle cards, and remote conductor console mirroring.",
    icon: Radio,
    href: "/transport-manager/live",
  },
  {
    title: "Security & Intruder Center",
    description: "Autonomous dual-gate biometric telematics, instant intruder interception, and security incident resolution.",
    icon: ShieldAlert,
    href: "/transport-manager/security",
  },
  {
    title: "Assign Drivers",
    description: "Assign drivers and conductors to specific buses and shifts for today's service.",
    icon: Users,
    href: "/transport-manager/drivers",
  },
  {
    title: "RFID Smart Cards",
    description: "Pair physical IoT cards to student IDs, replace lost tags, and monitor live terminal taps.",
    icon: Radio,
    href: "/transport-admin/rfid"
  },
  {
    title: "Today's Trips",
    description: "Monitor running morning and evening trips, track delays, and review halts.",
    icon: Navigation,
    href: "/transport-manager/trips"
  },
  {
    title: "Passenger Demand",
    description: "Analyze seat demand per route and optimize bus sizing to prevent overcrowding.",
    icon: BarChart3,
    href: "/transport-manager/demand"
  },
  {
    title: "Combine Buses",
    description: "Attendance-reconciled bus disassembly at merge stops & multi-corridor route stitching to maximize fuel savings.",
    icon: GitMerge,
    href: "/transport-manager/combine-buses"
  },
  {
    title: "Transport Admin Desk",
    description: "Jump to Transport Admin desk for student fees, pass approvals, and accounts.",
    icon: Building2,
    href: "/transport-admin"
  }
];

export default function TransportManagerDashboardPage() {
  return (
    <HubDashboardView 
      title="Transport Manager Logistics" 
      subtitle="Manage bus fleet, route planning, seat demand, and dynamic bus merging."
      modules={logisticsModules}
    />
  );
}
