"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BusFront,
  MapPin,
  Clock,
  Layers,
  ArrowLeftRight,
  XCircle,
  QrCode,
  Navigation,
  PhoneCall,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import type { Bus, Stop, Student } from "@/lib/types";

interface CommuteConfirmedStageProps {
  assignedBus: Bus;
  assignedStop: Stop | null;
  assignedShiftName: string;
  assignedShiftStartTime: string;
  assignedShiftEndTime: string;
  student?: Student;
  displaySeatNumber: string;
  isTripInProgress: boolean;
  isCancellingSeat: boolean;
  settingsHref: string;
  onSwitchSeat: () => void;
  onRequestCancelSeat: () => void;
  onOpenDigitalPass?: () => void;
  onOpenContactCrew: () => void;
  formatShiftTime: (time?: string) => string;
}

export function CommuteConfirmedStage({
  assignedBus,
  assignedStop,
  assignedShiftName,
  assignedShiftStartTime,
  assignedShiftEndTime,
  student,
  displaySeatNumber,
  isTripInProgress,
  isCancellingSeat,
  settingsHref,
  onSwitchSeat,
  onRequestCancelSeat,
  onOpenDigitalPass,
  onOpenContactCrew,
  formatShiftTime,
}: CommuteConfirmedStageProps) {
  const router = useRouter();
  const displayBusNumber = assignedBus.busNumber ? `Bus ${assignedBus.busNumber}` : `Bus #${assignedBus.id}`;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner shrink-0">
            <BusFront className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">
              Assigned Bus Vehicle
            </span>
            <h2 className="text-xl font-black text-zinc-900 dark:text-white">
              {displayBusNumber}
            </h2>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Attendance Verified</span>
        </span>
      </div>

      {/* Commute Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pick-Up Stop */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
            <MapPin className="w-4 h-4 text-pink-500" />
            <span>Your Pick-Up Stop</span>
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
            {assignedStop ? assignedStop.name : (student?.primaryStopId ? `Stop: ${student.primaryStopId}` : "Campus Stop")}
          </div>
          {assignedStop?.landmark && (
            <div className="text-[11px] text-zinc-500 truncate">Near {assignedStop.landmark}</div>
          )}
        </div>

        {/* Schedule / Shift */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>Schedule / Shift</span>
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
            {assignedShiftName}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
            {assignedShiftStartTime
              ? `${formatShiftTime(assignedShiftStartTime)} Departure`
              : "Scheduled Departure"}
            {assignedShiftEndTime ? ` • Arrive ${formatShiftTime(assignedShiftEndTime)}` : ""}
          </div>
        </div>

        {/* Bus Specs */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
            <Layers className="w-4 h-4 text-purple-500" />
            <span>Bus Specifications</span>
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-white">
            {assignedBus?.model || "Campus Coach"}
          </div>
          <div className="text-[11px] text-zinc-500">
            Reg: {assignedBus?.registrationNo || "CAMPUS-COACH"} • {assignedBus?.capacity || 40} Seats
          </div>
        </div>

        {/* Confirmed Seat Section */}
        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2.5">
          <div className="text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between font-bold">
            <span>Confirmed Seat</span>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
              Marked ✓
            </span>
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <div className="text-base font-black text-emerald-950 dark:text-emerald-200">
              {displaySeatNumber ? `Seat ${displaySeatNumber}` : "Seat Confirmed"}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onSwitchSeat}
                className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeftRight className="w-3 h-3" />
                <span>Switch</span>
              </button>
              <button
                type="button"
                onClick={onRequestCancelSeat}
                disabled={isCancellingSeat || isTripInProgress}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  isTripInProgress
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                    : "bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300"
                }`}
                title={isTripInProgress ? "Trip in progress or completed — cancel disabled" : "Cancel seat & rollback attendance"}
              >
                <XCircle className="w-3 h-3" />
                <span>{isCancellingSeat ? "Cancelling..." : "Cancel"}</span>
              </button>
            </div>
          </div>
          <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
            Attendance verified for today
          </div>

          {isTripInProgress && (
            <div className="mt-1 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-tight">
                Bus has departed. Attendance is locked by transit dispatch.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Buttons */}
      <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {/* Show QR Pass */}
        <button
          type="button"
          onClick={() => {
            if (onOpenDigitalPass) {
              onOpenDigitalPass();
            } else {
              router.push("/portal/qr/show");
            }
          }}
          className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 transition-all text-left group active:scale-[0.99] shadow-2xs cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 border border-pink-200/80 dark:border-pink-800/60 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white">
                Show My QR Pass
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Dynamic digital boarding pass
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Live Radar */}
        <Link
          href={`/portal/radar?busId=${assignedBus.id}`}
          className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 transition-all text-left group active:scale-[0.99] shadow-2xs cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white">
                Live Bus Radar
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Turn-by-turn tracking & ETA
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
        </Link>

        {/* Contact Bus Crew */}
        <button
          type="button"
          onClick={onOpenContactCrew}
          className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 transition-all text-left group active:scale-[0.99] shadow-2xs cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/60 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>Contact Bus Crew</span>
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[9px] font-black uppercase">
                  Call
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Conductor & transport helpline
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* Footer Link to Settings */}
      <div className="pt-2 text-center sm:text-left">
        <Link
          href={settingsHref}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
        >
          <span>Need to update your home address or seat companion pairing? Go to Settings</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

