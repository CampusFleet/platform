"use client";

import React, { useMemo } from "react";
import Link from "next/link";
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
  Radio,
  Banknote,
  Settings2,
  ScanFace,
  QrCode,
  ScanLine,
  Layers,
  Sliders,
} from "lucide-react";
import { HubDashboardView, HubModule } from "@/components/common/HubDashboardView";
import { useAttendancePolicy } from "@/lib/attendance";

export default function TransportAdminHubView() {
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
        title: "Staff Payroll & Salaries",
        description: "Automate daily, weekly, or monthly salary payouts for staff via Razorpay. Configure base pay, bonuses, and banking/UPI credentials.",
        icon: Banknote,
        href: "/transport-admin/salary",
      },
      {
        title: "Transport Manager Operations",
        description: "Switch to Transport Manager to manage driver allocations, live trips, demand, and bus combines.",
        icon: Compass,
        href: "/transport-manager",
      },
      {
        title: "Smart Transit & Attendance",
        description: "Configure fleet attendance verification policy (Face ID, Dynamic QR, RFID, Door QR), walk distance limits, seat allocation, and bus consolidation.",
        icon: Settings2,
        href: "/transport-admin/transit",
        badge: rules.modeLabel,
        badgeColor:
          mode === "FACE_ID"
            ? "bg-indigo-500/10 text-indigo-600 border border-indigo-500/20"
            : mode === "DYNAMIC_QR"
            ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
            : mode === "RFID"
            ? "bg-purple-500/10 text-purple-600 border border-purple-500/20"
            : mode === "STATIC_QR"
            ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
            : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
      },
    ];

    // Only display RFID Smart Cards card if RFID is primary or hybrid
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
        title: "Bus Fleet",
        description: "Manage buses, vehicle registrations, seat layouts, and fleet telemetry units.",
        icon: BusFront,
        href: "/transport-admin/buses",
      },
      {
        title: "Routes & Stops",
        description: "Manage bus corridors, pickup points, stop timings, and route geometry.",
        icon: Route,
        href: "/transport-admin/routes",
      },
      {
        title: "Today's Trips",
        description: "Monitor running morning and evening trips, track delays, and review halts.",
        icon: Navigation,
        href: "/transport-admin/trips",
      },
      {
        title: "Bus Fees & Reconciliation",
        description: "Reconcile Razorpay automated payments, verify student fee clearances, and manage the transport pass ledger.",
        icon: CreditCard,
        href: "/transport-admin/billing/approvals",
      },
      {
        title: mode === "FACE_ID" ? "Student Biometrics & Passes" : "Students & Passes",
        description:
          mode === "FACE_ID"
            ? "Search student photo directory, manage face biometric embeddings, and oversee bus seat reservations."
            : mode === "DYNAMIC_QR"
            ? "Search student directory, verify cryptographic QR pass eligibility, and manage seat reservations."
            : "Search student photo directory, view bus seat reservations, and manage student transport passes.",
        icon: GraduationCap,
        href: "/transport-admin/academics/students",
        badge: mode === "FACE_ID" ? "Face ID Enrolled" : undefined,
        badgeColor: "bg-indigo-500/10 text-indigo-600 border border-indigo-500/20",
      },
      {
        title: "Classes & Batches",
        description: "Manage academic departments, student batches, sections, timetables, and class advisors.",
        icon: BookOpen,
        href: "/transport-admin/classes",
      },
      {
        title: "Bus Repairs",
        description: "Track workshop maintenance, engine servicing, and breakdown tickets.",
        icon: Wrench,
        href: "/transport-admin/maintenance",
      },
      {
        title: "Staff & Reports",
        description: "Manage driver and conductor logins, and download daily attendance reports.",
        icon: Shield,
        href: "/transport-admin/system/users",
      }
    );

    return list;
  }, [mode, rules]);

  const headerRight = (
    <Link
      href="/transport-admin/transit"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 shadow-xs text-xs font-semibold text-gray-700 dark:text-gray-300 transition-all hover:scale-102"
      title="Click to view or change attendance mode in Transit Policy"
    >
      {attendanceIcon}
      <span>Policy:</span>
      <span className="font-black text-gray-900 dark:text-white">{rules.modeLabel}</span>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
    </Link>
  );

  return (
    <HubDashboardView
      title="Transport Admin Desk"
      subtitle="Manage fee approvals, student passes, staff accounts, repairs, and fleet logistics."
      modules={modules}
      headerRight={headerRight}
    />
  );
}
