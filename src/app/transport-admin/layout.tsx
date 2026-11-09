"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import { 
  CreditCard, 
  GraduationCap, 
  Wrench, 
  Shield, 
  Home, 
  ShieldCheck, 
  QrCode, 
  CalendarCheck, 
  BookOpen, 
  Building2, 
  Users, 
  FileBarChart,
  Compass,
  BusFront,
  Route,
  MapPin,
  Navigation,
  Settings2,
  Radio,
  Cpu,
  Clock,
  Banknote
} from "lucide-react";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // 1. Define all desk sub-portal link definitions for Transport Admin (Staff)
  const subPortals = {
    billing: {
      title: "Bus Fees",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/billing/approvals", label: "Payment Approvals & Reconciliation", shortLabel: "Approvals", icon: ShieldCheck },
        { href: "/transport-admin/billing", label: "Fee Ledger & History", shortLabel: "Ledger", icon: CreditCard },
      ]
    },
    academics: {
      title: "Students & Passes",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/academics/students", label: "Student List", shortLabel: "Students", icon: GraduationCap },
        { href: "/transport-admin/academics/reservations", label: "Daily Bookings", shortLabel: "Bookings", icon: CalendarCheck },
        { href: "/transport-admin/classes", label: "Classes & Batches", shortLabel: "Classes", icon: BookOpen },
      ]
    },
    classes: {
      title: "Classes & Batches",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/classes", label: "Classes & Batches", shortLabel: "Classes", icon: BookOpen },
        { href: "/transport-admin/academics/students", label: "Student List", shortLabel: "Students", icon: GraduationCap },
      ]
    },
    maintenance: {
      title: "Bus Repairs",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/maintenance", label: "Repair Log", shortLabel: "Repairs", icon: Wrench },
      ]
    },
    buses: {
      title: "Bus Fleet",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/buses", label: "Bus Fleet", shortLabel: "Buses", icon: BusFront },
      ]
    },
    routes: {
      title: "Routes & Corridors",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/routes", label: "GIS Corridors & Stops", shortLabel: "Corridors", icon: Route },
        { href: "/transport-admin/routes/locations", label: "Campuses", shortLabel: "Campuses", icon: Building2 },
      ]
    },
    trips: {
      title: "Trips & Dispatches",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/trips", label: "Trips & Dispatches", shortLabel: "Trips", icon: Navigation },
        { href: "/transport-admin/shifts", label: "Shift Master", shortLabel: "Shifts", icon: Clock },
      ]
    },
    shifts: {
      title: "Shift Master Directory",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/trips", label: "Trips & Dispatches", shortLabel: "Trips", icon: Navigation },
        { href: "/transport-admin/shifts", label: "Shift Master", shortLabel: "Shifts", icon: Clock },
      ]
    },
    system: {
      title: "Accounts & Reports",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/system/users", label: "User Accounts", shortLabel: "Users", icon: Users },
        { href: "/transport-admin/system/reports", label: "Download Reports", shortLabel: "Reports", icon: FileBarChart },
      ]
    },
    transit: {
      title: "Smart Transit & Fleet Policies",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/transit", label: "Transit Policies", shortLabel: "Policies", icon: Settings2 },
        { href: "/transport-admin/rfid", label: "RFID Card Issuance", shortLabel: "Cards", icon: Radio },
        { href: "/transport-admin/buses", label: "Bus Fleet", shortLabel: "Fleet", icon: BusFront },
      ]
    },
    rfid: {
      title: "RFID & IoT Hardware",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/rfid", label: "RFID Card Issuance", shortLabel: "Cards", icon: Radio },
        { href: "/transport-admin/esp32", label: "ESP32 Terminals", shortLabel: "ESP32", icon: Cpu },
        { href: "/transport-admin/academics/students", label: "Student List", shortLabel: "Students", icon: GraduationCap },
      ]
    },
    salary: {
      title: "Staff Payroll & Salary Automation",
      items: [
        { href: "/transport-admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-admin/salary", label: "Staff Payroll", shortLabel: "Payroll", icon: Banknote },
        { href: "/transport-admin/system/users", label: "User Accounts", shortLabel: "Users", icon: Users },
      ]
    }
  };

  // 2. Determine current context based on URL (empty on hub root to avoid duplicating card access)
  let currentNavLinks: any[] = [];
  let currentTitle = "Transport Admin Desk";

  if (pathname.startsWith("/transport-admin/salary")) {
    currentNavLinks = subPortals.salary.items;
    currentTitle = subPortals.salary.title;
  } else if (pathname.startsWith("/transport-admin/rfid") || pathname.startsWith("/transport-admin/esp32")) {
    currentNavLinks = subPortals.rfid.items;
    currentTitle = subPortals.rfid.title;
  } else if (pathname.startsWith("/transport-admin/buses")) {
    currentNavLinks = subPortals.buses.items;
    currentTitle = subPortals.buses.title;
  } else if (pathname.startsWith("/transport-admin/routes")) {
    currentNavLinks = subPortals.routes.items;
    currentTitle = subPortals.routes.title;
  } else if (pathname.startsWith("/transport-admin/shifts")) {
    currentNavLinks = subPortals.shifts.items;
    currentTitle = subPortals.shifts.title;
  } else if (pathname.startsWith("/transport-admin/trips")) {
    currentNavLinks = subPortals.trips.items;
    currentTitle = subPortals.trips.title;
  } else if (pathname.startsWith("/transport-admin/billing")) {
    currentNavLinks = subPortals.billing.items;
    currentTitle = subPortals.billing.title;
  } else if (pathname.startsWith("/transport-admin/classes")) {
    currentNavLinks = subPortals.classes.items;
    currentTitle = subPortals.classes.title;
  } else if (pathname.startsWith("/transport-admin/academics")) {
    currentNavLinks = subPortals.academics.items;
    currentTitle = subPortals.academics.title;
  } else if (pathname.startsWith("/transport-admin/maintenance")) {
    currentNavLinks = subPortals.maintenance.items;
    currentTitle = subPortals.maintenance.title;
  } else if (pathname.startsWith("/transport-admin/transit") || pathname.startsWith("/transport-admin/settings/transit")) {
    currentNavLinks = subPortals.transit.items;
    currentTitle = subPortals.transit.title;
  } else if (pathname.startsWith("/transport-admin/system")) {
    currentNavLinks = subPortals.system.items;
    currentTitle = subPortals.system.title;
  }

  const isHubRoot = pathname === "/transport-admin";

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col ${isHubRoot ? "pb-6" : "pb-16 md:pb-6"} overflow-x-hidden transition-colors`}>
      
      <UnifiedAppHeader
        role="transport_admin"
        portalTitle={currentTitle}
        portalSubtitle="CampusFleet Admin Console"
        navLinks={currentNavLinks}
        mobilePrimaryAction={{
          label: "Transport Manager Operations",
          href: "/transport-manager",
          subtitle: "Switch to Transport Manager (if authorized)",
          icon: Compass,
        }}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Show sleek bottom navigation dock only when inside a desk sub-portal */}
      {!isHubRoot && (
        <MobileBottomNav 
          isPaymentApproved={true} 
          navItems={currentNavLinks} 
        />
      )}
    </div>
  );
}
