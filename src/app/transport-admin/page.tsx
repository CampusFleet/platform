import { HubDashboardView, HubModule } from "@/components/common/HubDashboardView";
import { 
  Compass,
  CreditCard, 
  GraduationCap, 
  Wrench, 
  Shield, 
  BusFront,
  Route,
  Navigation,
  BookOpen,
  Building2,
  Radio,
  Banknote,
  Settings2
} from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transport Admin Desk | CampusFleet",
};

const staffModules: HubModule[] = [
  {
    title: "Staff Payroll & Salaries",
    description: "Automate daily, weekly, or monthly salary payouts for staff via Razorpay. Configure base pay, bonuses, and banking/UPI credentials.",
    icon: Banknote,
    href: "/transport-admin/salary"
  },
  {
    title: "Transport Manager Operations",
    description: "Switch to Transport Manager to manage driver allocations, live trips, demand, and bus combines.",
    icon: Compass,
    href: "/transport-manager"
  },
  {
    title: "Smart Transit & Attendance",
    description: "Configure fleet attendance verification policy (Face ID, Dynamic QR, RFID, Door QR), walk distance limits, seat allocation, and bus consolidation.",
    icon: Settings2,
    href: "/transport-admin/transit"
  },
  {
    title: "RFID Smart Cards",
    description: "Pair physical IoT cards to student IDs, replace lost tags, and monitor live terminal taps.",
    icon: Radio,
    href: "/transport-admin/rfid"
  },
  {
    title: "Bus Fleet",
    description: "Manage buses, vehicle registrations, seat layouts, and print seat QR codes.",
    icon: BusFront,
    href: "/transport-admin/buses"
  },
  {
    title: "Routes & Stops",
    description: "Manage bus corridors, pickup points, stop timings, and route geometry.",
    icon: Route,
    href: "/transport-admin/routes"
  },
  {
    title: "Today's Trips",
    description: "Monitor running morning and evening trips, track delays, and review halts.",
    icon: Navigation,
    href: "/transport-admin/trips"
  },
  {
    title: "Bus Fees & Reconciliation",
    description: "Reconcile Razorpay automated payments, verify student fee clearances, and manage the transport pass ledger.",
    icon: CreditCard,
    href: "/transport-admin/billing/approvals"
  },
  {
    title: "Students & Passes",
    description: "Search student photo directory, view bus seat reservations, and manage student transport passes.",
    icon: GraduationCap,
    href: "/transport-admin/academics/students"
  },
  {
    title: "Classes & Batches",
    description: "Manage academic departments, student batches, sections, timetables, and class advisors.",
    icon: BookOpen,
    href: "/transport-admin/classes"
  },
  {
    title: "Bus Repairs",
    description: "Track workshop maintenance, engine servicing, and breakdown tickets.",
    icon: Wrench,
    href: "/transport-admin/maintenance"
  },
  {
    title: "Staff & Reports",
    description: "Manage driver and conductor logins, and download daily attendance reports.",
    icon: Shield,
    href: "/transport-admin/system/users"
  }
];

export default function StaffRootPage() {
  return (
    <HubDashboardView 
      title="Transport Admin Desk" 
      subtitle="Manage fee approvals, student passes, staff accounts, repairs, and fleet logistics."
      modules={staffModules}
    />
  );
}
