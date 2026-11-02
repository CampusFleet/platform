"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";

import {
  Wrench,
  Users,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Home,
  Compass,
  Building2,
  Banknote,
} from "lucide-react";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(() => store.getCurrentUser());

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
    });
    return unsub;
  }, []);

  // Access Barrier: Only Master Admin can access the Admin Portal
  const isAdmin = currentUser?.role === "admin";
  if (currentUser && !isAdmin) {
    const role = currentUser.role;
    const isTransportAdmin = role === "transport_admin";
    const isTransportManager = role === "transport_manager";
    const isDriver = role === "driver";
    const isConductor = role === "conductor";

    const targetPortal = isTransportAdmin
      ? "/transport-admin"
      : isTransportManager
      ? "/transport-manager"
      : isDriver
      ? "/driver"
      : isConductor
      ? "/conductor"
      : "/portal";

    const targetLabel = isTransportAdmin
      ? "Go to Transport Admin Desk"
      : isTransportManager
      ? "Go to Transport Manager Console"
      : isDriver
      ? "Go to Driver Cockpit"
      : isConductor
      ? "Go to Conductor Console"
      : "Go to Student Portal";

    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-gray-800 rounded-3xl p-8 border border-gray-700 shadow-2xl text-center space-y-4 animate-in fade-in">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black">Access Restricted</h2>
          <p className="text-xs text-gray-300">
            {isTransportAdmin
              ? "Transport Admin officers cannot access the Master Admin Console. Administrative tasks are managed in the Transport Admin Desk."
              : isTransportManager
              ? "Transport Managers cannot access the Master Admin Console. Fleet tasks are managed in the Transport Manager Console."
              : isDriver
              ? "Drivers cannot access the Master Admin Console. Please navigate to the Driver Telematics Console."
              : isConductor
              ? "Conductors cannot access the Master Admin Console. Please navigate to the Conductor Manifest Console."
              : "Administrator privileges are required to access the CampusFleet Operations Center."}
          </p>
          <div className="pt-2">
            <Link
              href={targetPortal}
              className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-xs shadow-lg transition-all"
            >
              <span>{targetLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Define the sub-portals for Admin
  const subPortals = {
    maintenance: {
      title: "Maintenance Desk",
      items: [
        { href: "/admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/admin/maintenance", label: "Workshop", shortLabel: "Workshop", icon: Wrench },
        { href: "/transport-admin", label: "Transport Admin", shortLabel: "Admin Desk", icon: ShieldCheck },
        { href: "/transport-manager", label: "Transport Manager", shortLabel: "Fleet Ops", icon: Compass },
      ]
    },
    users: {
      title: "Accounts & Roles",
      items: [
        { href: "/admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/admin/users", label: "User Accounts", shortLabel: "Users", icon: Users },
        { href: "/admin/campuses", label: "Campuses & Zones", shortLabel: "Campuses", icon: Building2 },
        { href: "/transport-admin", label: "Transport Admin", shortLabel: "Admin Desk", icon: ShieldCheck },
        { href: "/transport-manager", label: "Transport Manager", shortLabel: "Fleet Ops", icon: Compass },
      ]
    },
    campuses: {
      title: "Campus Locations & Geofences",
      items: [
        { href: "/admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/admin/campuses", label: "Campuses & Zones", shortLabel: "Campuses", icon: Building2 },
        { href: "/admin/users", label: "User Accounts", shortLabel: "Users", icon: Users },
        { href: "/admin/maintenance", label: "Workshop", shortLabel: "Workshop", icon: Wrench },
      ]
    },
    salary: {
      title: "Staff Payroll & Automated Salaries",
      items: [
        { href: "/admin", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/admin/salary", label: "Staff Payroll", shortLabel: "Payroll", icon: Banknote },
        { href: "/admin/users", label: "Accounts & Roles", shortLabel: "Accounts", icon: Users },
        { href: "/transport-admin", label: "Transport Admin Desk", shortLabel: "Admin Desk", icon: ShieldCheck },
      ]
    }
  };

  // Determine active sub-portal navigation based on pathname (empty on hub root to avoid duplicating card access)
  let currentNavLinks: any[] = [];
  let currentTitle = "Admin Operations Center";

  if (pathname.startsWith("/admin/maintenance")) {
    currentNavLinks = subPortals.maintenance.items;
    currentTitle = subPortals.maintenance.title;
  } else if (pathname.startsWith("/admin/users")) {
    currentNavLinks = subPortals.users.items;
    currentTitle = subPortals.users.title;
  } else if (pathname.startsWith("/admin/campuses")) {
    currentNavLinks = subPortals.campuses.items;
    currentTitle = subPortals.campuses.title;
  } else if (pathname.startsWith("/admin/salary")) {
    currentNavLinks = subPortals.salary.items;
    currentTitle = subPortals.salary.title;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col pb-16 md:pb-6 overflow-x-hidden transition-colors">
      
      <UnifiedAppHeader
        role="admin"
        portalTitle={currentTitle}
        portalSubtitle="Fleet Command & Control"
        navLinks={currentNavLinks}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Render mobile bottom dock only when inside a subportal with items */}
      {currentNavLinks.length > 0 && (
        <MobileBottomNav 
          isPaymentApproved={true} 
          navItems={currentNavLinks} 
        />
      )}
    </div>
  );
}
