"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Users,
  MapPin,
  CheckCircle2,
  XCircle,
  Footprints,
  FileText,
  AlertTriangle,
  Phone,
  RefreshCw,
  RotateCcw,
  Sparkles,
  ChevronRight,
  UserCheck,
  ShieldAlert,
  Clock,
  Volume2,
  BellRing,
  X,
  ScanFace,
  QrCode,
  Radio,
} from "lucide-react";
import { Booking, Student, Stop, Bus, Route, Shift } from "@/lib/types";
import { getSafePhotoUrl } from "@/lib/image-utils";
import type { EnrichedPassenger, BusDepartureAlert } from "../ConductorContext";

interface ManifestTabProps {
  tripBookings: (EnrichedPassenger | Booking)[];
  students: Student[];
  stops: Stop[];
  bus?: Bus;
  route?: Route;
  shift?: Shift;
  boardedCount: number;
  pendingCount: number;
  waitlistCount: number;
  roamingCount: number;
  onboardConfirmedCount?: number;
  runningCount?: number;
  outsideCount?: number;
  activeDepartureAlert?: BusDepartureAlert | null;
  onTriggerDepartureAlert?: (customMessage?: string) => Promise<boolean>;
  onDismissDepartureAlert?: () => Promise<boolean>;
  onMarkAttendance: (studentId: string, status: "BOARDED" | "ABSENT" | "NO_SHOW") => void;
  onMarkRoamingHold?: (studentId: string, bookingId: string) => void;
  onRefresh?: () => void;
  isSyncing?: boolean;
}

