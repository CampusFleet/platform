"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { store } from "@/lib/store";
import { calculateETA, calculateHaversineDistanceKm } from "@/lib/eta-calculator";
import { getCampusStopFromDatabase } from "@/components/maps/CampusFleetMap";
import {
  Navigation,
  Compass,
  MapPin,
  Clock,
  BusFront,
  ShieldAlert,
  ArrowLeft,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Radio,
  Zap,
  Crosshair,
  Route as RouteIcon,
  RefreshCw,
  Phone,
  Shield,
  Layers,
  AlertTriangle,
  GraduationCap,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { Bus, Route, Stop, Trip, Staff, Student, Booking, Campus, LiveBusLocation } from "@/lib/types";

// Dynamic import for Leaflet GIS Map with no SSR
const CampusFleetMap = dynamic(() => import("@/components/maps/CampusFleetMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      <span className="text-xs font-mono font-bold tracking-wider uppercase text-emerald-400">
        Acquiring Telematics Radar Satellite Lock...
      </span>
    </div>
  ),
});

export interface FullScreenLiveRadarProps {
  initialUser?: any;
  initialStudent?: Student | null;
  initialBuses?: Bus[];
  initialRoutes?: Route[];
  initialStops?: Stop[];
  initialTrips?: Trip[];
  initialStaff?: Staff[];
  initialCampuses?: Campus[];
  initialReservation?: any;
  activeBooking?: Booking | null;
  selectedBusId?: string | null;
}

