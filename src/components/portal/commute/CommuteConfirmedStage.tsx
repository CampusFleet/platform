"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BusFront,
  MapPin,
  Clock,
  Layers,
  QrCode,
  Navigation,
  PhoneCall,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  CheckCircle2,
  Radio,
  ArrowRight,
  Armchair,
} from "lucide-react";
import type { Bus, Stop, Student, Staff } from "@/lib/types";

export interface CommuteConfirmedStageProps {
  assignedBus: Bus;
  assignedStop: Stop | null;
  assignedShiftName: string;
  assignedShiftStartTime: string;
  assignedShiftEndTime: string;
  student?: Student;
  displaySeatNumber: string;
  isTripInProgress: boolean;
  isAttendanceVerified?: boolean;
  assignedConductor?: Staff | null;
  transportManager?: Staff | null;
  isCancellingSeat?: boolean;
  settingsHref: string;
  onSwitchSeat?: () => void;
  onRequestCancelSeat?: () => void;
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
  isAttendanceVerified = false,
  assignedConductor,
  transportManager,
  settingsHref,
  onOpenDigitalPass,
  onOpenContactCrew,
  formatShiftTime,
}: CommuteConfirmedStageProps) {
  const router = useRouter();
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  const displayBusNumber = assignedBus.busNumber ? `Bus ${assignedBus.busNumber}` : `Bus #${assignedBus.id}`;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-7 border border-zinc-200/90 dark:border-zinc-800 shadow-sm space-y-6 animate-in fade-in duration-300">
      {/* ─── 1. Header with Vehicle Identity & Verification Status Pill ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner shrink-0 border border-indigo-100/80 dark:border-indigo-900/40">
            <BusFront className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">
              Assigned Vehicle & Commute
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
              {displayBusNumber}
            </h2>
          </div>
        </div>

        {/* Dynamic Verification Status Pill */}
        {isAttendanceVerified ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-xs font-bold shadow-2xs self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Attendance Verified • Boarded</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs font-bold shadow-2xs self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            <span>Boarding Verification Required</span>
          </span>
        )}
      </div>

      {/* ─── 2. Attendance Verification Shield & Anti-Proxy Boarding Callout ─── */}
      {!isAttendanceVerified ? (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-orange-500/10 border border-amber-500/30 dark:border-amber-500/20 p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-amber-700 dark:text-amber-300">
                    Anti-Proxy Boarding Shield
                  </span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                    Action Required
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white mt-0.5">
                  First Mark Attendance & Verify Boarding
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mt-0.5 max-w-xl">
                  Your seat is auto-reserved. To verify your boarding and unlock full telemetry access, scan the bus’s dynamic QR code or tap your physical RFID card.
                </p>
              </div>
            </div>

            {/* Direct Link to Bus Dynamic QR Scanner */}
            <Link
              href="/portal/qr/scan"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md transition-all shrink-0 cursor-pointer group"
            >
              <QrCode className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>Scan Bus Dynamic QR</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-80 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Secondary Verification Method Notice */}
          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-amber-500/20 text-[11px] text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-1.5 font-medium">
              <Radio className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="font-bold text-zinc-800 dark:text-zinc-200">Alternative Verification:</span>
            </div>
            <span>Tap your physical student RFID card on the onboard bus reader upon boarding.</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border border-emerald-500/30 dark:border-emerald-500/20 p-3.5 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                Boarding Verified • Seat Secured for Today
              </div>
              <div className="text-[11px] text-emerald-800/80 dark:text-emerald-400/80">
                Attendance validated with dynamic HMAC encryption & GPS anti-proxy verification.
              </div>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
            Verified Active
          </span>
        </div>
      )}

      {/* ─── 3. Commute Essentials: 3 Focused Pillars (No Switch / Cancel Buttons) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Pillar 1: Pick-Up Stop */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
            <MapPin className="w-4 h-4 text-pink-500" />
            <span>Your Pick-Up Stop</span>
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
            {assignedStop ? assignedStop.name : (student?.primaryStopId ? `Stop: ${student.primaryStopId}` : "Campus Stop")}
          </div>
          <div className="text-[11px] text-zinc-500 truncate">
            {assignedStop?.landmark ? `Near ${assignedStop.landmark}` : "Designated Boarding Corridor"}
          </div>
        </div>

        {/* Pillar 2: Schedule / Shift */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>Schedule & Departure</span>
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
            {assignedShiftName}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
            {assignedShiftStartTime ? `${formatShiftTime(assignedShiftStartTime)} Departure` : "Scheduled Departure"}
            {assignedShiftEndTime ? ` • Arrive ${formatShiftTime(assignedShiftEndTime)}` : ""}
          </div>
        </div>

        {/* Pillar 3: Auto-Assigned Seat (Clean presentation, algorithmic allocation) */}
        <div className={`p-4 rounded-2xl border space-y-1.5 ${
          isAttendanceVerified 
            ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60"
            : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/70 dark:border-zinc-800"
        }`}>
          <div className="flex items-center justify-between text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <Armchair className={`w-3.5 h-3.5 ${isAttendanceVerified ? "text-emerald-600 dark:text-emerald-400" : "text-indigo-500"}`} />
              <span className={isAttendanceVerified ? "text-emerald-800 dark:text-emerald-300" : "text-zinc-700 dark:text-zinc-300"}>
                Auto-Assigned Seat
              </span>
            </div>
            {isAttendanceVerified ? (
              <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                Boarded ✓
              </span>
            ) : (
              <span className="text-[9px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold">
                Pending Scan
              </span>
            )}
          </div>
          <div className={`text-base font-black ${isAttendanceVerified ? "text-emerald-950 dark:text-emerald-200" : "text-zinc-900 dark:text-white"}`}>
            {displaySeatNumber ? `Seat ${displaySeatNumber}` : "Seat Confirmed"}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
            Algorithmically allocated with peer companion cohesion.
          </div>
        </div>
      </div>

      {/* ─── 4. Progressive Disclosure: Collapsible Vehicle & Crew Specifications ─── */}
      <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/40">
        <button
          type="button"
          onClick={() => setIsDetailsExpanded(prev => !prev)}
          className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left transition-colors hover:bg-zinc-100/60 dark:hover:bg-zinc-800/50 cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>Vehicle & Crew Details</span>
                <span className="text-[10px] font-mono text-zinc-500 font-normal">
                  {assignedBus?.registrationNo || "CAMPUS-COACH"}
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Vehicle model, total capacity & onboard conductor
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-bold">
            <span>{isDetailsExpanded ? "Hide Specs" : "View Full Specs"}</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDetailsExpanded ? "rotate-180" : ""}`} />
          </div>
        </button>

        {isDetailsExpanded && (
          <div className="p-4 pt-2 border-t border-zinc-200/60 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 animate-in fade-in duration-200">
            {/* Bus Model & Registration */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-1">
              <div className="text-[10px] font-mono uppercase text-zinc-500 font-bold">Vehicle Model</div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                {assignedBus?.model || "Tata Starbus 42-Seater"}
              </div>
              <div className="text-[11px] text-zinc-500">
                Reg: <span className="font-mono font-semibold">{assignedBus?.registrationNo || "CAMPUS-COACH"}</span> • {assignedBus?.capacity || 42} Seats
              </div>
            </div>

            {/* Assigned Conductor */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-1">
              <div className="text-[10px] font-mono uppercase text-zinc-500 font-bold flex items-center justify-between">
                <span>Assigned Conductor</span>
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">On Duty</span>
              </div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                {assignedConductor?.fullName || (assignedConductor as any)?.name || "Ramesh Sharma (Conductor)"}
              </div>
              <div className="text-[11px] text-zinc-500 flex items-center justify-between">
                <span>Emp: {assignedConductor?.employeeCode || "CND-2026"}</span>
                {assignedConductor?.phone && (
                  <a
                    href={`tel:${assignedConductor.phone}`}
                    className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <PhoneCall className="w-3 h-3" />
                    <span>Call</span>
                  </a>
                )}
              </div>
            </div>

            {/* Transit Operations Desk */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-1">
              <div className="text-[10px] font-mono uppercase text-zinc-500 font-bold">Transit Control Helpline</div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">Central Dispatch Desk</div>
              <div className="text-[11px] text-zinc-500 flex items-center justify-between">
                <span>Campus Fleet 24/7 Control</span>
                <button
                  type="button"
                  onClick={onOpenContactCrew}
                  className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  View Directory
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── 5. Standout Primary CTAs (Full Screen Radar + QR Pass + Crew) ─── */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Full Screen Radar CTA */}
        <Link
          href={`/portal/radar?busId=${assignedBus.id}`}
          className="flex items-center justify-between p-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white transition-all shadow-md group cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 group-hover:rotate-12 transition-transform">
              <Navigation className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                See in Full Screen Radar
              </div>
              <div className="text-[10px] text-indigo-200">
                Live satellite & road tracking
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform" />
        </Link>

        {/* Show My QR Pass */}
        <button
          type="button"
          onClick={() => {
            if (onOpenDigitalPass) {
              onOpenDigitalPass();
            } else {
              router.push("/portal/qr/show");
            }
          }}
          className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 transition-all text-left group active:scale-[0.99] shadow-2xs cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 border border-pink-200/80 dark:border-pink-800/60 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                Show My QR Pass
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                Dynamic digital boarding pass
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Contact Bus Crew */}
        <button
          type="button"
          onClick={onOpenContactCrew}
          className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 transition-all text-left group active:scale-[0.99] shadow-2xs cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/60 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs shrink-0">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <span>Contact Bus Crew</span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[8px] font-black uppercase">
                  Call
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                Conductor & ops helpline
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* ─── 6. Footer Guidance ─── */}
      <div className="pt-1 text-center sm:text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-500">
        <Link
          href={settingsHref}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
        >
          <span>Need to update your home address or seat companion pairing? Go to Settings</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
        {isTripInProgress && (
          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/50 self-start sm:self-auto">
            Bus in Transit • Dispatch Locked
          </span>
        )}
      </div>
    </div>
  );
}