export function ManifestTab({
  tripBookings,
  students,
  stops,
  bus,
  route,
  shift,
  boardedCount,
  pendingCount,
  waitlistCount,
  roamingCount,
  onboardConfirmedCount = 0,
  runningCount = 0,
  outsideCount,
  activeDepartureAlert,
  onTriggerDepartureAlert,
  onDismissDepartureAlert,
  onMarkAttendance,
  onMarkRoamingHold,
  onRefresh,
  isSyncing,
}: ManifestTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "AWAITING" | "BOARDED" | "WAITLIST" | "ROAMING">("ALL");
  const [selectedStopId, setSelectedStopId] = useState<string>("ALL");
  const [isRecallModalOpen, setIsRecallModalOpen] = useState(false);
  const [recallMessage, setRecallMessage] = useState("");
  const [isSubmittingRecall, setIsSubmittingRecall] = useState(false);

  // Build high-speed lookup maps
  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach(s => {
      if (s.id) map.set(s.id, s);
      if (s.userId) map.set(s.userId, s);
    });
    return map;
  }, [students]);

  const stopMap = useMemo(() => {
    const map = new Map<string, Stop>();
    stops.forEach(s => map.set(s.id, s));
    return map;
  }, [stops]);

  // Derive Stop-by-Stop aggregation for active trip roster
  const stopSummaries = useMemo(() => {
    const counts: Record<string, { stop: Stop; total: number; boarded: number; pending: number }> = {};

    tripBookings.forEach(b => {
      const stopId = b.boardingStopId || "";
      if (!stopId) return;
      if (!counts[stopId]) {
        const foundStop = stopMap.get(stopId) || {
          id: stopId,
          name: "Designated Stop",
          code: stopId.substring(0, 4),
          latitude: 0,
          longitude: 0,
          landmark: "",
          geofenceRadiusMeters: 50,
        };
        counts[stopId] = { stop: foundStop, total: 0, boarded: 0, pending: 0 };
      }
      counts[stopId].total += 1;
      if (b.status === "BOARDED") counts[stopId].boarded += 1;
      else counts[stopId].pending += 1;
    });

    return Object.values(counts);
  }, [tripBookings, stopMap]);

  // Filter passengers by search, stop, and status
  const filteredPassengers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return tripBookings.filter(b => {
      const s = (b as EnrichedPassenger).student || studentMap.get(b.studentId);
      const stop = stopMap.get(b.boardingStopId || "");

      // 1. Stop Filter
      if (selectedStopId !== "ALL" && b.boardingStopId !== selectedStopId) {
        return false;
      }

      // 2. Status Filter
      if (statusFilter === "BOARDED" && b.status !== "BOARDED") return false;
      if (statusFilter === "AWAITING" && b.status !== "CONFIRMED") return false;
      if (statusFilter === "WAITLIST" && b.status !== "WAITLISTED") return false;
      if (statusFilter === "ROAMING" && b.roamingStatus !== "ROAMING") return false;

      // 3. Search Query
      if (!q) return true;

      const fullName = (s?.fullName || (b as any).fullName || "").toLowerCase();
      const studentIdCode = (s?.studentIdCode || (b as any).studentIdCode || "").toLowerCase();
      const phone = (s?.phone || "").toLowerCase();
      const seat = (b.seatNumber || (b as any).seatCode || "").toLowerCase();
      const stopName = (stop?.name || "").toLowerCase();
      const dept = (s?.department || "").toLowerCase();

      return (
        fullName.includes(q) ||
        studentIdCode.includes(q) ||
        phone.includes(q) ||
        seat.includes(q) ||
        stopName.includes(q) ||
        dept.includes(q)
      );
    });
  }, [tripBookings, selectedStopId, statusFilter, searchQuery, studentMap, stopMap]);

  const capacity = bus?.capacity || 40;
  const occupancyPercent = Math.min(100, Math.round((boardedCount / (capacity || 1)) * 100));

  // Automated Passenger Counting (APC) standard ITS load factor tiering
  const loadFactorColor =
    occupancyPercent >= 90
      ? "bg-red-500"
      : occupancyPercent >= 70
      ? "bg-amber-500"
      : "bg-emerald-500";
  const loadFactorText =
    occupancyPercent >= 90
      ? "text-red-400"
      : occupancyPercent >= 70
      ? "text-amber-400"
      : "text-emerald-400";
  const loadFactorLabel =
    occupancyPercent >= 90
      ? "Capacity Critical"
      : occupancyPercent >= 70
      ? "High Density"
      : "Normal Seating";

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ── TOP OPERATIONAL HERO: Bus & APC Boarding Meter ── */}
      <div className="bg-zinc-950 dark:bg-black border border-zinc-800/90 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Autonomous APC Dual-Gate Live Beacon */}
        <div className="relative z-10 mb-4 pb-3 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <ScanFace className="w-3.5 h-3.5 text-emerald-400" />
              <span>Autonomous Dual-Gate AI Active</span>
            </div>
            <span className="hidden sm:inline text-zinc-500 text-xs">•</span>
            <span className="text-[11px] text-zinc-400 hidden sm:inline">
              Commuters auto-boarded via ceiling gate camera on entry
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-md border ${
              occupancyPercent >= 90
                ? "bg-red-950/80 text-red-300 border-red-800"
                : occupancyPercent >= 70
                ? "bg-amber-950/80 text-amber-300 border-amber-800"
                : "bg-emerald-950/80 text-emerald-300 border-emerald-800"
            }`}>
              APC Load: {loadFactorLabel}
            </span>
          </div>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="font-mono text-xl sm:text-2xl font-black text-white tracking-tight">
                {bus?.busNumber || "Duty Bus"}
              </span>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700">
                {bus?.registrationNo || "CAMPUS-FLEET"}
              </span>
              {shift?.name && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {shift.name}
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-400 flex items-center gap-1.5 font-medium">
              <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>{route?.name || "Transit Route Corridor"}</span>
              {shift?.startTime && <span>• Departs {shift.startTime}</span>}
            </div>
          </div>

          {/* Occupancy Gauge */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 min-w-[260px] space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-zinc-400">APC Live Headcount</span>
              <span className={`${loadFactorText} font-mono font-black`}>
                {boardedCount} / {tripBookings.length} Boarded ({occupancyPercent}%)
              </span>
            </div>
            <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
              <div
                className={`${loadFactorColor} h-full rounded-full transition-all duration-500 ease-out`}
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-0.5">
              <span>Awaiting: <strong className="text-blue-400">{pendingCount}</strong></span>
              <span>Waitlist: <strong className="text-amber-400">{waitlistCount}</strong></span>
              <span>Capacity: <strong className="text-white">{capacity}</strong></span>
            </div>
          </div>
        </div>

        {/* ── BUS DEPARTURE NOTIFICATION COMMAND CENTER ── */}
        <div className="relative z-10 pt-4 mt-4 border-t border-zinc-850">
          {activeDepartureAlert ? (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-red-950/80 via-zinc-900 to-amber-950/60 border border-red-500/50 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl animate-in fade-in">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3.5 w-3.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-wider text-red-300 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-red-400 animate-bounce" />
                      Departure Recall Alarm Ringing
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-red-900/60 text-red-200 border border-red-800 font-bold">
                      ACID Durability Active
                    </span>
                  </div>
                  <div className="text-xs text-zinc-300 mt-1 flex items-center gap-2 flex-wrap font-sans">
                    <span className="text-emerald-400 font-mono font-bold">
                      ✓ {onboardConfirmedCount} Confirmed In Bus
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-amber-400 font-mono font-bold">
                      🏃 {runningCount} Sprinting (2m Hold)
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400 font-mono">
                      ⏳ {outsideCount !== undefined ? outsideCount : pendingCount} Awaiting
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (onDismissDepartureAlert) await onDismissDepartureAlert();
                }}
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-black border border-zinc-700 shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <span>Dismiss / Silence Alarm</span>
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-zinc-400">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <BellRing className="w-3.5 h-3.5 text-amber-400" />
                  Bus Departure Notification System
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  If students are outside the bus, sound an instant alarm on their phones to return on time.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const defaultMsg = `🚨 Bus ${bus?.busNumber || "Duty Bus"} is preparing for immediate departure! Please return and confirm onboard.`;
                  setRecallMessage(defaultMsg);
                  setIsRecallModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white text-xs font-black shadow-lg shadow-red-950/40 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Volume2 className="w-4 h-4 animate-pulse" />
                <span>Sound Departure Alarm</span>
                <span className="px-1.5 py-0.5 rounded bg-black/30 text-[10px] font-mono">
                  {outsideCount !== undefined ? outsideCount : pendingCount}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── STOP-BY-STOP HORIZONTAL FILTER ── */}
      {stopSummaries.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" /> Filter by Boarding Stop
            </span>
            <span className="text-[11px] text-zinc-500">
              {selectedStopId === "ALL" ? "Showing all stops" : "Stop filter active"}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setSelectedStopId("ALL")}
              className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedStopId === "ALL"
                  ? "bg-white text-zinc-950 shadow-md shadow-white/10"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white hover:border-zinc-700"
              }`}
            >
              All Stops ({tripBookings.length})
            </button>

            {stopSummaries.map(({ stop, total, boarded, pending }) => {
              const isSelected = selectedStopId === stop.id;
              return (
                <button
                  key={stop.id}
                  onClick={() => setSelectedStopId(stop.id)}
                  className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-500"
                      : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white hover:border-zinc-700"
                  }`}
                >
                  <span className="truncate max-w-[160px]">{stop.name}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                      isSelected ? "bg-blue-700 text-white font-black" : "bg-zinc-800 text-zinc-300 font-bold"
                    }`}
                  >
                    {boarded}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SEARCH & STATUS FILTER BAR ── */}
      <div className="bg-zinc-950 dark:bg-black border border-zinc-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setStatusFilter("ALL")}
              className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "ALL"
                  ? "bg-zinc-200 dark:bg-white text-zinc-950 shadow-sm"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white"
              }`}
            >
              All ({tripBookings.length})
            </button>

            <button
              onClick={() => setStatusFilter("AWAITING")}
              className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "AWAITING"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30 font-black"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-blue-400"
              }`}
            >
              Awaiting ({pendingCount})
            </button>

            <button
              onClick={() => setStatusFilter("BOARDED")}
              className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "BOARDED"
                  ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 font-black"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-emerald-400"
              }`}
            >
              Boarded ({boardedCount})
            </button>

            <button
              onClick={() => setStatusFilter("WAITLIST")}
              className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "WAITLIST"
                  ? "bg-amber-600 text-white shadow-sm font-black"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-amber-400"
              }`}
            >
              Waitlist ({waitlistCount})
            </button>

            <button
              onClick={() => setStatusFilter("ROAMING")}
              className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "ROAMING"
                  ? "bg-purple-600 text-white shadow-sm font-black"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-purple-400"
              }`}
            >
              🎒 Roaming ({roamingCount})
            </button>
          </div>

          {/* Real-time search */}
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Name, College ID, Seat..."
              className="w-full text-xs pl-10 pr-8 py-2.5 bg-zinc-900 border border-zinc-800 rounded-2xl text-white placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-3 text-zinc-500 hover:text-white"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── PASSENGER LIST CARDS ── */}
        <div className="divide-y divide-zinc-900">
          {filteredPassengers.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-500 space-y-3 font-mono">
              <Users className="w-10 h-10 mx-auto text-zinc-700" />
              <div>No passengers match the current filter or search criteria.</div>
              {(selectedStopId !== "ALL" || statusFilter !== "ALL" || searchQuery) && (
                <button
                  onClick={() => {
                    setSelectedStopId("ALL");
                    setStatusFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold hover:text-white"
                >
                  Reset All Filters
                </button>
              )}
            </div>
          ) : (
            filteredPassengers.map(b => {
              const enriched = b as EnrichedPassenger;
              const s = enriched.student || studentMap.get(b.studentId);
              const stop = stopMap.get(b.boardingStopId || "");
              const isBoarded = b.status === "BOARDED";
              const isAbsent = b.status === "ABSENT" || b.status === "NO_SHOW";
              const isWaitlisted = b.status === "WAITLISTED";

              const seatDisplay =
                b.seatNumber ||
                enriched.seatCode ||
                (isWaitlisted
                  ? b.waitlistPosition
                    ? `WL-${b.waitlistPosition}`
                    : "WL"
                  : "PASS");

              const studentFullName = s?.fullName || enriched.fullName || "Student Commuter";
              const studentCollegeId = s?.studentIdCode || enriched.studentIdCode || "";
              const studentPhoto = s?.photoUrl || enriched.photoUrl || "";
              const studentPhone = s?.phone || enriched.phone;

              return (
                <div
                  key={b.id || `passenger-${b.studentId}`}
                  className={`p-3.5 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all ${
                    isBoarded
                      ? "bg-emerald-950/20 border border-emerald-900/30"
                      : isAbsent
                      ? "bg-red-950/20 border border-red-900/30 opacity-60"
                      : "hover:bg-zinc-900/50 border border-transparent"
                  }`}
                >
                  {/* Left: Identity Details & Photo */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Monospace Seat Badge */}
                    <div
                      className={`w-12 h-12 min-w-[3rem] rounded-2xl flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-sm border px-1 text-center select-none ${
                        isBoarded
                          ? "bg-emerald-600 border-emerald-500 text-white"
                          : isWaitlisted
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          : "bg-blue-600/10 text-blue-400 border-blue-500/30"
                      }`}
                    >
                      <span className="truncate">{seatDisplay}</span>
                    </div>

                    {/* Official Passport Photo with verification badge */}
                    {studentPhoto ? (
                      <div
                        className="relative w-11 h-13 rounded-xl overflow-hidden border-2 border-emerald-500/70 bg-black shrink-0 shadow-sm"
                        title="Official Passport Photo Verified"
                      >
                        <img
                          src={getSafePhotoUrl(studentPhoto)}
                          alt={studentFullName}
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          onError={e => {
                            if (studentPhoto && e.currentTarget.src !== studentPhoto) {
                              e.currentTarget.src = studentPhoto;
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-0 inset-x-0 bg-emerald-600 text-[7px] text-white font-black text-center py-0.2 uppercase tracking-tighter">
                          OK
                        </div>
                      </div>
                    ) : (
                      <div
                        className="w-11 h-13 rounded-xl border border-dashed border-red-500/60 bg-red-950/30 flex flex-col items-center justify-center text-red-400 shrink-0 p-1 text-center"
                        title="No photo on file - Conductor must inspect physical university ID!"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-[6px] font-black uppercase tracking-tighter text-red-400 leading-none mt-0.5">
                          Check ID
                        </span>
                      </div>
                    )}

                    {/* Identity Details */}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white truncate max-w-[170px] sm:max-w-xs">
                          {studentFullName}
                        </span>

                        {/* College Student ID Badge */}
                        {studentCollegeId && (
                          <span
                            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 shrink-0"
                            title="Official College Student Roll ID"
                          >
                            {studentCollegeId}
                          </span>
                        )}

                        {/* Roaming & Departure Alert Response Indicators */}
                        {b.roamingStatus === "ONBOARD_CONFIRMED" ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-700 font-bold shrink-0 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Confirmed In Bus
                          </span>
                        ) : b.roamingStatus === "RUNNING_TO_BUS" ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-700 font-bold shrink-0 animate-pulse flex items-center gap-1">
                            <span>🏃 Sprinting (2m Hold)</span>
                          </span>
                        ) : b.roamingStatus === "ROAMING" ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-800 font-bold shrink-0 flex items-center gap-1">
                            <Footprints className="w-3 h-3 text-purple-400" />
                            Roaming Campus
                          </span>
                        ) : null}
                      </div>

                      {/* Department & Stop Info */}
                      <div className="text-xs text-zinc-400 flex items-center gap-2 flex-wrap font-sans">
                        <span className="flex items-center gap-1 text-zinc-300">
                          <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
                          {stop?.name || "Assigned Stop"}
                        </span>

                        {s?.department && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span className="text-zinc-400">{s.department}</span>
                          </>
                        )}

                        {s?.semester && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            Sem {s.semester}
                          </span>
                        )}
                      </div>

                      {/* Boarded time stamp & validation method provenance */}
                      {b.boardedAt && (
                        <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5 pt-0.5 flex-wrap">
                          <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>
                            Boarded at{" "}
                            {new Date(b.boardedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {enriched.unlockedBy && (
                            (() => {
                              const u = (enriched.unlockedBy || "").toUpperCase();
                              if (u.includes("FACE") || u.includes("BIOMETRIC")) {
                                return (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                    <ScanFace className="w-2.5 h-2.5 text-emerald-400" />
                                    Face ID Gate
                                  </span>
                                );
                              }
                              if (u.includes("DYNAMIC") || u.includes("QR")) {
                                return (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                                    <QrCode className="w-2.5 h-2.5 text-blue-400" />
                                    Dynamic QR
                                  </span>
                                );
                              }
                              if (u.includes("RFID")) {
                                return (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                                    <Radio className="w-2.5 h-2.5 text-indigo-400" />
                                    RFID Card
                                  </span>
                                );
                              }
                              return (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                  <UserCheck className="w-2.5 h-2.5 text-zinc-400" />
                                  {enriched.unlockedBy}
                                </span>
                              );
                            })()
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Thumb-Friendly Action Buttons (min 48px) */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800 shrink-0">
                    {/* Call Student Phone */}
                    {studentPhone && (
                      <a
                        href={`tel:${studentPhone}`}
                        className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer"
                        title={`Call ${studentFullName} (${studentPhone})`}
                      >
                        <Phone className="w-4 h-4 text-emerald-400" />
                      </a>
                    )}

                    {isBoarded ? (
                      <div className="flex items-center gap-1.5">
                        <span className="px-3.5 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs font-black flex items-center gap-1.5 shadow-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Boarded ✓</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onMarkAttendance(b.studentId, "ABSENT")}
                          className="px-2.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-bold transition-all cursor-pointer"
                          title="Undo / Mark not boarded"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => onMarkAttendance(b.studentId, "BOARDED")}
                          className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Board</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onMarkAttendance(b.studentId, "ABSENT")}
                          className="min-h-[44px] px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-red-950/60 hover:text-red-400 border border-zinc-800 text-zinc-400 text-xs font-bold transition-all cursor-pointer"
                          title="Mark Absent / No Show"
                        >
                          Absent
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── BROADCAST DEPARTURE ALARM CONFIRMATION MODAL ── */}
      {isRecallModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 text-white rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                  <Volume2 className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Broadcast Departure Alarm</h3>
                  <p className="text-xs text-zinc-400">Trigger student recall siren & haptic ring</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecallModalOpen(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs space-y-2">
              <div className="text-zinc-300 font-medium">
                This will trigger a real-time audible siren & modal alert on the smartphones of <strong>{outsideCount !== undefined ? outsideCount : pendingCount} outside commuters</strong>:
              </div>
              <div className="text-[11px] text-zinc-400 space-y-1">
                <div>• Synthesizes Web Audio transit siren on mobile phones</div>
                <div>• Triggers haptic vibration alerting students away from the bus</div>
                <div>• Offers 1-tap &ldquo;Yes, I&apos;m in bus&rdquo; or &ldquo;Running to bus (2m Hold)&rdquo;</div>
                <div>• ACID durable logging in university audit trail</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Broadcast Announcement Message
              </label>
              <textarea
                value={recallMessage}
                onChange={(e) => setRecallMessage(e.target.value)}
                rows={2}
                className="w-full bg-black border border-zinc-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-sans"
                placeholder="🚨 Bus is preparing for immediate departure! Please return and confirm onboard."
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsRecallModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsSubmittingRecall(true);
                  if (onTriggerDepartureAlert) {
                    await onTriggerDepartureAlert(recallMessage);
                  }
                  setIsSubmittingRecall(false);
                  setIsRecallModalOpen(false);
                }}
                disabled={isSubmittingRecall}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs shadow-lg shadow-red-900/40 flex items-center gap-2 cursor-pointer"
              >
                {isSubmittingRecall ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
                <span>Sound Alarm ({outsideCount !== undefined ? outsideCount : pendingCount} Students)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
