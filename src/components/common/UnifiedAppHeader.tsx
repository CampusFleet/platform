"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { UserRole } from "@/lib/types";
import { useTheme } from "./ThemeProvider";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { usePWAInstall } from "@/lib/usePWAInstall";
import { InstallAppModal } from "./InstallAppModal";
import {
  BusFront,
  LayoutGrid,
  Sun,
  Moon,
  Settings as SettingsIcon,
  Download,
  RotateCw,
  Copy,
  Check,
  LogOut,
  QrCode,
  MessageSquare,
  CreditCard,
  Clock,
  AlertTriangle,
  X,
  Menu,
  GraduationCap,
  BookOpen,
  LayoutDashboard,
  Building2,
  Navigation,
  FileCheck2,
  Home,
  CheckCircle2,
  Banknote,
} from "lucide-react";

export interface NavLinkItem {
  href: string;
  label: string;
  icon?: any;
  requiresPayment?: boolean;
  isLocked?: boolean;
}

interface UnifiedAppHeaderProps {
  role?: UserRole;
  portalTitle?: string;
  portalSubtitle?: string;
  navLinks?: NavLinkItem[];
  showSOS?: boolean;
  onOpenSOS?: () => void;
  userPhotoUrl?: string | null;
  showInstall?: boolean;
  onOpenInstall?: () => void;
  customActions?: React.ReactNode;
  mobilePrimaryAction?: {
    label: string;
    href: string;
    subtitle?: string;
    icon?: any;
  };
}

interface RolePortalOption {
  role: UserRole;
  label: string;
  shortLabel: string;
  path: string;
  icon: any;
  color: string;
  gradient: string;
  description: string;
}

const ROLE_PORTALS: RolePortalOption[] = [
  {
    role: "student",
    label: "Student & Mobility Portal",
    shortLabel: "Student",
    path: "/portal",
    icon: GraduationCap,
    color: "text-blue-500",
    gradient: "bg-blue-600",
    description: "Seat bookings, live bus GPS tracking & digital QR pass",
  },
  {
    role: "teacher",
    label: "Teacher Attendance Desk",
    shortLabel: "Teacher",
    path: "/teacher",
    icon: BookOpen,
    color: "text-green-500",
    gradient: "bg-green-600",
    description: "Real-time today's student arrivals and class roster verification",
  },
  {
    role: "admin",
    label: "Admin Operations Center",
    shortLabel: "Admin Ops",
    path: "/admin",
    icon: LayoutDashboard,
    color: "text-yellow-500",
    gradient: "bg-yellow-600",
    description: "Fleet command, routes, crew scheduling & finance reports",
  },
  {
    role: "transport_admin",
    label: "Transport Admin Desk",
    shortLabel: "Transport Admin",
    path: "/transport-admin",
    icon: Building2,
    color: "text-blue-500",
    gradient: "bg-blue-600",
    description: "Fee approvals, student passes, staff accounts & workshop repairs",
  },
  {
    role: "transport_manager",
    label: "Transport Manager Console",
    shortLabel: "Transport Manager",
    path: "/transport-manager",
    icon: Navigation,
    color: "text-amber-500",
    gradient: "bg-amber-600",
    description: "Bus fleet, routes, stops, demand & combine buses (merges)",
  },
  {
    role: "driver",
    label: "Driver Telematics Console",
    shortLabel: "Driver HUD",
    path: "/driver",
    icon: BusFront,
    color: "text-green-500",
    gradient: "bg-green-600",
    description: "Live GPS broadcast, stop progression checklist & incident alerts",
  },
  {
    role: "conductor",
    label: "Conductor Manifest Console",
    shortLabel: "Conductor",
    path: "/conductor",
    icon: FileCheck2,
    color: "text-pink-500",
    gradient: "bg-pink-600",
    description: "High-speed optical QR boarding scanner & passenger radar",
  },
];

