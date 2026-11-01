"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  BusFront,
  Building2,
  MessageCircle,
  User,
  Calendar,
  MoreHorizontal,
  X,
  Shield,
  CreditCard,
  QrCode,
  MapPin,
  AlertTriangle,
  Sun,
  Moon,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { useTheme } from "@/components/common/ThemeProvider";

interface FloatingMobileNavDockProps {
  unreadCount?: number;
  onOpenSettings?: () => void;
}

export function FloatingMobileNavDock({ unreadCount = 0, onOpenSettings }: FloatingMobileNavDockProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const isHome = pathname === "/" || pathname === "/portal";
  const isCommute = pathname.startsWith("/track") || pathname.startsWith("/transport-admin/routes");
  const isCampus = pathname.startsWith("/transport-admin/campuses") || pathname.startsWith("/academics");
  const isChat = pathname.startsWith("/chat");
  const isProfile = pathname.includes("settings") || pathname.startsWith("/profile");
  const isSchedule = pathname.startsWith("/transport-admin/shifts") || pathname.startsWith("/shifts");

  return (
    <>
      {/* Floating Bottom Nav Capsule (Matching Haveloc Screenshot) */}
      <nav
        aria-label="Mobile Floating Navigation Dock"
        className="md:hidden fixed bottom-3 inset-x-0 z-30 flex justify-center px-4 pointer-events-none select-none"
      >
        <div className="pointer-events-auto flex items-center justify-between gap-1 sm:gap-2 px-3 py-1.5 rounded-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border border-gray-200/90 dark:border-gray-800 shadow-[0_10px_35px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_35px_rgba(0,0,0,0.6)] max-w-sm w-full transition-all duration-300">
          {/* 1. Home (With subtle soft rose tint matching screenshot) */}
          <Link
            href="/"
            className={`flex-1 flex items-center justify-center p-2 rounded-2xl transition-all cursor-pointer ${
              isHome
                ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 shadow-2xs"
                : "text-rose-500/80 hover:text-rose-600 dark:text-rose-400/80 hover:bg-rose-50/50 dark:hover:bg-rose-950/30"
            }`}
            title="Transit Home"
            aria-label="Home"
          >
            <Home className="w-5 h-5 stroke-[1.8]" />
          </Link>

          {/* 2. Commute & Transit Bus (Briefcase equivalent in transit domain) */}
          <Link
            href="/track"
            className={`flex-1 flex items-center justify-center p-2 rounded-2xl transition-all cursor-pointer ${
              isCommute
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs border border-gray-200/80 dark:border-gray-700"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/60"
            }`}
            title="Live Commute Tracking"
            aria-label="Commute"
          >
            <BusFront className="w-5 h-5 stroke-[1.8]" />
          </Link>

          {/* 3. Campus & Academic Depots (Building icon in screenshot) */}
          <Link
            href="/transport-admin/campuses"
            className={`flex-1 flex items-center justify-center p-2 rounded-2xl transition-all cursor-pointer ${
              isCampus
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs border border-gray-200/80 dark:border-gray-700"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/60"
            }`}
            title="Campus Hubs"
            aria-label="Campus"
          >
            <Building2 className="w-5 h-5 stroke-[1.8]" />
          </Link>

          {/* 4. Messages / Chat (Active elevated pill card matching screenshot) */}
          <Link
            href="/chat"
            className={`flex-1 flex items-center justify-center p-2 rounded-2xl transition-all relative cursor-pointer ${
              isChat
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm border border-gray-200/80 dark:border-gray-700 font-bold scale-105"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/60"
            }`}
            title="Messages"
            aria-label="Messages"
          >
            <MessageCircle className="w-5 h-5 stroke-[1.8]" />
            {unreadCount > 0 && (
              <span className="absolute 1 top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse ring-2 ring-white dark:ring-gray-900" />
            )}
          </Link>

          {/* 5. User Profile / Settings */}
          {onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className={`flex-1 flex items-center justify-center p-2 rounded-2xl transition-all cursor-pointer ${
                isProfile
                  ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs border border-gray-200/80 dark:border-gray-700"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/60"
              }`}
              title="Profile & Settings"
              aria-label="Profile"
            >
              <User className="w-5 h-5 stroke-[1.8]" />
            </button>
          ) : (
            <Link
              href="/chat?view=settings"
              className={`flex-1 flex items-center justify-center p-2 rounded-2xl transition-all cursor-pointer ${
                isProfile
                  ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs border border-gray-200/80 dark:border-gray-700"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/60"
              }`}
              title="Profile & Settings"
              aria-label="Profile"
            >
              <User className="w-5 h-5 stroke-[1.8]" />
            </Link>
          )}

          {/* 6. Calendar (Transit Shifts & Schedules) */}
          <Link
            href="/transport-admin/shifts"
            className={`flex-1 flex items-center justify-center p-2 rounded-2xl transition-all cursor-pointer ${
              isSchedule
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs border border-gray-200/80 dark:border-gray-700"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/60"
            }`}
            title="Transit Shifts & Schedules"
            aria-label="Schedule"
          >
            <Calendar className="w-5 h-5 stroke-[1.8]" />
          </Link>

          {/* 7. More Options (...) */}
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            className="flex-1 flex items-center justify-center p-2 rounded-2xl text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-all cursor-pointer"
            title="More shortcuts"
            aria-label="More"
          >
            <MoreHorizontal className="w-5 h-5 stroke-[1.8]" />
          </button>
        </div>
      </nav>

      {/* More Options Popover Drawer (Matching Modern Mobile Standards) */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setIsMoreOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md mx-auto bg-white dark:bg-gray-900 rounded-t-3xl border-t border-gray-200 dark:border-gray-800 shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom-5 duration-200 max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <span className="font-serif italic text-xl font-bold text-gray-900 dark:text-white">
                  CampusFleet
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold">
                  Transit Dock
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Links Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  router.push("/portal");
                }}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-gray-100 dark:border-gray-800 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Commuter Pass</div>
                  <div className="text-[10px] text-gray-400">Digital Smart RFID Pass</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  router.push("/portal/qr");
                }}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-gray-100 dark:border-gray-800 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">QR Connect</div>
                  <div className="text-[10px] text-gray-400">Boarding & tap pass</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  router.push("/transport-admin");
                }}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-gray-100 dark:border-gray-800 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Operations Desk</div>
                  <div className="text-[10px] text-gray-400">Dispatch & telematics</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  router.push("/conductor");
                }}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-gray-100 dark:border-gray-800 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <BusFront className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Conductor Manifest</div>
                  <div className="text-[10px] text-gray-400">Passenger scanner</div>
                </div>
              </button>
            </div>

            {/* Quick Actions Footer */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-gray-600" />}
                <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMoreOpen(false);
                  if (onOpenSettings) onOpenSettings();
                  else router.push("/chat?view=settings");
                }}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Chat Preferences</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
