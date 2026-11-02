"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Navigation,
  MapPin,
  Compass,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Volume2,
  VolumeX,
  Bus as BusIcon,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Users,
  Clock,
  Crosshair,
  Layers,
  FastForward,
  RotateCcw,
  ArrowLeft,
  Radio,
  Check,
  X,
  PhoneCall,
  Building2,
  Maximize2,
  Minimize2,
  BellRing,
  GraduationCap,
  UserCheck,
  Phone,
  Shield,
  Search,
} from "lucide-react";
import CampusFleetMap from "@/components/maps/CampusFleetMap";
import { telematicsService } from "@/lib/telematicsService";
import { store } from "@/lib/store";
import { calculateDistanceKm, calculateExactDistanceMeters, formatTime } from "@/lib/utils";
import type { Trip, Bus as BusType, Route, Booking, Stop, LiveBusLocation, Shift, Student, TripDirection } from "@/lib/types";

export interface StopPassengerInfo {
  stopId: string;
  stopName: string;
  total: number;
  studentsCount: number;
  teachersCount: number;
  passengers: Array<{
    id: string;
    fullName: string;
    role: "student" | "faculty";
    seatCode: string;
    phone: string | null;
    isBoarded?: boolean;
    photoUrl?: string;
  }>;
}

export interface ConductorLiveRadarViewProps {
  initialUser?: any;
  activeTrip: Trip | null;
  route: Route | null;
  bus: BusType | null;
  shift?: Shift | null;
  allTrips: Trip[];
  allBuses: BusType[];
  allRoutes: Route[];
  allStops: Stop[];
  bookings?: Booking[];
  students?: Student[];
  tripBookings?: any[];
  shiftDirection?: TripDirection;
  onTripUpdate?: (tripId: string, updates: Partial<Trip>) => Promise<void> | void;
  onClose?: () => void;
  backLabel?: string;
}

