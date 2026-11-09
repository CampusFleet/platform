"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { 
  BusFront,
  Users,
  Navigation,
  BarChart3,
  GitMerge,
  Building2,
  Radio,
  ShieldAlert,
  ScanFace,
  QrCode,
  ScanLine,
  Layers,
} from "lucide-react";
import { HubDashboardView, HubModule } from "@/components/common/HubDashboardView";
import { useAttendancePolicy } from "@/lib/attendance";

export default function TransportManagerHubView() {
  const { mode, rules } = useAttendancePolicy();

  const attendanceIcon = useMemo(() => {
    switch (mode) {
      case "DYNAMIC_QR":
        return <QrCode className="w-3.5 h-3.5 text-blue-500" />;
      case "RFID":
        return <Radio className="w-3.5 h-3.5 text-purple-500" />;
      case "STATIC_QR":
        return <ScanLine className="w-3.5 h-3.5 text-amber-500" />;
      case "ALL":
        return <Layers className="w-3.5 h-3.5 text-emerald-500" />;
      case "FACE_ID":
      default:
        return <ScanFace className="w-3.5 h-3.5 text-indigo-500" />;
    }
  }, [mode]);

  const modules = useMemo<HubModule[]>(() => {
    const list: HubModule[] = [
      {
        title: "Live Fleet Radar",
        description: "Multi-bus god-view GPS telematics, live vehicle cards, and remote conductor console mirroring.",
        icon: Radio,
        href: "/transport-manager/live",
      },
    ];

    // Security & Intruder Center only when Face ID or ALL is active
    if (mode === "FACE_ID" || mode === "ALL") {
      list.push({
        title: "Security & Intruder Center",
        description: "Autonomous dual-gate biometric telematics, instant intruder interception, and security incident resolution.",
        icon: ShieldAlert,
        href: "/transport-manager/security",
        badge: "Biometrics Live",
        badgeColor: "bg-rose-500/10 text-rose-600 border border-rose-500/20",
      });
    }

    list.push({
      title: "Assign Drivers",
      description: "Assign drivers and conductors to specific buses and shifts for today's service.",
      icon: Users,
      href: "/transport-manager/drivers",
    });

    // RFID Smart Cards only when RFID is primary or hybrid
    if (rules.isRfidIssuancePrimary) {
      list.push({
        title: "RFID Smart Cards",
        description: "Pair physical IoT cards to student IDs, replace lost tags, and monitor live terminal taps.",
        icon: Radio,
        href: "/transport-admin/rfid",
        badge: "Smart Cards",
        badgeColor: "bg-purple-500/10 text-purple-600 border border-purple-500/20",
      });
    }

    list.push(
      {
        title: "Today's Trips",
        description: "Monitor running morning and evening trips, track delays, and review halts.",
        icon: Navigation,
        href: "/transport-manager/trips",
      },
      {
        title: "Passenger Demand",
        description: "Analyze seat demand per route and optimize bus sizing to prevent overcrowding.",
        icon: BarChart3,
        href: "/transport-manager/demand",
      },
      {
        title: "Combine Buses",
        description: "Attendance-reconciled bus disassembly at merge stops & multi-corridor route stitching to maximize fuel savings.",
        icon: GitMerge,
        href: "/transport-manager/combine-buses",
      },
      {
        title: "Transport Admin Desk",
        description: "Jump to Transport Admin desk for student fees, pass approvals, and accounts.",
        icon: Building2,
        href: "/transport-admin",
      }
    );

    return list;
  }, [mode, rules]);

  const headerRight = (
    <Link
      href="/transport-admin/transit"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 shadow-xs text-xs font-semibold text-gray-700 dark:text-gray-300 transition-all hover:scale-102"
      title="View attendance mode in Transit Policy"
    >
      {attendanceIcon}
      <span>Policy:</span>
      <span className="font-black text-gray-900 dark:text-white">{rules.modeLabel}</span>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
    </Link>
  );

  return (
    <HubDashboardView
      title="Transport Manager Logistics"
      subtitle="Manage bus fleet, route planning, seat demand, and dynamic bus merging."
      modules={modules}
      headerRight={headerRight}
    />
  );
}