export default function FullScreenLiveRadarView({
  initialUser,
  initialStudent,
  initialBuses = [],
  initialRoutes = [],
  initialStops = [],
  initialTrips = [],
  initialStaff = [],
  initialCampuses = [],
  initialReservation = null,
  activeBooking = null,
  selectedBusId = null,
}: FullScreenLiveRadarProps) {
  const [currentUser] = useState(initialUser || store.getCurrentUser());
  const [buses] = useState<Bus[]>(() => initialBuses.length > 0 ? initialBuses : store.getBuses());
  const [routes] = useState<Route[]>(() => initialRoutes.length > 0 ? initialRoutes : store.getRoutes());
  const [stops] = useState<Stop[]>(() => initialStops.length > 0 ? initialStops : store.getStops());
  const [trips] = useState<Trip[]>(() => initialTrips.length > 0 ? initialTrips : store.getTrips());
  const [staff] = useState<Staff[]>(() => initialStaff.length > 0 ? initialStaff : store.getStaff());
  const [campuses] = useState<Campus[]>(() => initialCampuses.length > 0 ? initialCampuses : store.getCampuses());
  
  // Real-time telematics live stream state
  const [liveLocation, setLiveLocation] = useState<LiveBusLocation | null>(null);
  const [isTelematicsLive, setIsTelematicsLive] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);

  // Fullscreen UI states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [mapFocusTarget, setMapFocusTarget] = useState<"BUS" | "MY_STOP" | "CORRIDOR">("BUS");
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [isSOSOpen, setIsSOSOpen] = useState(false);

  // 1. Resolve active student
  const student = useMemo(() => {
    if (initialStudent) return initialStudent;
    const allStudents = store.getStudents();
    return (
      allStudents.find(
        (s) =>
          (currentUser?.studentId && s.id === currentUser.studentId) ||
          s.userId === currentUser?.id ||
          s.id === currentUser?.id ||
          (currentUser?.email && s.email?.toLowerCase() === currentUser.email?.toLowerCase())
      ) || null
    );
  }, [initialStudent, currentUser]);

  // 2. Resolve assigned bus
  const assignedBus = useMemo(() => {
    // If busId explicitly given in query or prop
    if (selectedBusId) {
      const match = buses.find((b) => String(b.id) === String(selectedBusId) || String(b.busNumber) === String(selectedBusId));
      if (match) return match;
    }
    // Check confirmed reservation
    if (initialReservation?.bus_id) {
      const match = buses.find((b) => b.id === initialReservation.bus_id || String(b.busNumber) === String(initialReservation.bus_id));
      if (match) return match;
    }
    // Check active booking
    if (activeBooking?.busId) {
      const match = buses.find((b) => b.id === activeBooking.busId || String(b.busNumber) === String(activeBooking.busId));
      if (match) return match;
    }
    // Fallback: bus matching student primary route
    if (student?.primaryRouteId) {
      const matchedTrip = trips.find((t) => t.routeId === student.primaryRouteId);
      if (matchedTrip?.busId) {
        const match = buses.find((b) => b.id === matchedTrip.busId);
        if (match) return match;
      }
    }
    return buses[0] || null;
  }, [selectedBusId, initialReservation, activeBooking, buses, student, trips]);

  // 3. Resolve assigned route corridor
  const assignedRoute = useMemo(() => {
    if (initialReservation?.route_id) {
      const match = routes.find((r) => r.id === initialReservation.route_id);
      if (match) return match;
    }
    if (student?.primaryRouteId) {
      const match = routes.find((r) => r.id === student.primaryRouteId);
      if (match) return match;
    }
    if (assignedBus) {
      const activeTrip = trips.find((t) => t.busId === assignedBus.id && (t.status === "IN_PROGRESS" || t.status === "SCHEDULED" || t.status === "DELAYED"));
      if (activeTrip?.routeId) {
        const match = routes.find((r) => r.id === activeTrip.routeId);
        if (match) return match;
      }
    }
    return routes[0] || null;
  }, [initialReservation, student, assignedBus, routes, trips]);

  // 4. Resolve commuter's own pickup/drop-off stop
  const commuterStop = useMemo(() => {
    const targetStopId =
      initialReservation?.boarding_stop_id ||
      activeBooking?.boardingStopId ||
      student?.primaryStopId;
    if (targetStopId) {
      return stops.find((s) => s.id === targetStopId) || null;
    }
    return null;
  }, [initialReservation, activeBooking, student, stops]);

  // 5. Build ordered sequence of multiple destinations (Source -> Intermediate Destinations -> Terminal)
  const orderedDestinations = useMemo(() => {
    const list: Stop[] = [];
    if (assignedRoute?.stops && assignedRoute.stops.length > 0) {
      const sorted = [...assignedRoute.stops].sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0));
      for (const item of sorted) {
        const stopObj = item.stop || stops.find((s) => s.id === item.stopId);
        if (stopObj && !list.some((s) => s.id === stopObj.id)) {
          list.push(stopObj);
        }
      }
    } else {
      // Fallback: all stops matching route campus or default slice
      const matching = stops.slice(0, 8);
      list.push(...matching);
    }

    // Always guarantee institutional campus terminal is represented as the final destination if not present
    const campusTerminal = getCampusStopFromDatabase(stops, campuses, null);
    if (campusTerminal && !list.some((s) => s.id === campusTerminal.id || s.code === campusTerminal.code)) {
      list.push(campusTerminal);
    }

    return list;
  }, [assignedRoute, stops, campuses]);

  const sourceStop = orderedDestinations[0] || null;
  const terminalStop = orderedDestinations[orderedDestinations.length - 1] || null;

  // 6. Polling live GPS stream for assigned bus
  useEffect(() => {
    if (!assignedBus?.id) return;
    let isMounted = true;

    const pollLiveLocation = async () => {
      try {
        setIsPolling(true);
        const res = await fetch(`/api/telematics/live?busId=${encodeURIComponent(String(assignedBus.id))}`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.success && data.location?.latitude && data.location?.longitude) {
          const loc = data.location;
          setLiveLocation({
            busId: assignedBus.id,
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            speedKmh: Number(loc.speedKmh || 0),
            headingDeg: Number(loc.headingDeg || 0),
            lastPingAt: loc.timestamp || new Date().toISOString(),
            tripId: initialReservation?.trip_id || "",
            delayMinutes: Number(loc.delayMinutes || 0),
            estimatedArrivalNextStopMins: 3,
          });
          setIsTelematicsLive(Boolean(loc.isLive));
          setLastPingTime(new Date());
        }
      } catch (err) {
        // graceful offline fallback
      } finally {
        if (isMounted) setIsPolling(false);
      }
    };

    pollLiveLocation();
    const interval = setInterval(pollLiveLocation, 3500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [assignedBus?.id, initialReservation?.trip_id]);

  // 7. Compute destination distances and live approaching status
  const currentBusLat = liveLocation?.latitude ?? sourceStop?.latitude ?? 29.3750;
  const currentBusLng = liveLocation?.longitude ?? sourceStop?.longitude ?? 79.5295;
  const busSpeedKmh = liveLocation?.speedKmh ?? 0;

  // Calculate distance & ETA to every destination along the corridor
  const destinationsWithMetrics = useMemo(() => {
    return orderedDestinations.map((dest, idx) => {
      const distMeters = Math.round(
        calculateHaversineDistanceKm(currentBusLat, currentBusLng, dest.latitude, dest.longitude) * 1000
      );
      const distKm = (distMeters / 1000).toFixed(1);

      // Cruise speed calculation for ETA
      const effectiveSpeed = busSpeedKmh > 8 ? busSpeedKmh : 28;
      const etaMins = Math.max(1, Math.round((distMeters / 1000 / effectiveSpeed) * 60));

      const isCommuterTarget = commuterStop?.id === dest.id;
      const isSource = idx === 0;
      const isTerminal = idx === orderedDestinations.length - 1;

      return {
        ...dest,
        index: idx,
        distMeters,
        distKm,
        etaMins,
        isCommuterTarget,
        isSource,
        isTerminal,
      };
    });
  }, [orderedDestinations, currentBusLat, currentBusLng, busSpeedKmh, commuterStop]);

  // Identify the immediate next destination (closest stop ahead)
  const nextDestination = useMemo(() => {
    if (destinationsWithMetrics.length === 0) return null;
    // Find closest destination ahead that bus hasn't passed
    const sorted = [...destinationsWithMetrics].sort((a, b) => a.distMeters - b.distMeters);
    return sorted[0] || destinationsWithMetrics[0];
  }, [destinationsWithMetrics]);

  // Commuter destination metrics
  const commuterDestination = useMemo(() => {
    return destinationsWithMetrics.find((d) => d.isCommuterTarget) || nextDestination;
  }, [destinationsWithMetrics, nextDestination]);

  // Toggle fullscreen mode
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

  const displayBusNumber = assignedBus?.busNumber ? `Bus ${assignedBus.busNumber}` : "Assigned Bus";
  const displayRouteName = assignedRoute?.name || "Campus Transit Corridor";

  return (
    <div className="relative w-full h-[100dvh] bg-slate-950 text-white overflow-hidden flex flex-col font-sans select-none">
      
      {/* ─── 1. GOOGLE MAPS FLOATING TOP IN-TRANSIT HUD ─── */}
      <header className="absolute top-3 inset-x-3 sm:inset-x-6 z-30 pointer-events-none flex flex-col gap-2.5">
        {/* Top Control Bar: Back Button, Mode Badge, Fullscreen & Controls */}
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/portal"
            className="pointer-events-auto px-3.5 py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700/80 shadow-2xl backdrop-blur-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>My Commute</span>
          </Link>

          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Live GPS Status Pill */}
            <div className={`px-3 py-1.5 rounded-2xl border text-[11px] font-mono font-bold flex items-center gap-2 backdrop-blur-xl shadow-xl ${
              isTelematicsLive
                ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-emerald-950/30"
                : "bg-amber-950/90 text-amber-300 border-amber-500/50 shadow-amber-950/30"
            }`}>
              <span className="relative flex h-2 w-2">
                {isTelematicsLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isTelematicsLive ? "bg-emerald-400" : "bg-amber-400"}`} />
              </span>
              <span>{isTelematicsLive ? "LIVE TELEMATICS" : "CONNECTING..."}</span>
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullScreenMode}
              className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 shadow-2xl backdrop-blur-xl transition-all active:scale-95 cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Radar Mode"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Turn-By-Turn Navigation Card (Google Maps In-Ride Style) */}
        <div className="pointer-events-auto bg-gradient-to-r from-emerald-950/95 via-emerald-900/95 to-slate-900/95 border border-emerald-500/40 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-2xl text-white animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
                <Navigation className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-0.5">
                <div className="text-[11px] font-mono uppercase tracking-wider font-extrabold text-emerald-300 flex items-center gap-1.5">
                  <span>Next Destination</span>
                  {nextDestination?.distMeters !== undefined && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                      {nextDestination.distMeters < 80 ? "Arriving Now" : `${nextDestination.distKm} km away`}
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-xl font-black text-white tracking-tight line-clamp-1">
                  {nextDestination?.name || "Corridor Route Stop"}
                </h2>
                <div className="text-xs text-emerald-100/80 flex items-center gap-2 flex-wrap">
                  <span>{displayBusNumber}</span>
                  <span>•</span>
                  <span>{displayRouteName}</span>
                  {liveLocation?.speedKmh !== undefined && (
                    <>
                      <span>•</span>
                      <span className="font-mono font-bold text-emerald-300">{liveLocation.speedKmh} km/h</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Time to Next Destination */}
            <div className="text-right shrink-0">
              <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                ~{nextDestination?.etaMins || 2} <span className="text-xs font-bold text-emerald-300">min</span>
              </div>
              <div className="text-[10px] font-mono text-slate-300 uppercase tracking-wider">
                Est. Arrival
              </div>
            </div>
          </div>

          {/* Special Commuter Destination Callout if different from next stop */}
          {commuterDestination && commuterDestination.id !== nextDestination?.id && (
            <div className="mt-3 pt-3 border-t border-emerald-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-semibold truncate">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">Your Drop-Off Stop: <strong className="text-white">{commuterDestination.name}</strong></span>
              </div>
              <div className="font-mono text-xs text-amber-200 shrink-0 font-bold ml-2">
                ~{commuterDestination.etaMins} mins ({commuterDestination.distKm} km)
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ─── 2. FULLSCREEN INTERACTIVE LEAFLET GIS CANVAS ─── */}
      <div className="relative w-full h-full flex-1">
        <CampusFleetMap
          busLocation={
            liveLocation
              ? liveLocation
              : {
                  busId: assignedBus?.id ?? -1,
                  latitude: currentBusLat,
                  longitude: currentBusLng,
                  speedKmh: busSpeedKmh,
                  headingDeg: 0,
                  lastPingAt: new Date().toISOString(),
                  tripId: initialReservation?.trip_id || "",
                  delayMinutes: 0,
                  estimatedArrivalNextStopMins: 3,
                }
          }
          busName={displayBusNumber}
          tripStatus="IN_PROGRESS"
          stops={orderedDestinations}
          campuses={campuses}
          selectedStopId={commuterStop?.id || selectedDestinationId || nextDestination?.id}
          height="100%"
          zoom={15}
          showUserLocation={true}
          showCampusLandmark={true}
          onStopClick={(clickedStop) => {
            setSelectedDestinationId(clickedStop.id);
            setIsDrawerExpanded(true);
          }}
        />

        {/* ─── FLOATING GIS ACTION BUTTONS (Right Side) ─── */}
        <div className="absolute right-3 sm:right-6 top-52 sm:top-48 z-20 flex flex-col gap-2.5">
          {/* Re-center Bus Button */}
          <button
            onClick={() => setMapFocusTarget("BUS")}
            className="p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700/80 shadow-2xl backdrop-blur-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
            title="Track Live Bus Location"
          >
            <Crosshair className="w-5 h-5 text-emerald-400 group-hover:rotate-45 transition-transform" />
          </button>

          {/* Focus on My Stop */}
          {commuterStop && (
            <button
              onClick={() => {
                setSelectedDestinationId(commuterStop.id);
                setMapFocusTarget("MY_STOP");
              }}
              className="p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700/80 shadow-2xl backdrop-blur-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
              title="Focus My Destination Stop"
            >
              <MapPin className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
            </button>
          )}

          {/* Full Corridor View */}
          <button
            onClick={() => setMapFocusTarget("CORRIDOR")}
            className="p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700/80 shadow-2xl backdrop-blur-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
            title="Fit Entire Source-to-Destination Corridor"
          >
            <RouteIcon className="w-5 h-5 text-indigo-400" />
          </button>

          {/* Toggle Journey Drawer */}
          <button
            onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
            className="p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700/80 shadow-2xl backdrop-blur-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
            title="Toggle All Destinations Timeline"
          >
            <Layers className="w-5 h-5 text-sky-400" />
          </button>
        </div>
      </div>

      {/* ─── 3. GOOGLE MAPS EXPANDABLE BOTTOM JOURNEY SHEET ─── */}
      <div className={`absolute inset-x-0 bottom-0 z-30 transition-all duration-300 ease-in-out ${
        isDrawerExpanded ? "max-h-[75vh]" : "max-h-[140px]"
      } bg-slate-900/95 dark:bg-black/95 backdrop-blur-2xl border-t border-slate-800 shadow-2xl flex flex-col rounded-t-3xl`}>
        
        {/* Drag Handle & Collapsed Summary */}
        <div 
          onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
          className="p-3.5 pb-2 border-b border-slate-800/80 cursor-pointer hover:bg-slate-800/40 transition-colors flex flex-col items-center select-none"
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-700 mb-2" />
          <div className="w-full flex items-center justify-between px-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-sm">Destinations on Corridor</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                {orderedDestinations.length} Stops
              </span>
            </div>
            <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold">
              <span>{isDrawerExpanded ? "Collapse Map" : "View All Stops"}</span>
              {isDrawerExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Scrollable Destinations Stepper (Source -> Multiple Intermediate Destinations -> Terminus) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="text-xs text-slate-400 flex items-center justify-between pb-1">
            <span className="font-mono uppercase font-bold text-slate-500">Journey Progression</span>
            <span>Origin: {sourceStop?.name || "Terminal"} → Campus</span>
          </div>

          <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-700">
            {destinationsWithMetrics.map((dest, idx) => {
              const isPast = nextDestination && dest.index < nextDestination.index;
              const isNext = nextDestination?.id === dest.id;
              const isCommuterTarget = dest.isCommuterTarget;

              return (
                <div 
                  key={dest.id || idx}
                  onClick={() => setSelectedDestinationId(dest.id)}
                  className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isCommuterTarget
                      ? "bg-amber-950/40 border-amber-500/60 shadow-lg shadow-amber-950/30"
                      : isNext
                      ? "bg-emerald-950/40 border-emerald-500/60 shadow-lg shadow-emerald-950/30"
                      : isPast
                      ? "bg-slate-900/40 border-slate-800 opacity-60"
                      : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Timeline Node Icon */}
                  <div className={`absolute -left-[30px] top-4 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                    isPast
                      ? "bg-slate-800 border-slate-600 text-slate-400"
                      : isNext
                      ? "bg-emerald-500 border-white text-slate-950 shadow-md animate-pulse"
                      : isCommuterTarget
                      ? "bg-amber-500 border-white text-slate-950 shadow-md"
                      : "bg-slate-900 border-slate-600 text-slate-300"
                  }`}>
                    {isPast ? "✓" : idx + 1}
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white tracking-tight">
                          {dest.name}
                        </h4>
                        {isCommuterTarget && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black">
                            YOUR STOP
                          </span>
                        )}
                        {isNext && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black">
                            NEXT STOP
                          </span>
                        )}
                        {dest.isSource && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                            SOURCE
                          </span>
                        )}
                        {dest.isTerminal && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500 text-white font-mono flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" />
                            CAMPUS
                          </span>
                        )}
                      </div>
                      {dest.landmark && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{dest.landmark}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-white">
                        {isPast ? "Passed" : `~${dest.etaMins} mins`}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {dest.distKm} km
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vehicle & Telematics Footer Summary */}
          <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                <BusFront className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <div className="font-bold text-white">{displayBusNumber}</div>
                <div className="text-[11px] text-slate-400">
                  {lastPingTime ? `Last Ping: ${lastPingTime.toLocaleTimeString()}` : "Awaiting Telematics Fix"}
                </div>
              </div>
            </div>

            <Link
              href="/portal"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-center font-bold text-xs transition-all active:scale-95"
            >
              Return to Commute Pass & Cockpit
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
