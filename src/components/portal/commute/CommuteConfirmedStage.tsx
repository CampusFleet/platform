"use client";

import React, { useState, useMemo } from "react";
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
  RefreshCw,
  Lock,
  Compass,
  Hand,
} from "lucide-react";
import type { Bus, Stop, Route, Student, Staff } from "@/lib/types";

export interface CommuteConfirmedStageProps {
  assignedBus: Bus;
  assignedStop: Stop | null;
  assignedRoute?: Route | null;
  assignedShiftName: string;
  assignedShiftStartTime: string;
  assignedShiftEndTime: string;
  student?: Student;
  displaySeatNumber: string;
  isTripInProgress: boolean;
  isAttendanceVerified?: boolean;
  assignedConductor?: Staff | null;
  transportManager?: Staff | null;
  stops?: Stop[];
  routeCoordinates?: [number, number][];
  campusDestinationId?: string | null;
  telematicsLocation?: any;
  isTelematicsLive?: boolean;
  firstMileMetrics?: any;
  userCoords?: { latitude: number; longitude: number } | null;
  deviceGpsCoords?: { latitude: number; longitude: number } | null;
  userAddress?: string | null;
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
  assignedRoute,
  assignedShiftName,
  assignedShiftStartTime,
  assignedShiftEndTime,
  student,
  displaySeatNumber,
  isTripInProgress,
  isAttendanceVerified = false,
  assignedConductor,
  transportManager,
  stops = [],
  routeCoordinates = [],
  campusDestinationId,
  telematicsLocation,
  isTelematicsLive = false,
  firstMileMetrics,
  userCoords,
  deviceGpsCoords,
  userAddress,
  settingsHref,
  onOpenDigitalPass,
  onOpenContactCrew,
  formatShiftTime,
}: CommuteConfirmedStageProps) {
  const router = useRouter();
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  const displayBusNumber = assignedBus.busNumber ? `Bus ${assignedBus.busNumber}` : `Bus #${assignedBus.id}`;
  const speed = telematicsLocation?.speedKmh ?? telematicsLocation?.speed ? Math.round(telematicsLocation.speedKmh ?? telematicsLocation.speed) : 0;
  const isMoving = speed > 2;

  // Only render walking line if within reasonable pedestrian walking distance (<= 2.5 km)
  const walkingCoords = useMemo(() => {
    if (firstMileMetrics?.walkingCoordinates && firstMileMetrics.walkingCoordinates.length >= 2) {
      return firstMileMetrics.walkingCoordinates;
    }
    if (userCoords && assignedStop?.latitude && assignedStop?.longitude) {
      const dLat = (userCoords.latitude - assignedStop.latitude) * 111000;
      const dLng = (userCoords.longitude - assignedStop.longitude) * 96000;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist <= 2500) {
        return [
          [userCoords.latitude, userCoords.longitude],
          [assignedStop.latitude, assignedStop.longitude],
        ] as [number, number][];
      }
    }
    return undefined;
  }, [
    firstMileMetrics?.walkingCoordinates?.[0]?.[0],
    firstMileMetrics?.walkingCoordinates?.[0]?.[1],
    userCoords?.latitude,
    userCoords?.longitude,
    assignedStop?.id,
  ]);

  // Clean formatted seat label (strips any duplicate "Seat " prefix)
  const cleanSeatNumber = useMemo(() => {
    if (!displaySeatNumber) return "";
    return displaySeatNumber.replace(/^Seat\s*/i, "").trim();
  }, [displaySeatNumber]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-7 border border-zinc-200/90 dark:border-zinc-800 shadow-sm space-y-6 animate-in fade-in duration-300">
      {/* ─── 1. Header with Vehicle Identity & Verification Status Pill ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner shrink-0 border border-indigo-100/80 dark:border-indigo-900/40">
            <BusFront className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">
                Assigned Vehicle & Corridor
              </span>
              {isTelematicsLive && (
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live GPS
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
                {displayBusNumber}
              </h2>
              <span className="text-xs text-zinc-500 font-medium hidden sm:inline">
                • {assignedBus.model || "Tata Starbus"} ({assignedBus.registrationNo || "CAMPUS-COACH"})
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <Link
            href={`/portal/radar?busId=${assignedBus.id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all shadow-2xs group"
            title="Launch Full-Screen Live Radar Map"
          >
            <Navigation className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 group-hover:rotate-12 transition-transform" />
            <span>Live Radar</span>
          </Link>

          {/* Dynamic Verification Status Pill */}
          {isAttendanceVerified ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-xs font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Attendance Verified • Boarded</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>Boarding Verification Required</span>
            </span>
          )}
        </div>
      </div>

      {/* Verified Status Banner */}
      {isAttendanceVerified && (
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

      {/* ─── 4. Commute Essentials: 4 Focused Modern Cards (Uber Transit Standard) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Pick-Up Stop */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
            <MapPin className="w-4 h-4 text-pink-500" />
            <span>Your Pick-Up Stop</span>
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-white truncate" title={assignedStop?.name || "Campus Stop"}>
            {assignedStop ? assignedStop.name : (student?.primaryStopId ? `Stop: ${student.primaryStopId}` : "Campus Stop")}
          </div>
          <div className="text-[11px] text-zinc-500 truncate">
            {assignedStop?.landmark ? `Near ${assignedStop.landmark}` : "Designated Boarding Corridor"}
          </div>
        </div>

        {/* Card 2: Schedule & Shift */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>Schedule / Shift</span>
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
            {assignedShiftName}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
            {assignedShiftStartTime ? `${formatShiftTime(assignedShiftStartTime)} Departure` : "Scheduled Departure"}
            {assignedShiftEndTime ? ` • Arrive ${formatShiftTime(assignedShiftEndTime)}` : ""}
          </div>
        </div>

        {/* Card 3: Bus Specifications */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
            <Layers className="w-4 h-4 text-purple-500" />
            <span>Bus Specifications</span>
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
            {assignedBus.model || "Tata Starbus 42-Seater"}
          </div>
          <div className="text-[11px] text-zinc-500 truncate">
            Reg: <span className="font-mono font-medium">{assignedBus.registrationNo || "CAMPUS-COACH"}</span> • {assignedBus.capacity} Seats
          </div>
        </div>

        {/* Card 4: Strictly Guarded Seat Status (Never exposed before marking attendance) */}
        <div
          className={`p-4 rounded-2xl border flex flex-col justify-between space-y-2.5 ${
            isAttendanceVerified
              ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60"
              : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/50"
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-1.5">
                <Armchair
                  className={`w-3.5 h-3.5 ${
                    isAttendanceVerified ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                  }`}
                />
                <span
                  className={
                    isAttendanceVerified
                      ? "text-emerald-800 dark:text-emerald-300"
                      : "text-amber-800 dark:text-amber-300"
                  }
                >
                  {isAttendanceVerified ? "Confirmed Seat" : "Auto-Reserved Seat"}
                </span>
              </div>
              {isAttendanceVerified ? (
                <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                  Marked ✓
                </span>
              ) : (
                <span className="text-[9px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Pending Scan</span>
                </span>
              )}
            </div>

            {/* Strictly Protected Seat Display: Never reveals seat number to commuters before attendance */}
            {isAttendanceVerified ? (
              <div className="text-base sm:text-lg font-black text-emerald-950 dark:text-emerald-200">
                {cleanSeatNumber ? `Seat ${cleanSeatNumber}` : "Seat Confirmed"}
              </div>
            ) : (
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-sm sm:text-base font-black text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Locked • Scan to Reveal</span>
                </span>
              </div>
            )}

            <div
              className={`text-[11px] leading-tight ${
                isAttendanceVerified
                  ? "text-emerald-700 dark:text-emerald-400 font-medium"
                  : "text-amber-700/90 dark:text-amber-400/90 font-medium"
              }`}
            >
              {isAttendanceVerified
                ? "Verified onboard seat assignment • Peer cohesion allocated"
                : "Scan bus dynamic QR or tap RFID card upon boarding to unlock."}
            </div>
          </div>

          {!isAttendanceVerified && (
            <Link
              href="/portal/qr/scan"
              className="inline-flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md transition-all shrink-0 cursor-pointer group"
            >
              <QrCode className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>Scan Bus Dynamic QR</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-80 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>
      </div>

      {/* ─── 5. Progressive Disclosure: Collapsible Vehicle & Crew Specifications ─── */}
      <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/40">
        <button
          type="button"
          onClick={() => setIsDetailsExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left transition-colors hover:bg-zinc-100/60 dark:hover:bg-zinc-800/50 cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
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
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isDetailsExpanded ? "rotate-180" : ""
              }`}
            />
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

      {/* ─── 6. Action Row: Full Screen Radar + QR Pass + Crew (Ergonomic Thumb-Zone) ─── */}
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

      {/* ─── 7. Footer Guidance ─── */}
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
