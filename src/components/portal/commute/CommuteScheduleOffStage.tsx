"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Sparkles,
  Clock,
  MapPin,
  BusFront,
  CheckCircle2,
  QrCode,
  RefreshCw,
  Settings,
  Moon,
} from "lucide-react";
import type { Shift, Stop } from "@/lib/types";
import { useAttendancePolicy } from "@/lib/attendance";

interface CommuteScheduleOffStageProps {
  isTodayOff: boolean;
  todayName: string;
  tomorrowMorningShift: Shift | null;
  tomorrowShiftStartTime: string;
  tomorrowPickupStop: string;
  todaySeat?: string | null;
  todayBusNumber?: string | null;
  settingsHref: string;
  onRefresh: () => void;
  formatShiftTime: (time?: string) => string;
}

export function CommuteScheduleOffStage({
  isTodayOff,
  todayName,
  tomorrowMorningShift,
  tomorrowShiftStartTime,
  tomorrowPickupStop,
  todaySeat,
  todayBusNumber,
  settingsHref,
  onRefresh,
  formatShiftTime,
}: CommuteScheduleOffStageProps) {
  const router = useRouter();
  const { locks } = useAttendancePolicy();

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6 animate-in fade-in duration-300">
      {/* Top Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-zinc-100 dark:border-zinc-800">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
            isTodayOff
              ? "bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/60 text-amber-800 dark:text-amber-300"
              : "bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/60 text-blue-800 dark:text-blue-300"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isTodayOff ? "bg-amber-500" : "bg-blue-500"}`} />
          <span>{isTodayOff ? "No Bus Shifts Scheduled Today" : "Today's Bus Shifts Have Concluded"}</span>
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {isTodayOff ? (
            <>
              <Calendar className="w-4 h-4 text-zinc-400" />
              <span>Timetable Scheduled Off ({todayName})</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-blue-500" />
              <span>Shifts Finished for Today</span>
            </>
          )}
        </div>
      </div>

      {/* Greeting Headline */}
      <div className="space-y-2 max-w-2xl">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
          <span>{isTodayOff ? "No Transit Scheduled for Today" : "All Bus Shifts Over for Today"}</span>
          <Sparkles className="w-6 h-6 text-amber-500 shrink-0" />
        </h1>
        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {isTodayOff
            ? `Your academic timetable has no bus commute shifts scheduled for ${todayName}. CampusFleet will be ready for your next scheduled academic commute!`
            : "All fleet shifts scheduled for today have completed their operational runs. Next automated commute allocation begins tomorrow morning."}
        </p>
      </div>

      {/* Next Scheduled Commute Preview */}
      <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            <span>Next Scheduled Commute</span>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
            Tomorrow Morning
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 space-y-1">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Departure Time</span>
            </div>
            <div className="text-sm font-bold text-zinc-900 dark:text-white">
              {formatShiftTime(tomorrowShiftStartTime) || "07:15 AM"}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 space-y-1">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
              <span>Pick-Up Stop</span>
            </div>
            <div className="text-sm font-bold text-zinc-900 dark:text-white truncate" title={tomorrowPickupStop}>
              {tomorrowPickupStop}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 space-y-1">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
              <BusFront className="w-3.5 h-3.5 text-zinc-400" />
              <span>Shift Type</span>
            </div>
            <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
              {tomorrowMorningShift?.name || "Morning Academic Daily Shift"}
            </div>
          </div>
        </div>
      </div>

      {/* Today's Commute Record (if attended) */}
      {todaySeat && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-200">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Today's Ride Recorded on <strong>{todayBusNumber || "Assigned Bus"}</strong> (Seat: <strong>{todaySeat}</strong>)</span>
          </span>
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Attendance Completed ✓</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="pt-2 flex flex-wrap items-center gap-3">
        {locks.dynamicQr && (
        <button
          type="button"
          onClick={() => router.push("/portal/qr/show")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 text-white text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>Show My QR Pass</span>
        </button>
        )}

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-700 text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Commute Status</span>
        </button>

        <Link
          href={settingsHref}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white font-medium transition-colors ml-auto"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </Link>
      </div>
    </div>
  );
}

