"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { store } from "@/lib/store";
import {
  CreditCard,
  Settings as SettingsIcon,
  BusFront,
  QrCode,
  MessageSquare,
  MoreHorizontal,
  X,
  Home,
  Building2,
  Radio,
  Clock,
  Route,
  Navigation,
  BookOpen,
  LayoutGrid,
  AlertTriangle,
  Users,
  Wrench,
  TrendingUp,
  GitMerge,
  Compass,
  FileBarChart,
  GraduationCap,
  FileText,
  ShieldCheck,
  ScanFace,
  ScanLine,
} from "lucide-react";
import { useAttendancePolicy } from "@/lib/attendance";

export interface MobileBottomNavItem {
  id?: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  label: string;
  icon: any;
  highlight?: boolean;
  badge?: number | string;
}

export interface MobileBottomNavProps {
  isPaymentApproved?: boolean;
  navItems?: MobileBottomNavItem[];
  unreadCount?: number;
  onOpenSettings?: () => void;
  role?: string;
}

/**
 * Common, unified CampusFleet mobile navigation bar.
 * Adheres to modern mobile web navigation standards:
 * 1. Single source of truth for mobile bottom navigation across all portals.
 * 2. Role-aware default destinations with first-class Chat integration.
 * 3. 6-item maximum thumb-zone dock with 3-dot "More" bottom sheet overflow.
 * 4. Reactive store synchronization and active pathname tracking.
 */
