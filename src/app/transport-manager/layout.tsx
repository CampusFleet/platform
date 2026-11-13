"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { store } from "@/lib/store";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import {
  BusFront,
  Navigation,
  BarChart3,
  GitMerge,
  Home,
  Users,
  GitBranch,
  Radio,
  ShieldAlert,
} from "lucide-react";
import { SecurityThreatAlertBanner } from "@/components/transport-manager/SecurityThreatAlertBanner";

export default function TransportManagerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<any>(() => store.getCurrentUser());

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
    });
    return unsub;
  }, []);

  // 1. Define sub-portal link definitions for each Transport Manager card
  const subPortals = {
    live: {
      title: "Live Fleet Radar",
      subtitle: "Multi-Bus God-View & Conductor Perspective Mirror",
      items: [
        { href: "/transport-manager", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-manager/live", label: "Live Fleet Radar", shortLabel: "Live", icon: Radio },
      ],
    },
    trips: {
      title: "Today's Trips",
      subtitle: "Corridor Flowchart & Stop Bus Allocation",
      items: [
        { href: "/transport-manager", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-manager/trips", label: "Today's Trips", shortLabel: "Trips", icon: Navigation },
      ],
    },
    drivers: {
      title: "Assign Drivers",
      subtitle: "Crew Dispatch & Role Qualifications",
      items: [
        { href: "/transport-manager", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-manager/drivers", label: "Crew Assignment", shortLabel: "Drivers", icon: Users },
      ],
    },
    demand: {
      title: "Passenger Demand",
      subtitle: "Route Seat Demand & Sizing Analytics",
      items: [
        { href: "/transport-manager", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-manager/demand", label: "Route Demand", shortLabel: "Demand", icon: BarChart3 },
      ],
    },
    combine: {
      title: "Combine Buses",
      subtitle: "Attendance-Reconciled Bus Disassembly & Route Stitching",
      items: [
        { href: "/transport-manager", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-manager/combine-buses", label: "Combine Buses", shortLabel: "Combine", icon: GitMerge },
      ],
    },
    security: {
      title: "Autonomous Transit Security Center",
      subtitle: "Real-Time Intruder Interception & Gate Biometrics Forensics",
      items: [
        { href: "/transport-manager", label: "← Hub", shortLabel: "Hub", icon: Home },
        { href: "/transport-manager/security", label: "Security Center", shortLabel: "Security", icon: ShieldAlert },
        { href: "/transport-manager/face-metrics", label: "Face ID Metrics", shortLabel: "Metrics", icon: BarChart3 },
        { href: "/transport-manager/live", label: "Live Fleet Radar", shortLabel: "Live", icon: Radio },
      ],
    },
  };

  // 2. Determine active sub-portal navigation based on pathname (empty on hub root to avoid duplicating card access)
  let currentNavLinks: any[] = [];
  let currentTitle = "Transport Manager Logistics";
  let currentSubtitle = "Fleet Logistics & Bus Operations";

  if (pathname.startsWith("/transport-manager/live")) {
    currentNavLinks = subPortals.live.items;
    currentTitle = subPortals.live.title;
    currentSubtitle = subPortals.live.subtitle;
  } else if (pathname.startsWith("/transport-manager/security") || pathname.startsWith("/transport-manager/face-metrics")) {
    currentNavLinks = subPortals.security.items;
    currentTitle = subPortals.security.title;
    currentSubtitle = subPortals.security.subtitle;
  } else if (pathname.startsWith("/transport-manager/trips") || pathname.startsWith("/transport-manager/flowchart")) {
    currentNavLinks = subPortals.trips.items;
    currentTitle = subPortals.trips.title;
    currentSubtitle = subPortals.trips.subtitle;
  } else if (pathname.startsWith("/transport-manager/drivers")) {
    currentNavLinks = subPortals.drivers.items;
    currentTitle = subPortals.drivers.title;
    currentSubtitle = subPortals.drivers.subtitle;
  } else if (pathname.startsWith("/transport-manager/demand")) {
    currentNavLinks = subPortals.demand.items;
    currentTitle = subPortals.demand.title;
    currentSubtitle = subPortals.demand.subtitle;
  } else if (pathname.startsWith("/transport-manager/combine-buses")) {
    currentNavLinks = subPortals.combine.items;
    currentTitle = subPortals.combine.title;
    currentSubtitle = subPortals.combine.subtitle;
  }

  const isHubRoot = pathname === "/transport-manager";

  return (
    <div className={`min-h-[100dvh] bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col ${isHubRoot ? "pb-6" : "pb-16 md:pb-6"} overflow-x-clip transition-colors`}>
      <SecurityThreatAlertBanner />
      <UnifiedAppHeader
        role="transport_manager"
        portalTitle={currentTitle}
        portalSubtitle={currentSubtitle}
        navLinks={currentNavLinks}
        mobilePrimaryAction={{
          label: "Transport Admin Desk",
          href: "/transport-admin",
          subtitle: "Switch to Transport Admin (if authorized)",
          icon: Home,
        }}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        {children}
      </main>

      {!isHubRoot && <MobileBottomNav navItems={currentNavLinks} />}
    </div>
  );
}

