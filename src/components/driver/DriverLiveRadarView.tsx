"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Navigation,
  MapPin,
  Compass,
  Gauge,
  Play,
  Square,
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
  ShieldAlert,
  ArrowLeft,
  ArrowUp,
  CornerUpRight,
  CornerUpLeft,
  Radio,
  Check,
  X,
  PhoneCall,
  Flame,
  Building2,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useTheme } from "@/components/common/ThemeProvider";
import CampusFleetMap from "@/components/maps/CampusFleetMap";
import { telematicsService } from "@/lib/telematicsService";
import { store } from "@/lib/store";
import { calculateDistanceKm, calculateExactDistanceMeters, formatTime } from "@/lib/utils";
import type { Trip, Bus as BusType, Route, Booking, Stop, LiveBusLocation } from "@/lib/types";

export type DriverNavigationStage =
  | "HEADING_TO_START"   // Deadhead: Navigating from bus/driver GPS to Route Origin (Stop 0)
  | "AT_STARTING_POINT"  // Within 150m of Stop 0 or arrived: Boarding & departure check
  | "IN_TRANSIT"         // Active trip: Stop-by-stop corridor guidance to University Campus
  | "ARRIVING_CAMPUS"    // Approaching Institutional Campus Terminal (Final Stop)
  | "COMPLETED";         // Trip completed & parked at depot

interface DriverLiveRadarViewProps {
  initialUser?: any;
  initialDriverStaffId?: string | null;
  activeTrip: Trip | null;
  route: Route | null;
  bus: BusType | null;
  allTrips: Trip[];
  allBuses: BusType[];
  allRoutes: Route[];
  allStops: Stop[];
  bookings?: Booking[];
  onTripUpdate?: (tripId: string, updates: Partial<Trip>) => Promise<void> | void;
  onSwitchBus?: (newBusId: number) => Promise<void> | void;
  onSwitchTrip?: (tripId: string) => void;
  externalCoords?: {
    latitude: number;
    longitude: number;
    speedKmh: number;
    headingDeg: number;
    accuracy?: number;
  };
  hasRealGpsLock?: boolean;
  onClose?: () => void;
}