export function UnifiedAppHeader({
  role,
  portalTitle = "CampusFleet",
  portalSubtitle,
  navLinks,
  showSOS = false,
  onOpenSOS,
  showInstall = false,
  onOpenInstall,
  customActions,
  mobilePrimaryAction,
  userPhotoUrl,
}: UnifiedAppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { promptInstall, canInstallNative, isIOS, isAndroid } = usePWAInstall();

  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState(store.getCurrentUser());
  const [students, setStudents] = useState(store.getStudents());

  // Dropdown, Drawer & Navigation Style states
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAppsOpen, setIsAppsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [hasCopiedId, setHasCopiedId] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [navStyle, setNavStyle] = useState<"top" | "side">("top");

  const profileRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      setStudents(store.getStudents());
    });

    const savedNav = localStorage.getItem("campusfleet_nav_style") as "top" | "side" | null;
    if (savedNav === "top" || savedNav === "side") {
      setNavStyle(savedNav);
    }

    const handleNavStyleChange = () => {
      const updated = localStorage.getItem("campusfleet_nav_style") as "top" | "side" | null;
      if (updated === "top" || updated === "side") {
        setNavStyle(updated);
      }
    };

    window.addEventListener("campusfleet_nav_style_changed", handleNavStyleChange);

    return () => {
      unsub();
      window.removeEventListener("campusfleet_nav_style_changed", handleNavStyleChange);
    };
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
      if (appsRef.current && !appsRef.current.contains(e.target as Node)) {
        setIsAppsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Close all popups on route change
  useEffect(() => {
    setIsProfileOpen(false);
    setIsAppsOpen(false);
    setIsDrawerOpen(false);
  }, [pathname]);

  const portalViewRole = role || currentUser?.role || "student";
  const userAccountRole = currentUser?.role || portalViewRole;
  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "adityapandey.dev.in@gmail.com").toLowerCase();
  const isActualAdmin =
    userAccountRole === "admin" ||
    currentUser?.email?.toLowerCase() === adminEmail;

  // Active student identity matching
  const activeStudent = currentUser
    ? students.find(
        (s) =>
          (currentUser.studentId && s.id === currentUser.studentId) ||
          s.userId === currentUser.id ||
          s.email?.toLowerCase() === currentUser.email?.toLowerCase()
      ) || null
    : null;

  // Institutional College Student ID (e.g. 2361030 / studentIdCode) vs Internal DB Table ID
  const isStudent = portalViewRole === "student";
  const collegeStudentId =
    activeStudent?.studentIdCode ||
    (activeStudent as any)?.student_id_code ||
    (currentUser as any)?.studentIdCode ||
    (currentUser as any)?.student_id_code ||
    (currentUser?.studentId && !currentUser.studentId.startsWith("stud-") && !currentUser.studentId.startsWith("std_") ? currentUser.studentId : null) ||
    (activeStudent?.id && !activeStudent.id.startsWith("stud-") && !activeStudent.id.startsWith("std_") ? activeStudent.id : null) ||
    "2361030";

  const displayStaffId = currentUser?.id
    ? currentUser.id.startsWith("usr_")
      ? currentUser.id.replace("usr_", "").toUpperCase().slice(0, 8)
      : currentUser.id.toUpperCase().slice(0, 8)
    : "STAFF";

  const displayId = isStudent ? collegeStudentId : displayStaffId;

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(displayId);
      setHasCopiedId(true);
      setTimeout(() => setHasCopiedId(false), 2000);
    }
  };

  const handleGetUpdate = async () => {
    setIsUpdating(true);
    try {
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update();
        }
      }
    } catch (err) {
      // Ignore update error
    }
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  const handleInstallClick = async () => {
    setIsProfileOpen(false);
    if (onOpenInstall) {
      onOpenInstall();
      return;
    }
    const result = await promptInstall();
    if (result === "modal_needed") {
      setIsInstallModalOpen(true);
    }
  };

  const handleSignOut = async () => {
    await store.logout();
    setIsProfileOpen(false);
    setIsAppsOpen(false);
    setIsDrawerOpen(false);
    router.push("/");
  };

  const currentPortalConfig =
    ROLE_PORTALS.find((p) => p.role === portalViewRole) || ROLE_PORTALS[0];

  const getSettingsHref = () => {
    switch (portalViewRole) {
      case "teacher":
        return "/teacher/settings";
      case "conductor":
        return "/conductor/settings";
      case "driver":
        return "/driver/settings";
      case "transport_admin":
        return "/transport-admin/settings/transit";
      case "transport_manager":
        return "/transport-manager/settings";
      case "admin":
        return "/admin/settings";
      case "student":
      default:
        return "/portal/settings";
    }
  };

  const initials = currentUser?.fullName
    ? currentUser.fullName
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "AP";

  const effectivePhotoUrl = userPhotoUrl || activeStudent?.photoUrl || currentUser?.avatarUrl;

  const effectiveNavLinks =
    navLinks && navLinks.length > 0
      ? navLinks
      : portalViewRole === "teacher"
      ? [
          { href: "/teacher", label: "Class Attendance" },
          { href: "/teacher?tab=my_commute", label: "My Commute" },
          { href: "/teacher/settings", label: "Settings" },
        ]
      : portalViewRole === "student"
      ? [
          { href: "/portal", label: "My Commute" },
          { href: "/portal/qr", label: "QR Connect" },
          { href: "/chat", label: "Chat" },
          { href: "/portal/settings", label: "Settings" },
        ]
      : [];

  return (
    <>
      {/* Sleek, Non-Bulky Unified Top Navbar */}
      <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-200/80 dark:border-gray-800/80 shadow-xs transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-13 sm:h-14 lg:h-16 flex items-center justify-between gap-3">
          {/* Left: Brand Identity & Optional Minimal Drawer Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Minimal Mobile Drawer Button (only when Side Nav mode is chosen in Appearance settings) */}
            {navStyle === "side" && (
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className="p-1.5 -ml-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                title="Open Navigation Menu"
                aria-label="Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <Link
              href={currentPortalConfig.path}
              className="flex items-center gap-2 group flex-shrink-0 cursor-pointer"
              title="CampusFleet Home"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform flex-shrink-0">
                <BusFront className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg font-black tracking-tight text-gray-900 dark:text-white whitespace-nowrap">
                  Campus<span className="text-blue-600 dark:text-blue-400">Fleet</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                  {currentPortalConfig.shortLabel}
                </span>
              </div>
            </Link>
          </div>

          {/* Center Navigation Links (Desktop Minimalist) */}
          {effectiveNavLinks && effectiveNavLinks.length > 0 && (
            <div className="hidden lg:flex items-center justify-center flex-1 min-w-0 px-6">
              <nav className="flex items-center gap-6">
                {effectiveNavLinks.map((link) => {
                  const isActive =
                    pathname === link.href ||
                    (link.href !== "/portal" &&
                      link.href !== "/" &&
                      pathname.startsWith(link.href));
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`text-sm transition-colors py-1 ${
                        isActive
                          ? "text-blue-600 dark:text-blue-400 font-bold"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Right Controls: 9-Dots Grid, Theme Toggle, Profile Avatar */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* 1. 9-Dots Grid Menu (Transit Portals & Apps Switcher) */}
            <div className="relative" ref={appsRef}>
              <button
                type="button"
                onClick={() => {
                  setIsAppsOpen(!isAppsOpen);
                  setIsProfileOpen(false);
                }}
                className={`p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                  isAppsOpen ? "bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400" : ""
                }`}
                title="Transit Services & Portals"
                aria-label="Transit Services"
              >
                <LayoutGrid className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </button>

              {/* Apps Dropdown Card */}
              {isAppsOpen && (
                <div className="absolute right-0 top-12 z-50 w-72 sm:w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200/90 dark:border-gray-800 p-3 space-y-2 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 pt-1 pb-1 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">
                      Transit Services & Hubs
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Quick-access navigation
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      onClick={() => {
                        setIsAppsOpen(false);
                        router.push("/portal");
                      }}
                      className="flex flex-col items-start gap-1 p-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-transparent hover:border-blue-100 dark:hover:border-blue-900/50 transition-all text-left cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <BusFront className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white">
                        My Commute
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
                        Live GPS tracking
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setIsAppsOpen(false);
                        router.push("/portal/qr");
                      }}
                      className="flex flex-col items-start gap-1 p-2.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-transparent hover:border-emerald-100 dark:hover:border-emerald-900/50 transition-all text-left cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <QrCode className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white">
                        QR Pass
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
                        Boarding pass
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setIsAppsOpen(false);
                        router.push("/chat");
                      }}
                      className="flex flex-col items-start gap-1 p-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50 transition-all text-left cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white">
                        Messages
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
                        Live channels
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setIsAppsOpen(false);
                        router.push("/portal/payments");
                      }}
                      className="flex flex-col items-start gap-1 p-2.5 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-transparent hover:border-amber-100 dark:hover:border-amber-900/50 transition-all text-left cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white">
                        Pass & Fees
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
                        Subscription fee
                      </span>
                    </button>
                  </div>

                  {/* Staff Consoles Switcher (if user is staff or admin) */}
                  {(isActualAdmin ||
                    userAccountRole === "transport_admin" ||
                    userAccountRole === "transport_manager" ||
                    userAccountRole === "teacher" ||
                    userAccountRole === "driver" ||
                    userAccountRole === "conductor") && (
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                      <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        Staff Consoles
                      </p>
                      <div className="space-y-1">
                        {isActualAdmin && (
                          <button
                            onClick={() => {
                              setIsAppsOpen(false);
                              router.push("/admin");
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <LayoutDashboard className="w-3.5 h-3.5 text-yellow-500" />
                            <span>Master Admin Console</span>
                          </button>
                        )}
                        {(isActualAdmin || userAccountRole === "transport_admin") && (
                          <>
                            <button
                              onClick={() => {
                                setIsAppsOpen(false);
                                router.push("/admin/salary");
                              }}
                              className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <Banknote className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Staff Payroll & Salaries</span>
                            </button>
                            <button
                              onClick={() => {
                                setIsAppsOpen(false);
                                router.push("/transport-admin");
                              }}
                              className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <Building2 className="w-3.5 h-3.5 text-blue-500" />
                              <span>Transport Admin Desk</span>
                            </button>
                          </>
                        )}
                        {(isActualAdmin || userAccountRole === "transport_manager") && (
                          <button
                            onClick={() => {
                              setIsAppsOpen(false);
                              router.push("/transport-manager");
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Navigation className="w-3.5 h-3.5 text-amber-500" />
                            <span>Transport Manager Hub</span>
                          </button>
                        )}
                        {userAccountRole === "teacher" && (
                          <button
                            onClick={() => {
                              setIsAppsOpen(false);
                              router.push("/teacher");
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-green-500" />
                            <span>Teacher Attendance Desk</span>
                          </button>
                        )}
                        {(userAccountRole === "driver" || isActualAdmin) && (
                          <button
                            onClick={() => {
                              setIsAppsOpen(false);
                              router.push("/driver");
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <BusFront className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Driver Telematics HUD</span>
                          </button>
                        )}
                        {(userAccountRole === "conductor" || isActualAdmin) && (
                          <button
                            onClick={() => {
                              setIsAppsOpen(false);
                              router.push("/conductor");
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <FileCheck2 className="w-3.5 h-3.5 text-pink-500" />
                            <span>Conductor Manifest Console</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Theme Switcher (Moon / Sun) */}
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? (
                <Sun className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-amber-400" />
              ) : (
                <Moon className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-gray-600" />
              )}
            </button>

            {/* 3. User Profile Avatar & Dropdown Card (Exact Reference Design from Screenshot 2) */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => {
                  setIsProfileOpen(!isProfileOpen);
                  setIsAppsOpen(false);
                }}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 flex items-center justify-center transition-all hover:ring-2 hover:ring-blue-500/50 cursor-pointer"
                title="User Profile & Settings"
                aria-label="User Profile"
              >
                {effectivePhotoUrl ? (
                  <img
                    src={getSafePhotoUrl(effectivePhotoUrl)}
                    alt={currentUser?.fullName || "User Avatar"}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const fallback = effectivePhotoUrl;
                      if (fallback && e.currentTarget.src !== fallback) {
                        e.currentTarget.src = fallback;
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-orange-400 to-rose-500 text-white flex items-center justify-center font-bold text-xs select-none">
                    {initials}
                  </div>
                )}
              </button>

              {/* Floating Profile Modal Card (Matching Screenshot 2) */}
              {isProfileOpen && (
                <div className="absolute right-0 top-12 z-50 w-64 sm:w-72 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200/90 dark:border-gray-800 p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                  {/* Top Header Row: Avatar, Full Name, ID/RollNo with 1-click Copy */}
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 shadow-xs">
                      {effectivePhotoUrl ? (
                        <img
                          src={getSafePhotoUrl(effectivePhotoUrl)}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-orange-400 to-rose-500 text-white flex items-center justify-center font-bold text-base select-none">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate leading-tight">
                        {currentUser?.fullName || "Aditya Pandey"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200/60 dark:border-blue-800/60">
                          {isStudent ? "Student ID" : "Staff ID"}
                        </span>
                        <span className="text-xs text-gray-700 dark:text-gray-300 font-mono font-bold truncate">
                          {displayId}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyId}
                          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors cursor-pointer"
                          title={isStudent ? "Copy Student ID" : "Copy Account ID"}
                          aria-label="Copy ID"
                        >
                          {hasCopiedId ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-50" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      {activeStudent?.department && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {activeStudent.department}
                          {activeStudent.semester ? ` • Sem ${activeStudent.semester}` : ""}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px w-full bg-gray-100 dark:bg-gray-800" />

                  {/* Menu Action Items */}
                  <div className="space-y-1">
                    {/* Settings */}
                    <Link
                      href={getSettingsHref()}
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
                    >
                      <SettingsIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <span>Settings</span>
                    </Link>

                    {/* Install App */}
                    <button
                      type="button"
                      onClick={handleInstallClick}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-left cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <span>Install App</span>
                    </button>

                    {/* Get latest update */}
                    <button
                      type="button"
                      onClick={handleGetUpdate}
                      disabled={isUpdating}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-left cursor-pointer disabled:opacity-60"
                    >
                      <RotateCw
                        className={`w-4 h-4 text-gray-500 dark:text-gray-400 ${
                          isUpdating ? "animate-spin text-blue-600" : ""
                        }`}
                      />
                      <span>{isUpdating ? "Updating..." : "Get latest update"}</span>
                    </button>

                    {/* Chat / Messages Link */}
                    <Link
                      href="/chat"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <span>Messages</span>
                    </Link>

                    {/* Log out */}
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-red-500" />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Sleek Side Drawer Menu (Inspiration from Screenshot 3) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Drawer Sheet */}
          <div className="relative w-72 sm:w-80 max-w-[85vw] bg-white dark:bg-gray-950 shadow-2xl z-50 flex flex-col h-full border-r border-gray-200 dark:border-gray-800 animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  <BusFront className="w-4 h-4" />
                </div>
                <span className="text-base font-black tracking-tight text-gray-900 dark:text-white">
                  Campus<span className="text-blue-600 dark:text-blue-400">Fleet</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                  General Transit
                </p>
                <div className="space-y-1">
                  <Link
                    href="/portal"
                    onClick={() => setIsDrawerOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                  >
                    <Home className="w-4 h-4 text-blue-600" />
                    <span>My Commute Hub</span>
                  </Link>

                  <Link
                    href="/portal/qr"
                    onClick={() => setIsDrawerOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                  >
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span>QR Pass Connect</span>
                  </Link>

                  <Link
                    href="/chat"
                    onClick={() => setIsDrawerOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span>Messages & Channels</span>
                  </Link>

                  <Link
                    href="/portal/payments"
                    onClick={() => setIsDrawerOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                  >
                    <CreditCard className="w-4 h-4 text-amber-600" />
                    <span>Pass & Fees</span>
                  </Link>

                  <Link
                    href="/portal/late"
                    onClick={() => setIsDrawerOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                  >
                    <Clock className="w-4 h-4 text-purple-600" />
                    <span>Late SOS</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Pinned Bottom Settings Button (matching Screenshot 3) */}
            <div className="p-3 border-t border-gray-100 dark:border-gray-800">
              <Link
                href={getSettingsHref()}
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <SettingsIcon className="w-4.5 h-4.5 text-gray-600 dark:text-gray-300" />
                <span>Settings</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* PWA Install Instructions Modal */}
      {isInstallModalOpen && (
        <InstallAppModal
          isOpen={isInstallModalOpen}
          onClose={() => setIsInstallModalOpen(false)}
          canInstallNative={canInstallNative}
          onPromptInstall={promptInstall}
          isIOS={isIOS}
          isAndroid={isAndroid}
        />
      )}
    </>
  );
}