export function MobileBottomNav({
  isPaymentApproved = true,
  navItems,
  unreadCount = 0,
  onOpenSettings,
  role: propRole,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(store.getCurrentUser());
  const { mode: policyMode, rules: policyRules } = useAttendancePolicy();

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
    });
    return unsub;
  }, []);

  // Close overflow sheet upon route navigation
  useEffect(() => {
    setIsMoreOpen(false);
  }, [pathname]);

  // Hide on onboarding to avoid navigation dock overlap
  if (pathname?.startsWith("/portal/onboarding")) {
    return null;
  }

  const effectiveRole =
    propRole ||
    currentUser?.role ||
    (pathname.startsWith("/admin")
      ? "admin"
      : pathname.startsWith("/transport-admin")
      ? "transport_admin"
      : pathname.startsWith("/transport-manager")
      ? "transport_manager"
      : pathname.startsWith("/conductor")
      ? "conductor"
      : pathname.startsWith("/driver")
      ? "driver"
      : pathname.startsWith("/teacher")
      ? "teacher"
      : "student");

  // Determine standard role-based destinations if custom navItems are not provided
  const getRoleNavItems = (): MobileBottomNavItem[] => {
    switch (effectiveRole) {
      case "teacher":
        return [
          {
            id: "attendance",
            href: "/teacher",
            label: "Attendance",
            icon: BookOpen,
            highlight: true,
          },
          {
            id: "commute",
            href: "/teacher?tab=my_commute",
            label: "My Commute",
            icon: BusFront,
          },
          {
            id: "chat",
            href: "/chat",
            label: "Chat",
            icon: MessageSquare,
            badge: unreadCount > 0 ? unreadCount : undefined,
          },
          {
            id: "settings",
            href: "/teacher/settings",
            label: "Settings",
            icon: SettingsIcon,
            onClick: onOpenSettings,
          },
        ];

      case "driver":
        return [
          {
            id: "hud",
            href: "/driver",
            label: "Driver HUD",
            icon: BusFront,
            highlight: true,
          },
          {
            id: "inspection",
            href: "/driver",
            label: "Checklist",
            icon: ShieldCheck,
          },
          {
            id: "chat",
            href: "/chat",
            label: "Chat",
            icon: MessageSquare,
            badge: unreadCount > 0 ? unreadCount : undefined,
          },
          {
            id: "settings",
            href: "/driver/settings",
            label: "Settings",
            icon: SettingsIcon,
            onClick: onOpenSettings,
          },
        ];

      case "conductor":
        return [
          {
            id: "hub",
            href: "/conductor",
            label: "Conductor",
            icon: Home,
            highlight: true,
          },
          {
            id: "manifest",
            href: "/conductor/manifest",
            label: "Manifest",
            icon: FileText,
          },
          {
            id: "scanner",
            href: "/conductor/scanner",
            label: policyRules.conductorScannerRole === "PRIMARY" ? "Scanner" : "Backup Scan",
            icon: QrCode,
          },
          {
            id: "seatMap",
            href: "/conductor/seat-map",
            label: "Seat Map",
            icon: LayoutGrid,
          },
          {
            id: "lateRequests",
            href: "/conductor/late-requests",
            label: "Late SOS",
            icon: AlertTriangle,
          },
          {
            id: "audit",
            href: "/conductor/audit",
            label: "Audit",
            icon: ShieldCheck,
          },
          ...(policyRules.isConductorBusQrActive
            ? [
                {
                  id: "busQr",
                  href: "/conductor/bus-qr",
                  label: "Bus QR",
                  icon: QrCode,
                },
              ]
            : []),
          {
            id: "chat",
            href: "/chat",
            label: "Chat",
            icon: MessageSquare,
            badge: unreadCount > 0 ? unreadCount : undefined,
          },
          {
            id: "settings",
            href: "/conductor/settings",
            label: "Settings",
            icon: SettingsIcon,
            onClick: onOpenSettings,
          },
        ];

      case "transport_admin":
        return [
          {
            id: "desk",
            href: "/transport-admin",
            label: "Admin Desk",
            icon: Home,
            highlight: true,
          },
          {
            id: "buses",
            href: "/transport-admin/buses",
            label: "Fleet Buses",
            icon: BusFront,
          },
          {
            id: "routes",
            href: "/transport-admin/routes",
            label: "Routes",
            icon: Route,
          },
          {
            id: "shifts",
            href: "/transport-admin/shifts",
            label: "Shifts",
            icon: Clock,
          },
          {
            id: "trips",
            href: "/transport-admin/trips",
            label: "Dispatches",
            icon: Navigation,
          },
          {
            id: "rfid",
            href: "/transport-admin/rfid",
            label: "RFID & IoT",
            icon: Radio,
          },
          {
            id: "chat",
            href: "/chat",
            label: "Chat",
            icon: MessageSquare,
            badge: unreadCount > 0 ? unreadCount : undefined,
          },
          {
            id: "payments",
            href: "/transport-admin/payments",
            label: "Fee Approvals",
            icon: CreditCard,
          },
          {
            id: "students",
            href: "/transport-admin/academics/students",
            label: "Student Roster",
            icon: GraduationCap,
          },
          {
            id: "reports",
            href: "/transport-admin/system/reports",
            label: "Reports",
            icon: FileBarChart,
          },
          {
            id: "settings",
            href: "/transport-admin/settings",
            label: "Settings",
            icon: SettingsIcon,
            onClick: onOpenSettings,
          },
        ];

      case "transport_manager":
        return [
          {
            id: "hub",
            href: "/transport-manager",
            label: "Manager Hub",
            icon: Home,
            highlight: true,
          },
          {
            id: "trips",
            href: "/transport-manager/trips",
            label: "Dispatches",
            icon: Navigation,
          },
          {
            id: "drivers",
            href: "/transport-manager/drivers",
            label: "Crew",
            icon: Users,
          },
          {
            id: "demand",
            href: "/transport-manager/demand",
            label: "Demand",
            icon: TrendingUp,
          },
          {
            id: "combine",
            href: "/transport-manager/combine-buses",
            label: "Combine",
            icon: GitMerge,
          },
          {
            id: "chat",
            href: "/chat",
            label: "Chat",
            icon: MessageSquare,
            badge: unreadCount > 0 ? unreadCount : undefined,
          },
          {
            id: "adminDesk",
            href: "/transport-admin",
            label: "Transport Admin Desk",
            icon: Building2,
          },
          {
            id: "settings",
            href: "/transport-manager/settings",
            label: "Settings",
            icon: SettingsIcon,
            onClick: onOpenSettings,
          },
        ];

      case "admin":
        return [
          {
            id: "hub",
            href: "/admin",
            label: "Admin Hub",
            icon: Home,
            highlight: true,
          },
          {
            id: "workshop",
            href: "/admin/maintenance",
            label: "Workshop",
            icon: Wrench,
          },
          {
            id: "accounts",
            href: "/admin/users",
            label: "Accounts",
            icon: Users,
          },
          {
            id: "campuses",
            href: "/admin/campuses",
            label: "Campuses",
            icon: Building2,
          },
          {
            id: "transportAdmin",
            href: "/transport-admin",
            label: "Admin Desk",
            icon: ShieldCheck,
          },
          {
            id: "fleetOps",
            href: "/transport-manager",
            label: "Fleet Ops",
            icon: Compass,
          },
          {
            id: "chat",
            href: "/chat",
            label: "Chat",
            icon: MessageSquare,
            badge: unreadCount > 0 ? unreadCount : undefined,
          },
          {
            id: "settings",
            href: "/admin/settings",
            label: "Settings",
            icon: SettingsIcon,
            onClick: onOpenSettings,
          },
        ];

      case "student":
      default:
        if (!isPaymentApproved) {
          return [
            {
              id: "payments",
              href: "/portal/payments",
              label: "Activate Pass",
              icon: CreditCard,
            },
            {
              id: "chat",
              href: "/chat",
              label: "Chat",
              icon: MessageSquare,
              badge: unreadCount > 0 ? unreadCount : undefined,
            },
          ];
        }
        return [
          {
            id: "commute",
            href: "/portal",
            label: "My Commute",
            icon: BusFront,
            highlight: true,
          },
          {
            id: "qr",
            href: "/portal/qr",
            label: policyRules.studentQrConnectLabel || "QR Connect",
            icon:
              policyMode === "FACE_ID"
                ? ScanFace
                : policyMode === "RFID"
                ? Radio
                : policyMode === "STATIC_QR"
                ? ScanLine
                : QrCode,
          },
          {
            id: "radar",
            href: "/portal/radar",
            label: "Radar",
            icon: Radio,
          },
          {
            id: "chat",
            href: "/chat",
            label: "Chat",
            icon: MessageSquare,
            badge: unreadCount > 0 ? unreadCount : undefined,
          },
          {
            id: "payments",
            href: "/portal/payments",
            label: "Pass & Fees",
            icon: CreditCard,
          },
          {
            id: "settings",
            href: "/portal/settings",
            label: "Settings",
            icon: SettingsIcon,
            onClick: onOpenSettings,
          },
        ];
    }
  };

  const rawItems = (navItems && navItems.length > 0) ? navItems : getRoleNavItems();

  // Modern navigation standard: Maximum 6 slots directly in dock, 7th is 3-dot "More"
  const isOverflowing = rawItems.length > 6;
  const itemsToRender = isOverflowing ? rawItems.slice(0, 6) : rawItems;
  const overflowItems = isOverflowing ? rawItems.slice(6) : [];

  const isItemActive = (item: MobileBottomNavItem) => {
    if (item.active !== undefined) return item.active;
    if (!item.href) return false;
    if (item.href === "/" || item.href === "/portal") {
      return pathname === "/" || pathname === "/portal";
    }
    return pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href) && item.href !== "/portal");
  };

  return (
    <>
      <nav
        aria-label="CampusFleet Mobile Navigation"
        className="md:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] inset-x-2.5 sm:inset-x-3 z-30 pointer-events-none select-none"
      >
        <div className="max-w-md mx-auto pointer-events-auto">
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-2xl border border-white/60 dark:border-gray-800/80 rounded-2xl sm:rounded-3xl p-1 shadow-[0_10px_35px_rgba(0,0,0,0.14)] dark:shadow-[0_10px_35px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between gap-0.5">
              {itemsToRender.map((item, idx) => {
                const Icon = item.icon;
                const isActive = isItemActive(item);

                if (!isPaymentApproved && item.href === "/portal/payments") {
                  return (
                    <Link
                      key={item.href || idx}
                      href={item.href}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl sm:rounded-2xl bg-blue-600 text-white font-black text-xs shadow-md shadow-blue-500/25 active:scale-[0.98] transition-transform"
                    >
                      <Icon className="w-4 h-4" />
                      <span>Activate Transit Pass & Pay Fees →</span>
                    </Link>
                  );
                }

                const innerContent = (
                  <>
                    <div className="relative">
                      <Icon
                        className={`w-4.5 h-4.5 transition-transform duration-200 stroke-[1.8] ${
                          isActive
                            ? item.highlight
                              ? "text-white scale-105"
                              : "text-blue-600 dark:text-blue-400 scale-105"
                            : "group-hover:scale-105"
                        }`}
                      />
                      {/* Live ping indicator for highlighted primary action */}
                      {item.highlight && !isActive && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                        </span>
                      )}
                      {/* Unread message count badge */}
                      {Boolean(item.badge) && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-600 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600 border border-white dark:border-gray-900" />
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[9px] sm:text-[10px] tracking-tight mt-0.5 truncate max-w-full font-medium ${
                        isActive
                          ? item.highlight
                            ? "text-white font-bold"
                            : "text-blue-600 dark:text-blue-400 font-black"
                          : ""
                      }`}
                    >
                      {item.label}
                    </span>
                  </>
                );

                const classNameStr = `flex-1 min-w-0 min-h-[42px] sm:min-h-[44px] relative flex flex-col items-center justify-center py-1 sm:py-1.5 px-0.5 rounded-xl sm:rounded-2xl transition-all duration-200 group active:scale-95 ${
                  isActive
                    ? item.highlight
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 -translate-y-0.5"
                      : "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`;

                if (item.onClick) {
                  return (
                    <button key={item.id || idx} type="button" onClick={item.onClick} className={classNameStr}>
                      {innerContent}
                    </button>
                  );
                }

                return (
                  <Link
                    key={item.id || item.href || idx}
                    href={item.href || "#"}
                    className={classNameStr}
                  >
                    {innerContent}
                  </Link>
                );
              })}

              {/* 7th item: 3-dot "More" button when role has overflow links */}
              {isOverflowing && (
                <button
                  type="button"
                  onClick={() => setIsMoreOpen(true)}
                  className={`flex-1 min-w-0 min-h-[42px] sm:min-h-[44px] relative flex flex-col items-center justify-center py-1 sm:py-1.5 px-0.5 rounded-xl sm:rounded-2xl transition-all duration-200 group active:scale-95 ${
                    isMoreOpen
                      ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                  aria-label="More options"
                >
                  <MoreHorizontal className="w-4.5 h-4.5 transition-transform duration-200 group-hover:scale-105 stroke-[1.8]" />
                  <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5 truncate max-w-full font-medium">
                    More
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Overflow Bottom Sheet Drawer */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setIsMoreOpen(false)}
          />

          <div className="relative z-10 w-full max-w-md mx-auto bg-white dark:bg-gray-900 rounded-t-[28px] border-t border-gray-200/80 dark:border-gray-800 shadow-2xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 px-4 animate-in slide-in-from-bottom duration-200 max-h-[85dvh] overflow-y-auto">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700 mx-auto mb-3" />

            <div className="flex items-center justify-between px-2 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-gray-900 dark:text-white tracking-tight">
                  Campus<span className="text-blue-600 dark:text-blue-400">Fleet</span>
                </span>
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  More Options
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-1.5 divide-y divide-gray-50 dark:divide-gray-850">
              {overflowItems.map((item, idx) => {
                const Icon = item.icon;

                if (item.onClick) {
                  return (
                    <button
                      key={item.id || idx}
                      type="button"
                      onClick={() => {
                        setIsMoreOpen(false);
                        item.onClick!();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100/80 dark:hover:bg-gray-800/60 transition-colors text-left group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40 transition-colors shrink-0">
                        <Icon className="w-4.5 h-4.5 text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 stroke-[1.8]" />
                      </div>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                        {item.label}
                      </span>
                    </button>
                  );
                }

                return (
                  <Link
                    key={item.id || item.href || idx}
                    href={item.href || "#"}
                    onClick={() => setIsMoreOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100/80 dark:hover:bg-gray-800/60 transition-colors text-left group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40 transition-colors shrink-0">
                      <Icon className="w-4.5 h-4.5 text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 stroke-[1.8]" />
                    </div>
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

