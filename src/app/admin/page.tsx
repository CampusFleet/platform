import { HubDashboardView, HubModule } from "@/components/common/HubDashboardView";
import { Wrench, Users, Building2, Compass, Banknote } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Hub | CampusFleet",
};

const adminModules: HubModule[] = [
  {
    title: "Staff Payroll & Salaries",
    description: "Automate daily, weekly, or monthly salary payouts for staff via Razorpay. Configure base pay, bonuses, and banking/UPI credentials.",
    icon: Banknote,
    href: "/admin/salary"
  },
  {
    title: "Maintenance Desk",
    description: "Review fleet service requests, manage mechanics, and track repair status.",
    icon: Wrench,
    href: "/admin/maintenance"
  },
  {
    title: "Accounts & Roles",
    description: "Manage administrators, configure user roles, and view institutional audit logs.",
    icon: Users,
    href: "/admin/users"
  },
  {
    title: "Campuses & Zones",
    description: "Configure university campus branches, GPS geofences, arrival gates, and transit corridor fare zones.",
    icon: Building2,
    href: "/admin/campuses"
  },
  {
    title: "Transport Admin Desk",
    description: "Switch to Transport Admin to manage bus fees, student passes, and office desk records.",
    icon: Building2,
    href: "/transport-admin"
  },
  {
    title: "Transport Manager Console",
    description: "Switch to Transport Manager to oversee buses, driver assignments, routes, and trips.",
    icon: Compass,
    href: "/transport-manager"
  }
];

export default function AdminPage() {
  return (
    <HubDashboardView 
      title="Master Admin Hub" 
      subtitle="Select an administration module to manage the platform."
      modules={adminModules}
    />
  );
}