export default function DriverLiveRadarView({
  initialUser,
  initialDriverStaffId,
  activeTrip: propActiveTrip,
  route: propRoute,
  bus: propBus,
  allTrips,
  allBuses,
  allRoutes,
  allStops,
  bookings = [],
  onTripUpdate,
  onSwitchBus,
  onSwitchTrip,
  externalCoords,
  hasRealGpsLock: propHasRealGpsLock = false,
  onClose,
}: DriverLiveRadarViewProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // ── 1. ACTIVE TRIP, ROUTE & BUS RESOLUTION ────────────────────────────────
  const [activeTrip, setActiveTrip] = useState<Trip | null>(propActiveTrip);
  const [selectedBusId, setSelectedBusId] = useState<number>(propBus?.id || 2);
  const [showBusSwitchModal, setShowBusSwitchModal] = useState(false);
  const [busSearchQuery, setBusSearchQuery] = useState("");
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync prop changes
  useEffect(() => {
    setActiveTrip(propActiveTrip);
  }, [propActiveTrip]);

  useEffect(() => {
    if (propBus?.id) setSelectedBusId(propBus.id);
  }, [propBus]);

  const bus = useMemo(() => {
    return allBuses.find((b) => b.id === selectedBusId) || propBus || allBuses[0] || null;
  }, [allBuses, selectedBusId, propBus]);

  const route = useMemo(() => {
    if (activeTrip?.routeId) {
      const match = allRoutes.find((r) => r.id === activeTrip.routeId);
      if (match) return match;
    }
    return propRoute || allRoutes[0] || null;
  }, [allRoutes, activeTrip, propRoute]);

  const effectiveDriverId =
    initialUser?.userId || initialDriverStaffId || initialUser?.id || "driver-primary";

  // ── 2. STOPS & CORRIDOR DEFINITION ────────────────────────────────────────
  const routeStops = useMemo(() => {
    if (route?.stops && route.stops.length > 0) {
      return route.stops;
    }
    return [];
  }, [route]);

  const totalStopsCount = routeStops.length;
  const originStop = routeStops[0]?.stop || null;
  const terminalStop = totalStopsCount > 0 ? routeStops[totalStopsCount - 1]?.stop : null;

  const currentStopIndex = activeTrip?.currentStopIndex || 0;
  const currentTargetStop = routeStops[currentStopIndex]?.stop || originStop;
  const nextTargetStop =
    currentStopIndex + 1 < totalStopsCount
      ? routeStops[currentStopIndex + 1]?.stop
      : terminalStop;

  // ── 3. HARDWARE GPS & TELEMETRY SENSORS ────────────────────────────────────
  const [currentCoords, setCurrentCoords] = useState<{
    latitude: number;
    longitude: number;
    speedKmh: number;
    headingDeg: number;
    accuracy?: number;
  }>(() => {
    if (externalCoords) return externalCoords;
    if (originStop) {
      return {
        latitude: originStop.latitude,
        longitude: originStop.longitude,
        speedKmh: 0,
        headingDeg: 45,
        accuracy: 10,
      };
    }
    return {
      latitude: 29.3750,
      longitude: 79.5295,
      speedKmh: 0,
      headingDeg: 0,
      accuracy: 15,
    };
  });

  const [hasRealGpsLock, setHasRealGpsLock] = useState(propHasRealGpsLock);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(
    externalCoords?.accuracy || null
  );
  const [gpsStatusText, setGpsStatusText] = useState(
    propHasRealGpsLock ? "GPS Locked" : "GPS Ready"
  );
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [mapTheme, setMapTheme] = useState<"CARTO_DARK" | "GOOGLE_STREETS" | "GOOGLE_HYBRID">("CARTO_DARK");
  const [isFollowingBus, setIsFollowingBus] = useState(true);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [isHudMinimized, setIsHudMinimized] = useState(false);
  const [isSimulationMode, setIsSimulationMode] = useState(false);

  // Sync external coords if provided by parent cockpit
  useEffect(() => {
    if (externalCoords) {
      setCurrentCoords(externalCoords);
      if (externalCoords.accuracy) setGpsAccuracyMeters(externalCoords.accuracy);
      setHasRealGpsLock(true);
      setGpsStatusText(`GPS Locked (±${Math.round(externalCoords.accuracy || 8)}m)`);
    }
  }, [externalCoords]);

  // Real-time GPS Watch (runs if standalone or no external GPS provided)
  useEffect(() => {
    if (externalCoords || typeof window === "undefined" || !navigator.geolocation) return;

    const handlePos = (pos: GeolocationPosition) => {
      const { latitude, longitude, speed, heading, accuracy } = pos.coords;
      let speedKmh = 0;
      if (speed != null && !isNaN(speed) && speed >= 0) {
        speedKmh = Math.round(speed * 3.6);
      }
      const acc = Math.round(accuracy);
      const headingDeg = heading != null && !isNaN(heading) ? Math.round(heading) : currentCoords.headingDeg;

      setCurrentCoords({
        latitude,
        longitude,
        speedKmh,
        headingDeg,
        accuracy: acc,
      });
      setHasRealGpsLock(true);
      setGpsAccuracyMeters(acc);
      setGpsStatusText(`Connected (±${acc}m)`);
    };

    const handleErr = (err: GeolocationPositionError) => {
      console.warn("Radar GPS watch notice:", err.message);
      setGpsStatusText("Searching GPS Signal");
    };

    const watchId = navigator.geolocation.watchPosition(handlePos, handleErr, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 8000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [externalCoords, currentCoords.headingDeg]);

  // ── 4. AUDIO & SPEECH ANNOUNCER ───────────────────────────────────────────
  const playChime = useCallback((frequency = 587.33, duration = 0.25) => {
    if (!isAudioEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
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

  // ── 5. DISTANCES & DYNAMIC STAGE ENGINE ────────────────────────────────────
  // Distance from current position to Route Origin (Stop 0)
  const distanceToOriginMeters = useMemo(() => {
    if (!originStop) return 0;
    const km = calculateDistanceKm(
      currentCoords.latitude,
      currentCoords.longitude,
      originStop.latitude,
      originStop.longitude
    );
    return Math.round(km * 1000);
  }, [currentCoords, originStop]);

  // Distance from current position to Active Corridor Stop
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

  // Determine Navigation Stage (Rapido / Uber Driver State Machine)
  const navigationStage: DriverNavigationStage = useMemo(() => {
    const tripStatus = activeTrip?.status;

    if (tripStatus === "COMPLETED") {
      return "COMPLETED";
    }

    if (tripStatus === "IN_PROGRESS") {
      // Check if approaching final campus terminal
      if (currentStopIndex >= totalStopsCount - 1) {
        return "ARRIVING_CAMPUS";
      }
      return "IN_TRANSIT";
    }

    // Trip is SCHEDULED or CREATED:
    // If bus is within 150m of origin stop, consider it AT_STARTING_POINT
    if (distanceToOriginMeters <= 150) {
      return "AT_STARTING_POINT";
    }

    // Bus is > 150m away: Needs deadhead navigation to origin
    return "HEADING_TO_START";
  }, [activeTrip?.status, currentStopIndex, totalStopsCount, distanceToOriginMeters]);

  // ── 6. TELEMATICS BROADCAST PIPELINE ──────────────────────────────────────
  const broadcastCurrentLocation = useCallback((coordsToBroadcast = currentCoords, immediate = false) => {
    if (!bus?.id) return;

    const payload: LiveBusLocation = {
      busId: bus.id,
      busNumber: bus.busNumber,
      driverId: effectiveDriverId,
      driverName: initialUser?.name || "Driver",
      accuracy: coordsToBroadcast.accuracy,
      tripId: activeTrip?.id || "",
      latitude: coordsToBroadcast.latitude,
      longitude: coordsToBroadcast.longitude,
      speedKmh: coordsToBroadcast.speedKmh ?? 0,
      headingDeg: coordsToBroadcast.headingDeg ?? 0,
      currentStopId: currentTargetStop?.id,
      nextStopId: nextTargetStop?.id,
      estimatedArrivalNextStopMins: Math.max(1, Math.round(distanceToCurrentTargetMeters / 600)),
      delayMinutes: 0,
      lastPingAt: new Date().toISOString(),
      source: hasRealGpsLock ? "driver_gps" : "driver_console",
    };

    store.updateLiveLocation(payload);
    if (immediate) {
      telematicsService.pushLiveLocationNow(payload).catch(() => {});
    } else {
      telematicsService.broadcastLiveLocation(payload).catch(() => {});
    }
  }, [
    bus,
    effectiveDriverId,
    initialUser?.name,
    activeTrip?.id,
    currentTargetStop?.id,
    nextTargetStop?.id,
    distanceToCurrentTargetMeters,
    hasRealGpsLock,
    currentCoords,
  ]);

  // ── 7. STAGE ACTIONS: DEADHEAD, DEPART, ADVANCE & FINISH ───────────────────
  // A. Mark Arrived at Starting Point
  const handleArrivedAtOrigin = useCallback(() => {
    if (!originStop) return;
    const updated = {
      latitude: originStop.latitude,
      longitude: originStop.longitude,
      speedKmh: 0,
      headingDeg: 90,
      accuracy: 5,
    };
    setCurrentCoords(updated);
    broadcastCurrentLocation(updated, true);
    playChime(659.25, 0.3);
    speakGuidance(`Arrived at route origin, ${originStop.name}. Prepare for boarding.`);
    setToastMessage(`✓ Arrived at Origin: ${originStop.name}`);
    setTimeout(() => setToastMessage(null), 3000);
  }, [originStop, broadcastCurrentLocation, playChime, speakGuidance]);

  // B. Start Active Transit Run
  const handleStartRoute = async () => {
    if (!activeTrip) return;
    const startedAt = new Date().toISOString();

    const updates: Partial<Trip> = {
      status: "IN_PROGRESS",
      startedAt,
      currentStopIndex: 0,
    };

    setActiveTrip((prev) => (prev ? { ...prev, ...updates } : prev));
    await store.updateTrip(activeTrip.id, updates);
    if (onTripUpdate) await onTripUpdate(activeTrip.id, updates);

    // Initial bus coordinates snapped to starting stop
    const startCoords = originStop
      ? {
          latitude: originStop.latitude,
          longitude: originStop.longitude,
          speedKmh: 18,
          headingDeg: 45,
          accuracy: 5,
        }
      : currentCoords;

    setCurrentCoords(startCoords);
    broadcastCurrentLocation(startCoords, true);

    playChime(523.25, 0.35);
    speakGuidance(`Route started for Bus ${bus?.busNumber || ""}. Departing ${originStop?.name || "origin"}.`);
    setToastMessage(`🚀 Route Started! Broadcasting Bus ${bus?.busNumber} live GPS.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // C. Advance to Next Corridor Stop
  const handleAdvanceNextStop = async () => {
    if (!activeTrip || !routeStops || routeStops.length === 0) return;
    const nextIdx = currentStopIndex + 1;

    if (nextIdx < totalStopsCount) {
      const targetStopObj = routeStops[nextIdx].stop;
      const updates: Partial<Trip> = { currentStopIndex: nextIdx };

      setActiveTrip((prev) => (prev ? { ...prev, ...updates } : prev));
      await store.updateTrip(activeTrip.id, updates);
      if (onTripUpdate) await onTripUpdate(activeTrip.id, updates);

      // Snap coordinates to target stop
      const targetCoords = {
        latitude: targetStopObj.latitude,
        longitude: targetStopObj.longitude,
        speedKmh: 24,
        headingDeg: (currentCoords.headingDeg + 15) % 360,
        accuracy: 6,
      };

      setCurrentCoords(targetCoords);
      broadcastCurrentLocation(targetCoords, true);

      playChime(587.33, 0.25);
      speakGuidance(`Next stop: ${targetStopObj.name}.`);
      setToastMessage(`✓ Arrived! Now heading to: ${targetStopObj.name}`);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // D. Complete Route & Park at Campus Depot
  const handleCompleteRoute = async () => {
    if (!activeTrip) return;
    if (confirm("Confirm route completion and parking at University Campus Terminal?")) {
      const completedAt = new Date().toISOString();
      const updates: Partial<Trip> = { status: "COMPLETED", completedAt };

      setActiveTrip((prev) => (prev ? { ...prev, ...updates } : prev));
      await store.updateTrip(activeTrip.id, updates);
      if (onTripUpdate) await onTripUpdate(activeTrip.id, updates);

      playChime(440.0, 0.4);
      speakGuidance("Trip completed. Arrived at University Campus Terminal. Well done!");
      setToastMessage("🏁 Route completed. Parked at Campus Depot.");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // E. Simulation Step (Indoor / Demo Stepper)
  const handleSimulateStep = () => {
    if (navigationStage === "HEADING_TO_START" && originStop) {
      // Step halfway to origin
      const dLat = originStop.latitude - currentCoords.latitude;
      const dLng = originStop.longitude - currentCoords.longitude;
      const dist = Math.hypot(dLat, dLng);

      if (dist < 0.002) {
        // We've arrived!
        handleArrivedAtOrigin();
      } else {
        const stepCoords = {
          latitude: currentCoords.latitude + dLat * 0.45,
          longitude: currentCoords.longitude + dLng * 0.45,
          speedKmh: 35,
          headingDeg: Math.round((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360,
          accuracy: 5,
        };
        setCurrentCoords(stepCoords);
        broadcastCurrentLocation(stepCoords, true);
        playChime(659.25, 0.15);
        setToastMessage(`Simulated step toward origin: ${originStop.name}`);
        setTimeout(() => setToastMessage(null), 2000);
      }
    } else if (navigationStage === "AT_STARTING_POINT") {
      handleStartRoute();
    } else if (navigationStage === "IN_TRANSIT" || navigationStage === "ARRIVING_CAMPUS") {
      if (currentStopIndex + 1 < totalStopsCount) {
        handleAdvanceNextStop();
      } else {
        handleCompleteRoute();
      }
    }
  };

  // ── 8. PASSENGER DEMAND FOR NEXT STOP ─────────────────────────────────────
  const targetStopPassengers = useMemo(() => {
    if (!currentTargetStop || !bookings) return 0;
    return bookings.filter(
      (b) => b.boardingStopId === currentTargetStop.id && b.status !== "CANCELLED"
    ).length;
  }, [currentTargetStop, bookings]);

  const totalTripBookings = useMemo(() => {
    if (!activeTrip?.id || !bookings) return 0;
    return bookings.filter((b) => b.tripId === activeTrip.id && b.status !== "CANCELLED").length;
  }, [activeTrip?.id, bookings]);

  // ── 9. ROUTE WAYPOINTS FOR MAP CANVAS ─────────────────────────────────────
  const mapRouteCoordinates: [number, number][] = useMemo(() => {
    if (navigationStage === "HEADING_TO_START" && originStop) {
      // Draw path from current driver location to origin stop
      return [
        [currentCoords.latitude, currentCoords.longitude],
        [originStop.latitude, originStop.longitude],
      ];
    }
    // Standard corridor from route stops
    if (routeStops.length >= 2) {
      return routeStops.map((rs) => [rs.stop.latitude, rs.stop.longitude]);
    }
    return [];
  }, [navigationStage, originStop, currentCoords, routeStops]);

  // Stops list passed to map
  const mapStops: Stop[] = useMemo(() => {
    return routeStops.map((rs) => rs.stop);
  }, [routeStops]);

  // Live Bus Location payload for map puck
  const mapBusLocation: LiveBusLocation = useMemo(() => {
    return {
      busId: bus?.id || 2,
      busNumber: bus?.busNumber || "Duty",
      driverId: effectiveDriverId,
      driverName: initialUser?.name || "Driver",
      accuracy: currentCoords.accuracy,
      tripId: activeTrip?.id || "",
      latitude: currentCoords.latitude,
      longitude: currentCoords.longitude,
      speedKmh: currentCoords.speedKmh,
      headingDeg: currentCoords.headingDeg,
      currentStopId: currentTargetStop?.id,
      nextStopId: nextTargetStop?.id,
      estimatedArrivalNextStopMins: Math.max(1, Math.round(distanceToCurrentTargetMeters / 600)),
      delayMinutes: 0,
      lastPingAt: new Date().toISOString(),
      source: hasRealGpsLock ? "driver_gps" : "driver_console",
    };
  }, [
    bus,
    effectiveDriverId,
    initialUser?.name,
    currentCoords,
    activeTrip?.id,
    currentTargetStop?.id,
    nextTargetStop?.id,
    distanceToCurrentTargetMeters,
    hasRealGpsLock,
  ]);

  // Turn Maneuver Direction Symbol
  const maneuverIcon = useMemo(() => {
    if (navigationStage === "HEADING_TO_START") {
      return <Navigation className="w-8 h-8 text-amber-500 fill-amber-500/20" />;
    }
    if (navigationStage === "AT_STARTING_POINT") {
      return <MapPin className="w-8 h-8 text-emerald-500 fill-emerald-500/20" />;
    }
    if (navigationStage === "ARRIVING_CAMPUS" || navigationStage === "COMPLETED") {
      return <Building2 className="w-8 h-8 text-blue-500" />;
    }
    // Alternate direction icons for corridor turns
    const mod = currentStopIndex % 3;
    if (mod === 1) return <CornerUpRight className="w-8 h-8 text-blue-500" />;
    if (mod === 2) return <CornerUpLeft className="w-8 h-8 text-blue-500" />;
    return <ArrowUp className="w-8 h-8 text-blue-500" />;
  }, [navigationStage, currentStopIndex]);

  // External Navigation Deep Link (Google Maps Turn-by-Turn)
  const externalNavUrl = useMemo(() => {
    const target =
      navigationStage === "HEADING_TO_START"
        ? originStop
        : currentTargetStop || terminalStop;
    if (!target) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}&travelmode=driving`;
  }, [navigationStage, originStop, currentTargetStop, terminalStop]);

  // Speed evaluation
  const speed = currentCoords.speedKmh;
  const isOverspeed = speed > 40;

  return (
    <div className="relative w-full h-[calc(100vh-68px)] min-h-[550px] bg-black text-white select-none overflow-hidden font-sans">
      {/* ── 1. FULLSCREEN INTERACTIVE RADAR CANVAS ───────────────────────── */}
      <div className="absolute inset-0 z-0">
        <CampusFleetMap
          busLocation={mapBusLocation}
          busName={`Bus ${bus?.busNumber || "Fleet"}`}
          tripStatus={activeTrip?.status || "IN_PROGRESS"}
          stops={mapStops}
          routeCoordinates={mapRouteCoordinates}
          activeStopIndex={currentStopIndex}
          selectedStopId={currentTargetStop?.id}
          tileTheme={mapTheme}
          height="100%"
          showUserLocation={false}
          showCampusLandmark={true}
        />
      </div>

      {/* ── 2. TOAST NOTIFICATION ────────────────────────────────────────── */}
      {toastMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 bg-black/90 text-white border border-zinc-700 text-xs sm:text-sm font-black rounded-2xl shadow-2xl flex items-center gap-2.5 backdrop-blur-md animate-in fade-in slide-in-from-top-4">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── 3. TOP GLANCEABLE TURN & MANEUVER HUD (UBER/RAPIDO STYLE) ─────── */}
      <div className="absolute top-3 left-3 right-3 sm:left-6 sm:right-6 z-30 pointer-events-none flex flex-col gap-2">
        {onClose && (
          <div className="pointer-events-auto flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-2xl bg-white/95 dark:bg-black/95 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-xl backdrop-blur-md flex items-center gap-2 text-xs font-black transition-all hover:border-zinc-400 dark:hover:border-zinc-600 active:scale-95 cursor-pointer"
              title="Close Map and Return to Cockpit Dashboard"
            >
              <ArrowLeft className="w-4 h-4 text-blue-500" />
              <span>Cockpit Dashboard</span>
            </button>
          </div>
        )}
        {isHudMinimized ? (
          /* MINIMIZED CAPSULE HUD PILL */
          <div className="pointer-events-auto flex items-center justify-start">
            <button
              type="button"
              onClick={() => setIsHudMinimized(false)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-black/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 shadow-xl text-zinc-900 dark:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-all cursor-pointer group active:scale-95"
              title="Tap to expand navigation directions"
            >
              <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
                {maneuverIcon}
              </div>
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    {navigationStage === "HEADING_TO_START" ? "ORIGIN" : "NEXT STOP"}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {navigationStage === "HEADING_TO_START"
                      ? distanceToOriginMeters >= 1000
                        ? `${(distanceToOriginMeters / 1000).toFixed(1)} km`
                        : `${distanceToOriginMeters} m`
                      : distanceToCurrentTargetMeters >= 1000
                      ? `${(distanceToCurrentTargetMeters / 1000).toFixed(1)} km`
                      : `${distanceToCurrentTargetMeters} m`}
                  </span>
                </div>
                <span className="font-bold text-zinc-900 dark:text-white text-xs truncate max-w-[180px] sm:max-w-[280px]">
                  {navigationStage === "HEADING_TO_START"
                    ? originStop?.name || "Route Starting Point"
                    : currentTargetStop?.name || "Next Transit Stop"}
                </span>
              </div>
              <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors ml-1 shrink-0">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>
        ) : (
          /* EXPANDED TURN & MANEUVER HUD CARD */
          <div className="pointer-events-auto bg-white/95 dark:bg-black/95 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white rounded-3xl p-3 sm:p-4 shadow-2xl backdrop-blur-xl transition-all">
            <div className="flex items-center justify-between gap-3">
              {/* Left: Maneuver Direction Symbol */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 shadow-inner">
                  {maneuverIcon}
                </div>

                {/* Destination Headline & Stage Tag */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        navigationStage === "HEADING_TO_START"
                          ? "bg-amber-50 dark:bg-amber-950/80 border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300"
                          : navigationStage === "AT_STARTING_POINT"
                          ? "bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300"
                          : navigationStage === "ARRIVING_CAMPUS"
                          ? "bg-blue-50 dark:bg-blue-950/80 border-blue-300 dark:border-blue-600 text-blue-800 dark:text-blue-300"
                          : "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {navigationStage === "HEADING_TO_START"
                        ? "🧭 DEADHEAD TO ORIGIN"
                        : navigationStage === "AT_STARTING_POINT"
                        ? "📍 AT ROUTE ORIGIN"
                        : navigationStage === "ARRIVING_CAMPUS"
                        ? "🎓 CAMPUS TERMINAL"
                        : `NEXT STOP • ${currentStopIndex + 1}/${totalStopsCount}`}
                    </span>

                    {targetStopPassengers > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300">
                        <Users className="w-3 h-3" />
                        <span>{targetStopPassengers} boarding</span>
                      </span>
                    )}
                  </div>

                  <h1 className="text-base sm:text-xl font-black tracking-tight text-zinc-900 dark:text-white truncate mt-0.5">
                    {navigationStage === "HEADING_TO_START"
                      ? originStop?.name || "Route Starting Point"
                      : currentTargetStop?.name || "Next Transit Stop"}
                  </h1>

                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium truncate">
                    {navigationStage === "HEADING_TO_START"
                      ? "Head to route origin stop to begin passenger service"
                      : currentTargetStop?.landmark || `Corridor run to University Campus`}
                  </p>
                </div>
              </div>

              {/* Right: Distance Countdown, Speed Cluster & Minimize Toggle */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {/* Distance & ETA */}
                <div className="text-right">
                  <div className="text-lg sm:text-2xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                    {navigationStage === "HEADING_TO_START"
                      ? distanceToOriginMeters >= 1000
                        ? `${(distanceToOriginMeters / 1000).toFixed(1)} km`
                        : `${distanceToOriginMeters} m`
                      : distanceToCurrentTargetMeters >= 1000
                      ? `${(distanceToCurrentTargetMeters / 1000).toFixed(1)} km`
                      : `${distanceToCurrentTargetMeters} m`}
                  </div>
                  <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    ETA ~{Math.max(1, Math.round((navigationStage === "HEADING_TO_START" ? distanceToOriginMeters : distanceToCurrentTargetMeters) / 600))} min
                  </div>
                </div>

                {/* Speed Cluster with Limit Circle */}
                <div className="hidden sm:flex flex-col items-center pl-3 border-l border-zinc-200 dark:border-zinc-800">
                  <div
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-black transition-colors ${
                      isOverspeed
                        ? "border-rose-500 bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 animate-pulse"
                        : "border-zinc-400 dark:border-zinc-500 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                    }`}
                    title="Speed Limit 40 km/h"
                  >
                    40
                  </div>
                  <div className="text-[11px] font-mono font-black text-zinc-900 dark:text-white mt-0.5">
                    {speed} <span className="text-[9px] font-sans text-zinc-500 dark:text-zinc-400">km/h</span>
                  </div>
                </div>

                {/* Circular Minimize Toggle Button */}
                <button
                  type="button"
                  onClick={() => setIsHudMinimized(true)}
                  className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-xs ml-1"
                  title="Minimize directions"
                  aria-label="Minimize directions"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. RIGHT FLOATING TACTICAL CONTROLS (RAPIDO / UBER RAIL) ─────── */}
      <div className="absolute right-3 sm:right-6 top-32 z-30 flex flex-col gap-2.5">
        {/* Re-Center Camera on Bus */}
        <button
          type="button"
          onClick={() => {
            setIsFollowingBus(true);
            playChime(659.25, 0.15);
            setToastMessage("Camera locked on Bus");
            setTimeout(() => setToastMessage(null), 2000);
          }}
          className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer ${
            isFollowingBus
              ? "bg-blue-600 border-blue-400 text-white shadow-blue-600/30"
              : "bg-black/85 border-zinc-800 text-zinc-300 hover:text-white"
          }`}
          title="Re-Center on Bus"
          aria-label="Re-Center on Bus"
        >
          <Crosshair className="w-5 h-5" />
        </button>

        {/* Map Tile Theme Switcher */}
        <button
          type="button"
          onClick={() => {
            const nextTheme =
              mapTheme === "CARTO_DARK"
                ? "GOOGLE_STREETS"
                : mapTheme === "GOOGLE_STREETS"
                ? "GOOGLE_HYBRID"
                : "CARTO_DARK";
            setMapTheme(nextTheme);
            playChime(523.25, 0.15);
          }}
          className="w-11 h-11 rounded-2xl bg-black/85 border border-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
          title={`Map Style: ${mapTheme}`}
          aria-label="Cycle Map Style"
        >
          <Layers className="w-5 h-5" />
        </button>

        {/* Voice Speech Announcer Toggle */}
        <button
          type="button"
          onClick={() => {
            const next = !isAudioEnabled;
            setIsAudioEnabled(next);
            if (next) playChime(659.25, 0.2);
            setToastMessage(next ? "Voice Announcer: Active" : "Voice Announcer: Muted");
            setTimeout(() => setToastMessage(null), 2000);
          }}
          className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer ${
            isAudioEnabled
              ? "bg-emerald-600 border-emerald-400 text-white"
              : "bg-black/85 border-zinc-800 text-zinc-500"
          }`}
          title={isAudioEnabled ? "Voice announcements ON" : "Voice announcements MUTED"}
          aria-label="Toggle voice guidance"
        >
          {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        {/* Simulation / Indoor Step Forward Button */}
        <button
          type="button"
          onClick={handleSimulateStep}
          className="w-11 h-11 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black flex items-center justify-center border border-amber-300 shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
          title="Simulate Step Along Route"
          aria-label="Simulate step forward"
        >
          <FastForward className="w-5 h-5" />
        </button>

        {/* External Google Maps Navigation Deep Link */}
        {externalNavUrl && (
          <a
            href={externalNavUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-11 h-11 rounded-2xl bg-black/85 border border-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center shadow-xl backdrop-blur-md transition-all active:scale-95"
            title="Open Turn-by-Turn in Google Maps app"
            aria-label="Open in Google Maps"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        )}

        {/* Emergency SOS Button */}
        <button
          type="button"
          onClick={() => setShowSosModal(true)}
          className="w-11 h-11 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center border border-rose-400 shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
          title="Emergency Assistance"
          aria-label="Emergency SOS"
        >
          <AlertTriangle className="w-5 h-5" />
        </button>
      </div>

      {/* ── 5. BOTTOM TACTICAL DRAWER & ACTION BAR (UBER/RAPIDO SHEET) ───── */}
      <div className="absolute bottom-3 left-3 right-3 sm:left-6 sm:right-6 z-30">
        <div className="bg-black/95 border border-zinc-800 text-white rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden transition-all">
          {/* Drawer Handle Strip */}
          <div
            onClick={() => setIsDrawerExpanded((prev) => !prev)}
            className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-900/50 transition-colors"
          >
            <div className="w-12 h-1.5 rounded-full bg-zinc-700" />
            <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-400 uppercase mt-1">
              <span>Bus {bus?.busNumber}</span>
              <span>•</span>
              <span>{route?.name || "Corridor"}</span>
              <span>•</span>
              <span className="text-emerald-400">{gpsStatusText}</span>
              {isDrawerExpanded ? <ChevronDown className="w-3.5 h-3.5 ml-1" /> : <ChevronUp className="w-3.5 h-3.5 ml-1" />}
            </div>
          </div>

          {/* Expanded Drawer Details (Stops sequence & Fleet telemetry) */}
          {isDrawerExpanded && (
            <div className="px-4 py-3 border-t border-zinc-800 space-y-3 max-h-60 overflow-y-auto">
              {/* Quick Trip & Vehicle Metadata Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Duty Bus</div>
                  <div className="font-black text-white mt-0.5">Bus {bus?.busNumber}</div>
                  <div className="text-[9px] text-zinc-500">{bus?.registrationNo || "UK-04-TRANSIT"}</div>
                </div>

                <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Passengers</div>
                  <div className="font-black text-emerald-400 mt-0.5">{totalTripBookings} Booked</div>
                  <div className="text-[9px] text-zinc-500">{bus?.capacity || 40} Seats Total</div>
                </div>

                <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Terminal</div>
                  <div className="font-black text-white mt-0.5 truncate">{terminalStop?.name || "Campus"}</div>
                  <div className="text-[9px] text-blue-400 font-bold">Graphic Era Hill Univ</div>
                </div>

                <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setShowBusSwitchModal(true)}
                    className="w-full py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 text-blue-400" />
                    <span>Change Bus</span>
                  </button>
                </div>
              </div>

              {/* Stop Stations Timeline */}
              <div className="space-y-1 pt-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Route Corridor Stations ({totalStopsCount} stops)
                </div>
                <div className="divide-y divide-zinc-800/80">
                  {routeStops.map((rs, idx) => {
                    const isCompleted = idx < currentStopIndex;
                    const isCurrent = idx === currentStopIndex;
                    const isLast = idx === totalStopsCount - 1;

                    return (
                      <div
                        key={rs.stop.id}
                        className={`py-2 px-2.5 rounded-xl flex items-center justify-between gap-3 text-xs ${
                          isCurrent
                            ? "bg-blue-950/60 border border-blue-800 text-white font-bold"
                            : isCompleted
                            ? "text-zinc-500 line-through"
                            : "text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                              isCurrent
                                ? "bg-blue-600 text-white"
                                : isCompleted
                                ? "bg-zinc-800 text-zinc-500"
                                : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            {isCompleted ? "✓" : idx + 1}
                          </span>
                          <span className="truncate">{rs.stop.name}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono">
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-black uppercase">
                              Active
                            </span>
                          )}
                          {isLast && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-blue-400 text-[9px] font-bold">
                              Terminal
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Primary Tactical Action Buttons (Glove-Friendly $\ge$60px height) */}
          <div className="p-3 sm:p-4">
            {navigationStage === "HEADING_TO_START" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Navigate to Origin */}
                <button
                  type="button"
                  onClick={handleArrivedAtOrigin}
                  className="h-14 sm:h-16 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-black font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5 text-black" />
                  <span>I HAVE ARRIVED AT START POINT</span>
                </button>

                {/* 2. Direct Depart / Start Run */}
                <button
                  type="button"
                  onClick={handleStartRoute}
                  className="h-14 sm:h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>START ROUTE NOW (BROADCAST GPS)</span>
                </button>
              </div>
            ) : navigationStage === "AT_STARTING_POINT" ? (
              <button
                type="button"
                onClick={handleStartRoute}
                className="w-full h-14 sm:h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-base sm:text-lg flex items-center justify-center gap-3 shadow-xl transition-all cursor-pointer"
              >
                <Play className="w-6 h-6 fill-current" />
                <span>START ROUTE & DEPART ORIGIN</span>
              </button>
            ) : navigationStage === "IN_TRANSIT" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Arrived at current stop & advance */}
                <button
                  type="button"
                  onClick={handleAdvanceNextStop}
                  className="h-14 sm:h-16 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    ARRIVED • NEXT: {nextTargetStop?.name || `STOP ${currentStopIndex + 2}`}
                  </span>
                </button>

                {/* Complete early if at terminal */}
                <button
                  type="button"
                  onClick={handleCompleteRoute}
                  className="h-14 sm:h-16 rounded-2xl bg-zinc-800 hover:bg-zinc-700 active:scale-98 text-rose-400 font-black text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer border border-zinc-700"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>FINISH ROUTE</span>
                </button>
              </div>
            ) : navigationStage === "ARRIVING_CAMPUS" ? (
              <button
                type="button"
                onClick={handleCompleteRoute}
                className="w-full h-14 sm:h-16 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-black text-base sm:text-lg flex items-center justify-center gap-3 shadow-xl transition-all cursor-pointer"
              >
                <Building2 className="w-6 h-6" />
                <span>ARRIVED AT UNIVERSITY CAMPUS TERMINAL (PARK)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (activeTrip?.id) {
                    store.updateTrip(activeTrip.id, { status: "SCHEDULED", currentStopIndex: 0 });
                    setActiveTrip((prev) => (prev ? { ...prev, status: "SCHEDULED", currentStopIndex: 0 } : prev));
                    setToastMessage("Route reset to SCHEDULED standby");
                  }
                }}
                className="w-full h-14 sm:h-16 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black text-base flex items-center justify-center gap-2.5 border border-zinc-700 cursor-pointer"
              >
                <RotateCcw className="w-5 h-5" />
                <span>RESET / PREPARE NEXT SHIFT</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 6. EMERGENCY SOS MODAL ───────────────────────────────────────── */}
      {showSosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-500 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Emergency Assistance</h3>
                <p className="text-xs text-zinc-400">Institutional Transit Command Center</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Vehicle:</span>
                <span className="font-bold text-white">Bus {bus?.busNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Driver:</span>
                <span className="font-bold text-white">{initialUser?.name || "Driver"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">GPS Location:</span>
                <span className="font-mono text-emerald-400">
                  {currentCoords.latitude.toFixed(5)}, {currentCoords.longitude.toFixed(5)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <a
                href="tel:112"
                className="w-full h-12 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Call Emergency Services (112)</span>
              </a>

              <a
                href="tel:+918000000000"
                className="w-full h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm flex items-center justify-center gap-2 border border-zinc-700"
              >
                <Building2 className="w-4 h-4 text-blue-400" />
                <span>Call Campus Security Dispatch</span>
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowSosModal(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── 7. BUS SWITCH MODAL ──────────────────────────────────────────── */}
      {showBusSwitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white">Select Duty Bus</h3>
              <button
                type="button"
                onClick={() => setShowBusSwitchModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Search bus number or registration..."
              value={busSearchQuery}
              onChange={(e) => setBusSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />

            <div className="max-h-60 overflow-y-auto space-y-2">
              {allBuses
                .filter(
                  (b) =>
                    !busSearchQuery ||
                    String(b.busNumber).includes(busSearchQuery) ||
                    (b.registrationNo && b.registrationNo.toLowerCase().includes(busSearchQuery.toLowerCase()))
                )
                .map((b) => {
                  const isSelected = b.id === selectedBusId;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={async () => {
                        setSelectedBusId(b.id);
                        if (onSwitchBus) await onSwitchBus(b.id);
                        setShowBusSwitchModal(false);
                        setToastMessage(`Switched to Bus ${b.busNumber}`);
                        setTimeout(() => setToastMessage(null), 2500);
                      }}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-blue-950 border-blue-600 text-white"
                          : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      <div>
                        <div className="font-black text-sm">Bus {b.busNumber}</div>
                        <div className="text-[10px] text-zinc-500">{b.registrationNo} • {b.model || "Transit Coach"}</div>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-blue-400" />}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