export default function ConductorLiveRadarView({
  initialUser,
  activeTrip: propActiveTrip,
  route: propRoute,
  bus: propBus,
  shift: propShift,
  allTrips = [],
  allBuses = [],
  allRoutes = [],
  allStops = [],
  bookings = [],
  students = [],
  tripBookings = [],
  shiftDirection: propShiftDirection,
  onTripUpdate,
  onClose,
  backLabel,
}: ConductorLiveRadarViewProps) {
  // ── 1. ACTIVE TRIP, ROUTE & BUS RESOLUTION ────────────────────────────────
  const [activeTrip, setActiveTrip] = useState<Trip | null>(propActiveTrip);
  const [bus] = useState<BusType | null>(propBus || allBuses[0] || null);
  const [route] = useState<Route | null>(propRoute || allRoutes[0] || null);
  const [shift] = useState<Shift | null>(propShift || null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [selectedRosterStop, setSelectedRosterStop] = useState<StopPassengerInfo | null>(null);
  const [rosterSearch, setRosterSearch] = useState("");
  const [dismissedStopHaltId, setDismissedStopHaltId] = useState<string | null>(null);
  const [isAlertMinimized, setIsAlertMinimized] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mapTheme, setMapTheme] = useState<"GOOGLE_STREETS" | "GOOGLE_HYBRID" | "CARTO_DARK">("GOOGLE_STREETS");
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosSent, setSosSent] = useState(false);

  // Determine Shift Direction: Incoming (Pickups to Campus) vs Outgoing (Drop-offs from Campus)
  const isIncomingShift = useMemo(() => {
    if (propShiftDirection) return propShiftDirection === "HOME_TO_CAMPUS";
    if (shift?.direction) return shift.direction === "HOME_TO_CAMPUS";
    if (shift?.shiftType) {
      const st = String(shift.shiftType).toLowerCase();
      if (st.includes("morning") || st.includes("pickup") || st.includes("inbound")) return true;
      if (st.includes("evening") || st.includes("drop") || st.includes("outbound")) return false;
    }
    if (shift?.name) {
      const n = shift.name.toLowerCase();
      if (n.includes("morning") || n.includes("pickup") || n.includes("inbound")) return true;
      if (n.includes("evening") || n.includes("drop") || n.includes("outbound")) return false;
    }
    return true; // default incoming morning commute
  }, [propShiftDirection, shift]);

  // Corridor Ordered Stops
  const routeStops = useMemo(() => {
    if (!route?.stops || route.stops.length === 0) {
      return allStops.slice(0, 8).map((s, idx) => ({ stop: s, stopOrder: idx }));
    }
    return [...route.stops]
      .sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0))
      .map((rs) => {
        const fullStop = rs.stop || allStops.find((s) => s.id === rs.stopId);
        return {
          ...rs,
          stop: fullStop || {
            id: rs.stopId,
            name: `Stop ${rs.stopOrder || 1}`,
            latitude: 29.375,
            longitude: 79.529,
          },
        };
      });
  }, [route, allStops]);

  const totalStopsCount = routeStops.length;
  const currentStopIndex = activeTrip?.currentStopIndex ?? 0;
  const currentTargetStop = routeStops[currentStopIndex]?.stop || routeStops[0]?.stop || null;
  const nextTargetStop = routeStops[currentStopIndex + 1]?.stop || null;
  const originStop = routeStops[0]?.stop || null;
  const terminalStop = routeStops[routeStops.length - 1]?.stop || null;

  // Automatically un-minimize halt alert when the bus approaches a new target stop
  useEffect(() => {
    setIsAlertMinimized(false);
  }, [currentTargetStop?.id]);

  // Real-time Bus Telematics Location
  const [currentCoords, setCurrentCoords] = useState<{
    latitude: number;
    longitude: number;
    speedKmh: number;
    headingDeg: number;
    accuracy?: number;
  }>(() => {
    const cached = store.getLiveLocation();
    if (cached && (cached.latitude !== 0 || cached.longitude !== 0)) {
      return {
        latitude: cached.latitude,
        longitude: cached.longitude,
        speedKmh: cached.speedKmh || 0,
        headingDeg: cached.headingDeg || 0,
        accuracy: cached.accuracy || 10,
      };
    }
    return {
      latitude: originStop?.latitude || 29.375,
      longitude: originStop?.longitude || 79.5295,
      speedKmh: 0,
      headingDeg: 0,
      accuracy: 10,
    };
  });

  const [hasLiveGps, setHasLiveGps] = useState(false);

  // Subscribe to live bus telematics
  useEffect(() => {
    if (!bus?.id) return;
    let isMounted = true;

    const handleTelematics = (incoming: LiveBusLocation) => {
      if (!isMounted || !incoming) return;
      if (incoming.busId === bus.id || String(incoming.busNumber) === String(bus.busNumber)) {
        setCurrentCoords({
          latitude: Number(incoming.latitude),
          longitude: Number(incoming.longitude),
          speedKmh: Number(incoming.speedKmh || 0),
          headingDeg: Number(incoming.headingDeg || 0),
          accuracy: incoming.accuracy || 10,
        });
        setHasLiveGps(true);
      }
    };

    const unsub = telematicsService.subscribe(handleTelematics);
    telematicsService.startPolling(bus.id, 2500);

    return () => {
      isMounted = false;
      unsub();
      telematicsService.stopPolling();
    };
  }, [bus?.id, bus?.busNumber]);

  // Audio Announcer & Web Chime synthesizer
  const playChime = useCallback((freq = 587.33, dur = 0.2) => {
    if (!isAudioEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {}
  }, [isAudioEnabled]);

  const speakGuidance = useCallback((text: string) => {
    if (!isAudioEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }, [isAudioEnabled]);

  // Calculate Passenger Demand Map (Students vs Faculty)
  const stopPassengerRosterMap = useMemo(() => {
    const map = new Map<string, StopPassengerInfo>();
    const studentMap = new Map<string, Student>();
    (students || []).forEach((s) => {
      if (s.id) studentMap.set(s.id, s);
      if (s.userId) studentMap.set(s.userId, s);
    });

    const candidateList =
      tripBookings && tripBookings.length > 0
        ? tripBookings
        : bookings.filter((b) => !activeTrip?.id || b.tripId === activeTrip.id);

    routeStops.forEach((rs) => {
      const sId = rs.stop.id;
      const matching: Array<{
        id: string;
        fullName: string;
        role: "student" | "faculty";
        seatCode: string;
        phone: string | null;
        isBoarded?: boolean;
        photoUrl?: string;
      }> = [];

      candidateList.forEach((item: any) => {
        if (item.status === "CANCELLED") return;
        const stud = studentMap.get(item.studentId);
        const isFaculty = Boolean(
          stud?.department?.toLowerCase().includes("faculty") ||
          (stud as any)?.role === "faculty" ||
          (stud as any)?.role === "teacher" ||
          (item as any)?.passengerRole === "teacher" ||
          (stud as any)?.userRole === "faculty" ||
          (item as any)?.userRole === "teacher"
        );

        const isAtThisStop = item.boardingStopId === sId || stud?.primaryStopId === sId;

        if (isAtThisStop) {
          matching.push({
            id: item.id || item.studentId,
            fullName: item.fullName || stud?.fullName || "Commuter",
            role: isFaculty ? "faculty" : "student",
            seatCode: item.seatCode || item.seatNumber || (item as any)?.seat_number || "Seat",
            phone: item.phone || stud?.phone || null,
            isBoarded: item.isBoarded ?? item.status === "BOARDED",
            photoUrl: item.photoUrl || stud?.photoUrl,
          });
        }
      });

      const studentsCount = matching.filter((p) => p.role === "student").length;
      const teachersCount = matching.filter((p) => p.role === "faculty").length;

      map.set(sId, {
        stopId: sId,
        stopName: rs.stop.name,
        total: matching.length,
        studentsCount,
        teachersCount,
        passengers: matching,
      });
    });

    return map;
  }, [routeStops, tripBookings, bookings, activeTrip?.id, students]);

  // Current Stop Demand
  const currentStopDemand = currentTargetStop ? stopPassengerRosterMap.get(currentTargetStop.id) || null : null;

  // Auto-trigger voice alert when approaching stop with passenger demand
  const lastAnnouncedStopRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentTargetStop || !currentStopDemand || currentStopDemand.total === 0) return;
    if (lastAnnouncedStopRef.current === currentTargetStop.id) return;

    lastAnnouncedStopRef.current = currentTargetStop.id;
    playChime(659.25, 0.35);

    const alertText = isIncomingShift
      ? `Approaching ${currentTargetStop.name}. Stop bus for pickup of ${currentStopDemand.total} passengers.`
      : `Approaching ${currentTargetStop.name}. Stop bus for drop-off of ${currentStopDemand.total} passengers.`;
    speakGuidance(alertText);
  }, [currentTargetStop, currentStopDemand, isIncomingShift, playChime, speakGuidance]);

  // Distance to current target stop
  const distanceToCurrentTargetMeters = useMemo(() => {
    if (!currentTargetStop) return 0;
    const km = calculateDistanceKm(
      currentCoords.latitude,
      currentCoords.longitude,
      currentTargetStop.latitude,
      currentTargetStop.longitude
    );
    return Math.round(km * 1000);
  }, [currentCoords, currentTargetStop]);

  const etaToCurrentTargetMins = useMemo(() => {
    const distKm = distanceToCurrentTargetMeters / 1000;
    const speed = currentCoords.speedKmh > 8 ? currentCoords.speedKmh : 24;
    return Math.max(1, Math.round((distKm / speed) * 60));
  }, [distanceToCurrentTargetMeters, currentCoords.speedKmh]);

  // ── TACTICAL ACTIONS ──────────────────────────────────────────────────────
  // 1. Confirm Stop Operation (All Boarded or All Alighted)
  const handleConfirmStopAction = async () => {
    if (!currentTargetStop) return;
    const stopName = currentTargetStop.name;
    setDismissedStopHaltId(currentTargetStop.id);

    playChime(659.25, 0.3);
    const verb = isIncomingShift ? "Pickup" : "Drop-off";
    speakGuidance(`${verb} completed at ${stopName}. Proceeding.`);
    setToastMessage(`✓ ${verb} confirmed for ${stopName}`);
    setTimeout(() => setToastMessage(null), 3000);

    // Auto-advance stop index if available
    if (activeTrip && currentStopIndex < totalStopsCount - 1) {
      const nextIdx = currentStopIndex + 1;
      const updates: Partial<Trip> = { currentStopIndex: nextIdx };
      setActiveTrip((prev) => (prev ? { ...prev, ...updates } : prev));
      await store.updateTrip(activeTrip.id, updates);
      if (onTripUpdate) await onTripUpdate(activeTrip.id, updates);
    }
  };

  // 2. Advance to Next Corridor Stop
  const handleAdvanceNextStop = async () => {
    if (!activeTrip || currentStopIndex >= totalStopsCount - 1) return;
    const nextIdx = currentStopIndex + 1;
    const targetStopObj = routeStops[nextIdx]?.stop;

    const updates: Partial<Trip> = { currentStopIndex: nextIdx };
    setActiveTrip((prev) => (prev ? { ...prev, ...updates } : prev));
    await store.updateTrip(activeTrip.id, updates);
    if (onTripUpdate) await onTripUpdate(activeTrip.id, updates);

    if (targetStopObj) {
      setCurrentCoords({
        latitude: targetStopObj.latitude,
        longitude: targetStopObj.longitude,
        speedKmh: 24,
        headingDeg: (currentCoords.headingDeg + 15) % 360,
        accuracy: 5,
      });
      playChime(587.33, 0.25);
      speakGuidance(`Advancing to ${targetStopObj.name}`);
      setToastMessage(`✓ Now heading to: ${targetStopObj.name}`);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // 3. Complete Route & Park at Depot
  const handleCompleteRoute = async () => {
    if (!activeTrip) return;
    if (confirm("Confirm route run completion and passenger manifest closure?")) {
      const completedAt = new Date().toISOString();
      const updates: Partial<Trip> = { status: "COMPLETED", completedAt };
      setActiveTrip((prev) => (prev ? { ...prev, ...updates } : prev));
      await store.updateTrip(activeTrip.id, updates);
      if (onTripUpdate) await onTripUpdate(activeTrip.id, updates);

      playChime(440, 0.4);
      speakGuidance("Trip completed. All passengers accounted for.");
      setToastMessage("🏁 Route completed and manifest closed.");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Toggle Fullscreen Mode
  const toggleFullScreenMode = () => {
    if (typeof document !== "undefined") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  return (
    <div className="relative w-full h-[100dvh] bg-zinc-100 dark:bg-black text-zinc-900 dark:text-white overflow-hidden flex flex-col font-sans select-none">
      {/* ── 1. TOP CONDUCTOR NAVIGATION BAR ─────────────────────────────────── */}
      <header className="absolute top-3 inset-x-3 sm:inset-x-6 z-30 pointer-events-none flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Back to Conductor Dashboard */}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="pointer-events-auto px-3.5 py-2 rounded-2xl bg-white/95 dark:bg-black/90 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 group cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <span>{backLabel || "Conductor Dashboard"}</span>
            </button>
          ) : (
            <Link
              href="/conductor"
              className="pointer-events-auto px-3.5 py-2 rounded-2xl bg-white/95 dark:bg-black/90 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <span>Conductor Dashboard</span>
            </Link>
          )}

          {/* Operational Status Pill */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="px-3 py-1.5 rounded-2xl border text-[11px] font-mono font-bold flex items-center gap-2 bg-white/95 dark:bg-black/90 text-zinc-900 dark:text-white border-zinc-200 dark:border-zinc-800 shadow-xl">
              <span className={`w-2 h-2 rounded-full shrink-0 ${hasLiveGps ? "bg-emerald-500 animate-pulse" : "bg-blue-500"}`} />
              <span>{hasLiveGps ? "LIVE GPS" : "ACTIVE RUN"}</span>
              <span className="text-zinc-500 dark:text-zinc-400 font-semibold">• Bus {bus?.busNumber || "45"}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 dark:bg-blue-600/30 text-blue-700 dark:text-blue-300 border border-blue-400/30 dark:border-blue-500/40 font-mono font-bold">
                {isIncomingShift ? "PICKUP" : "DROP-OFF"}
              </span>
            </div>

            {/* Audio Guidance Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !isAudioEnabled;
                setIsAudioEnabled(next);
                if (next) playChime(659.25, 0.2);
                setToastMessage(next ? "Voice Announcer: Active" : "Voice Announcer: Muted");
                setTimeout(() => setToastMessage(null), 2000);
              }}
              className={`p-2.5 rounded-2xl border shadow-xl transition-all active:scale-95 cursor-pointer ${
                isAudioEnabled
                  ? "bg-emerald-600 border-emerald-400 text-white"
                  : "bg-white/95 dark:bg-black/90 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
              title={isAudioEnabled ? "Voice Announcer ON" : "Voice Announcer MUTED"}
            >
              {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Map Theme Toggle */}
            <button
              type="button"
              onClick={() => {
                setMapTheme((prev) => (prev === "GOOGLE_STREETS" ? "GOOGLE_HYBRID" : prev === "GOOGLE_HYBRID" ? "CARTO_DARK" : "GOOGLE_STREETS"));
              }}
              className="p-2.5 rounded-2xl bg-white/95 dark:bg-black/90 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 shadow-xl transition-all active:scale-95 cursor-pointer"
              title="Cycle Map Style"
            >
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullScreenMode}
              className="p-2.5 rounded-2xl bg-white/95 dark:bg-black/90 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 shadow-xl transition-all active:scale-95 cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Radar Mode"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Toast feedback banner */}
        {toastMessage && (
          <div className="pointer-events-auto self-center px-4 py-2 rounded-2xl bg-white/95 dark:bg-black/95 text-zinc-900 dark:text-white border border-zinc-300 dark:border-zinc-700 shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-top-2">
            {toastMessage}
          </div>
        )}

        {/* ── 2. CONDUCTOR HIGH-PRIORITY STOP HALT ALERT CARD ── */}
        {currentTargetStop && currentStopDemand && currentStopDemand.total > 0 && dismissedStopHaltId !== currentTargetStop.id && (
          isAlertMinimized ? (
            /* MINIMIZED COMPACT ALERT BUTTON */
            <div className="pointer-events-auto flex items-center justify-start animate-in fade-in slide-in-from-top-2 duration-200">
              <button
                type="button"
                onClick={() => setIsAlertMinimized(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-black/95 text-zinc-900 dark:text-white border-2 border-emerald-500 shadow-2xl backdrop-blur-xl hover:border-emerald-400 active:scale-95 transition-all cursor-pointer group"
                title="Tap to expand passenger pickup instructions"
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                    isIncomingShift ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                  }`}
                >
                  <BellRing className="w-3.5 h-3.5 animate-bounce" />
                </div>
                <div className="flex items-center gap-2 text-xs font-black">
                  <span className={isIncomingShift ? "text-emerald-600 dark:text-emerald-400 font-extrabold uppercase tracking-wide" : "text-amber-600 dark:text-amber-400 font-extrabold uppercase tracking-wide"}>
                    {isIncomingShift ? "🛑 STOP FOR PICKUP" : "🛑 STOP FOR DROP-OFF"}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-600">•</span>
                  <span className="font-bold truncate max-w-[170px] sm:max-w-[260px] text-zinc-900 dark:text-white">
                    {currentTargetStop.name} ({currentStopDemand.total})
                  </span>
                </div>
                <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors ml-1 shrink-0">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          ) : (
            /* EXPANDED STOP HALT ALERT CARD (LIGHT & DARK THEMED) */
            <div className="pointer-events-auto bg-white/95 dark:bg-black/95 text-zinc-900 dark:text-white border-2 border-emerald-500 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-300 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                      isIncomingShift ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                    }`}
                  >
                    <BellRing className="w-6 h-6 animate-bounce" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                          isIncomingShift
                            ? "bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 dark:border-emerald-500/40"
                            : "bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 dark:border-amber-500/40"
                        }`}
                      >
                        {isIncomingShift ? "🛑 STOP BUS FOR PICKUP" : "🛑 STOP BUS FOR DROP-OFF"}
                      </span>
                      <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400">
                        Corridor Stop #{currentStopIndex + 1}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white mt-1">
                      {isIncomingShift
                        ? `Halt bus at ${currentTargetStop.name} to pickup ${currentStopDemand.total} passenger${currentStopDemand.total > 1 ? "s" : ""}`
                        : `Halt bus at ${currentTargetStop.name} to drop-off ${currentStopDemand.total} passenger${currentStopDemand.total > 1 ? "s" : ""}`}
                    </h2>
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-600 dark:text-zinc-300 mt-1 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-blue-700 dark:text-blue-300 font-bold border border-zinc-200 dark:border-zinc-700">
                        🎓 {currentStopDemand.studentsCount} Students
                      </span>
                      {currentStopDemand.teachersCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-amber-700 dark:text-amber-300 font-bold border border-zinc-200 dark:border-zinc-700">
                          👨‍🏫 {currentStopDemand.teachersCount} Faculty
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedRosterStop(currentStopDemand)}
                    className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white flex items-center gap-1.5 transition-all shrink-0 cursor-pointer border border-zinc-200 dark:border-zinc-700"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Roster ({currentStopDemand.total})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAlertMinimized(true)}
                    className="w-8 h-8 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center border border-zinc-200 dark:border-zinc-700 transition-all active:scale-90 cursor-pointer shrink-0"
                    title="Minimize alert banner into button"
                    aria-label="Minimize alert"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Commuter Chips Preview */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                {currentStopDemand.passengers.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 shrink-0"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${p.role === "faculty" ? "bg-amber-500" : "bg-blue-500"}`} />
                    <span className="font-bold truncate max-w-[120px]">{p.fullName}</span>
                    <span className="text-[9px] font-mono text-zinc-500 dark:text-zinc-400">({p.seatCode})</span>
                  </div>
                ))}
                {currentStopDemand.passengers.length > 5 && (
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono px-2">
                    +{currentStopDemand.passengers.length - 5} more
                  </span>
                )}
              </div>

              {/* Tactical Action Buttons (Glove-Friendly) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleConfirmStopAction}
                  className={`h-12 rounded-xl text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                    isIncomingShift ? "bg-emerald-600 hover:bg-emerald-500 active:scale-95" : "bg-amber-600 hover:bg-amber-500 active:scale-95"
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{isIncomingShift ? "✓ ALL PASSENGERS BOARDED" : "✓ PASSENGERS SAFELY ALIGHTED"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRosterStop(currentStopDemand)}
                  className="h-12 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-zinc-300 dark:border-zinc-700 transition-all cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Inspect Passenger Manifest</span>
                </button>
              </div>
            </div>
          )
        )}

        {/* Regular Turn-By-Turn HUD Card (When no active stop halt alert) */}
        {(!currentTargetStop || !currentStopDemand || currentStopDemand.total === 0 || dismissedStopHaltId === currentTargetStop.id) && (
          <div className="pointer-events-auto bg-white/95 dark:bg-black/95 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-lg">
                  <Navigation className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <span>Corridor Target</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-semibold font-mono">
                      Stop {currentStopIndex + 1} of {totalStopsCount}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight mt-0.5">
                    {currentTargetStop?.name || "Transit Stop"}
                  </h2>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                    <span>Bus {bus?.busNumber}</span>
                    <span>•</span>
                    <span>{route?.name || "Transit Line"}</span>
                    {currentCoords.speedKmh > 0 && (
                      <>
                        <span>•</span>
                        <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{currentCoords.speedKmh} km/h</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white font-mono">
                  ~{etaToCurrentTargetMins} <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 font-sans">min</span>
                </div>
                <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
                  {distanceToCurrentTargetMeters < 1000
                    ? `${distanceToCurrentTargetMeters} m`
                    : `${(distanceToCurrentTargetMeters / 1000).toFixed(1)} km`}
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleAdvanceNextStop}
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <ChevronRight className="w-4 h-4" />
                <span>Next Stop</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDrawerExpanded((prev) => !prev)}
                className="py-2.5 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 active:scale-95 text-zinc-800 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-zinc-300 dark:border-zinc-700 transition-all cursor-pointer"
              >
                <Users className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <span>Manifest Timeline</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── 3. FULLSCREEN MAP CANVAS ────────────────────────────────────────── */}
      <div className="relative w-full flex-1 h-full min-h-[400px]">
        <CampusFleetMap
          busLocation={{
            busId: bus?.id || 45,
            busNumber: bus?.busNumber || "45",
            latitude: currentCoords.latitude,
            longitude: currentCoords.longitude,
            speedKmh: currentCoords.speedKmh,
            headingDeg: currentCoords.headingDeg,
            lastPingAt: new Date().toISOString(),
            tripId: activeTrip?.id || "",
            delayMinutes: 0,
            estimatedArrivalNextStopMins: etaToCurrentTargetMins,
          }}
          busName={`Bus ${bus?.busNumber || "45"}`}
          tripStatus="IN_PROGRESS"
          stops={routeStops.map((rs) => rs.stop)}
          activeStopIndex={currentStopIndex}
          selectedStopId={currentTargetStop?.id}
          tileTheme={mapTheme}
          height="100%"
          zoom={15}
          showUserLocation={false}
          showCampusLandmark={true}
          onStopClick={(clickedStop) => {
            const found = stopPassengerRosterMap.get(clickedStop.id);
            if (found) setSelectedRosterStop(found);
          }}
        />

        {/* Floating Right Tactical Rail */}
        <div className="absolute right-3 sm:right-6 top-64 z-20 flex flex-col gap-2.5">
          {/* Re-center Bus */}
          <button
            type="button"
            onClick={() => {
              playChime(659.25, 0.15);
              setToastMessage("Locked on Bus GPS");
              setTimeout(() => setToastMessage(null), 2000);
            }}
            className="w-11 h-11 rounded-2xl bg-black/90 hover:bg-zinc-900 text-white border border-zinc-800 flex items-center justify-center shadow-xl transition-all active:scale-95 cursor-pointer"
            title="Lock Camera on Bus"
          >
            <Crosshair className="w-5 h-5 text-blue-400" />
          </button>

          {/* Simulate Step Forward */}
          <button
            type="button"
            onClick={handleAdvanceNextStop}
            className="w-11 h-11 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black flex items-center justify-center border border-amber-300 shadow-xl transition-all active:scale-95 cursor-pointer"
            title="Step Forward (Simulation/Indoor)"
          >
            <FastForward className="w-5 h-5" />
          </button>

          {/* Emergency SOS Button */}
          <button
            type="button"
            onClick={() => setShowSosModal(true)}
            className="w-11 h-11 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center border border-rose-400 shadow-xl transition-all active:scale-95 cursor-pointer"
            title="Emergency SOS / Dispatch"
          >
            <AlertTriangle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── 4. BOTTOM JOURNEY DRAWER (STOPS & PASSENGER DEMAND TIMELINE) ────── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 transition-all duration-300 ease-in-out ${
          isDrawerExpanded ? "max-h-[75vh]" : "max-h-[140px]"
        } bg-black/95 border-t border-zinc-800 shadow-2xl flex flex-col rounded-t-3xl text-white`}
      >
        {/* Drag Handle Strip */}
        <div
          onClick={() => setIsDrawerExpanded((prev) => !prev)}
          className="p-3 pb-2 border-b border-zinc-800 cursor-pointer hover:bg-zinc-900/50 transition-colors flex flex-col items-center select-none"
        >
          <div className="w-12 h-1.5 rounded-full bg-zinc-700 mb-2" />
          <div className="w-full flex items-center justify-between px-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-sm">Corridor Manifest</span>
              <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[10px] font-bold border border-zinc-700">
                {routeStops.length} Stops
              </span>
            </div>
            <div className="flex items-center gap-1 text-zinc-400 text-xs font-semibold">
              <span>{isDrawerExpanded ? "Collapse Timeline" : "View Passenger Breakdown"}</span>
              {isDrawerExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Scrollable Corridor Stops with Demand Breakdown */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {routeStops.map((rs, idx) => {
            const stop = rs.stop;
            const isPast = idx < currentStopIndex;
            const isCurrent = idx === currentStopIndex;
            const demand = stopPassengerRosterMap.get(stop.id);
            const passengerCount = demand?.total || 0;

            return (
              <div
                key={stop.id}
                onClick={() => {
                  if (demand) setSelectedRosterStop(demand);
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isCurrent
                    ? "bg-blue-950/40 border-blue-500 shadow-md text-white"
                    : isPast
                    ? "bg-zinc-900/40 border-zinc-800 opacity-60 text-zinc-400"
                    : "bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                      isPast
                        ? "bg-zinc-800 text-zinc-500"
                        : isCurrent
                        ? "bg-blue-600 text-white ring-2 ring-blue-400"
                        : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {isPast ? "✓" : idx + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{stop.name}</span>
                      {isCurrent && (
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-600 text-white font-bold">
                          NEXT STOP
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                      <span>{isIncomingShift ? "Pickup" : "Drop-off"} point</span>
                      {demand && demand.studentsCount > 0 && (
                        <span className="text-blue-300">• 🎓 {demand.studentsCount} Students</span>
                      )}
                      {demand && demand.teachersCount > 0 && (
                        <span className="text-amber-300">• 👨‍🏫 {demand.teachersCount} Faculty</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-bold text-white">
                    {passengerCount} Commuter{passengerCount !== 1 ? "s" : ""}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    {isPast ? "Completed" : isCurrent ? "Approaching" : "Upcoming"}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Route Completion Button */}
          <div className="pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={handleCompleteRoute}
              className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-700 transition-all active:scale-95"
            >
              Finish Trip Run & Close Manifest
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. PASSENGER MANIFEST ROSTER MODAL ──────────────────────────────── */}
      {selectedRosterStop && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[85vh] text-white">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 border border-blue-500/40">
                    STOP MANIFEST
                  </span>
                  <span className="text-xs font-bold text-zinc-400">
                    {isIncomingShift ? "Boarding at Stop" : "Alighting at Stop"}
                  </span>
                </div>
                <h3 className="text-lg font-black text-white mt-1">{selectedRosterStop.stopName}</h3>
                <p className="text-xs text-zinc-400">
                  Total {selectedRosterStop.total} passengers (🎓 {selectedRosterStop.studentsCount} Students • 👨‍🏫 {selectedRosterStop.teachersCount} Faculty)
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRosterStop(null)}
                className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Commuter Search Filter */}
            <div className="pt-3 pb-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                <input
                  type="text"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Filter by name or seat code..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Commuter List */}
            <div className="flex-1 overflow-y-auto py-2 space-y-2">
              {selectedRosterStop.passengers
                .filter((p) => {
                  if (!rosterSearch) return true;
                  const q = rosterSearch.toLowerCase();
                  return p.fullName.toLowerCase().includes(q) || p.seatCode.toLowerCase().includes(q);
                })
                .map((passenger) => (
                  <div
                    key={passenger.id}
                    className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                          passenger.role === "faculty"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        }`}
                      >
                        {passenger.role === "faculty" ? "FAC" : "STU"}
                      </div>
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{passenger.fullName}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                            Seat {passenger.seatCode}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {passenger.role === "faculty" ? "Faculty Member" : "Registered Student"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {passenger.phone && (
                        <a
                          href={`tel:${passenger.phone}`}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 transition-all active:scale-95 shadow-sm"
                          title={`Call ${passenger.fullName}`}
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>
                      )}

                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-1 rounded-lg ${
                          passenger.isBoarded
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        }`}
                      >
                        {passenger.isBoarded ? "✓ Boarded" : "Waiting"}
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setSelectedRosterStop(null);
                  handleConfirmStopAction();
                }}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition-all active:scale-95 shadow-lg"
              >
                Confirm All Manifest Check-Ins
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. EMERGENCY SOS MODAL ─────────────────────────────────────────── */}
      {showSosModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-zinc-950 border border-rose-600/60 rounded-3xl p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Emergency Dispatch Assistance</h3>
                <p className="text-xs text-zinc-400">Campus Fleet Security & Transit Control</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Trigger an emergency beacon with live GPS coordinates of Bus {bus?.busNumber} to the Institutional Transit Ops Center and Campus Security.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <a
                href="tel:1800-CAMPUS-FLEET"
                className="py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-2 border border-zinc-700"
              >
                <PhoneCall className="w-4 h-4 text-emerald-400" />
                <span>Call Control Desk</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setSosSent(true);
                  playChime(784, 0.5);
                  setToastMessage("🚨 SOS Signal Broadcast to Campus Ops");
                  setTimeout(() => {
                    setShowSosModal(false);
                    setSosSent(false);
                  }, 2000);
                }}
                className="py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{sosSent ? "Transmitting..." : "Broadcast SOS"}</span>
              </button>
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setShowSosModal(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline font-medium"
              >
                Cancel / Return to Live Radar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
