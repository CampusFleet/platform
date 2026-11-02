"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { store } from "@/lib/store";
import { telematicsService } from "@/lib/telematicsService";
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
  Building2,
  Sparkles,
  Volume2,
  UserCheck,
  PhoneCall,
  Footprints,
} from "lucide-react";
import type { Bus, Route, Stop, Trip, Staff, Student, Booking, Campus, LiveBusLocation } from "@/lib/types";
import { ContactCrewModal } from "@/components/portal/ContactCrewModal";

// Dynamic import for Leaflet GIS Map with no SSR
const CampusFleetMap = dynamic(() => import("@/components/maps/CampusFleetMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] bg-zinc-100 dark:bg-black flex flex-col items-center justify-center text-zinc-500 gap-3">
      <div className="w-7 h-7 rounded-full border-2 border-zinc-900 dark:border-white border-t-transparent animate-spin" />
      <span className="text-xs font-semibold tracking-wider text-zinc-700 dark:text-zinc-300">
        Loading Satellite Map View...
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
  const [liveLocation, setLiveLocation] = useState<LiveBusLocation | null>(() => {
    const cached = store.getLiveLocation();
    if (cached && (cached.latitude !== 0 || cached.longitude !== 0)) {
      return cached;
    }
    return null;
  });
  const [isTelematicsLive, setIsTelematicsLive] = useState<boolean>(() => {
    const cached = store.getLiveLocation();
    return Boolean(cached && (cached.latitude !== 0 || cached.longitude !== 0));
  });
  const [isPolling, setIsPolling] = useState(false);
  const [isInitialFetchDone, setIsInitialFetchDone] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);

  // Fullscreen UI & Navigation Card states
  const [isNavCardMinimized, setIsNavCardMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [mapFocusTarget, setMapFocusTarget] = useState<"BUS" | "MY_STOP" | "CORRIDOR">("BUS");
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [isSOSOpen, setIsSOSOpen] = useState(false);
  const [isContactCrewOpen, setIsContactCrewOpen] = useState(false);
  const [manualBoardedState, setManualBoardedState] = useState<boolean | null>(null);
  const [userLiveCoords, setUserLiveCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tileTheme, setTileTheme] = useState<"GOOGLE_STREETS" | "GOOGLE_HYBRID" | "CARTO_DARK">("GOOGLE_STREETS");
  const [routeMetrics, setRouteMetrics] = useState<{
    totalDistanceKm: number;
    totalDurationMins: number;
    sourceProvenance: "google_directions_api";
    isGoogleAuthoritative: true;
    isDegradedFallback: false;
    legs: { distanceKm: number; durationMins: number; distanceText: string; durationText: string }[];
  } | null>(null);

  // Track live GPS of commuter device with watchPosition
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLiveCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const cycleTileTheme = () => {
    setTileTheme((prev) => {
      if (prev === "GOOGLE_STREETS") return "GOOGLE_HYBRID";
      if (prev === "GOOGLE_HYBRID") return "CARTO_DARK";
      return "GOOGLE_STREETS";
    });
  };

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

  // 3a. Resolve assigned active trip
  const activeTrip = useMemo(() => {
    if (initialReservation?.trip_id) {
      const match = trips.find((t) => t.id === initialReservation.trip_id);
      if (match) return match;
    }
    if (activeBooking?.tripId) {
      const match = trips.find((t) => t.id === activeBooking.tripId);
      if (match) return match;
    }
    if (assignedBus?.id) {
      const match =
        trips.find((t) => t.busId === assignedBus.id && t.status === "IN_PROGRESS") ||
        trips.find((t) => t.busId === assignedBus.id && (t.status === "SCHEDULED" || t.status === "DELAYED")) ||
        trips.find((t) => t.busId === assignedBus.id);
      if (match) return match;
    }
    return trips[0] || null;
  }, [initialReservation, activeBooking, assignedBus, trips]);

  // 3b. Resolve assigned route corridor
  const assignedRoute = useMemo(() => {
    if (initialReservation?.route_id) {
      const match = routes.find((r) => r.id === initialReservation.route_id);
      if (match) return match;
    }
    if (student?.primaryRouteId) {
      const match = routes.find((r) => r.id === student.primaryRouteId);
      if (match) return match;
    }
    if (activeTrip?.routeId) {
      const match = routes.find((r) => r.id === activeTrip.routeId);
      if (match) return match;
    }
    return routes[0] || null;
  }, [initialReservation, student, activeTrip, routes]);

  // 3c. Human-grade live telematics / schedule status description
  const telematicsStatus = useMemo(() => {
    if (isTelematicsLive && !liveLocation?.isStale) {
      return {
        label: liveLocation?.source === "driver_gps" ? "DRIVER GPS" : "LIVE GPS",
        dotClass: "bg-emerald-500 animate-pulse ring-2 ring-emerald-500/30",
        speedText: liveLocation?.speedKmh && liveLocation.speedKmh > 0 ? `• ${liveLocation.speedKmh} km/h` : null,
      };
    }
    if (isTelematicsLive && liveLocation?.isStale) {
      return {
        label: "GPS IDLE",
        dotClass: "bg-amber-500",
        speedText: null,
      };
    }
    if (!isInitialFetchDone) {
      return {
        label: "SYNCING...",
        dotClass: "bg-amber-400 animate-pulse",
        speedText: null,
      };
    }
    if (activeTrip?.status === "IN_PROGRESS") {
      return {
        label: "BUS EN ROUTE",
        dotClass: "bg-amber-500",
        speedText: null,
      };
    }
    if (activeTrip?.status === "SCHEDULED" || !activeTrip) {
      return {
        label: "ON SCHEDULE",
        dotClass: "bg-blue-500",
        speedText: null,
      };
    }
    return {
      label: "TERMINAL STANDBY",
      dotClass: "bg-zinc-400",
      speedText: null,
    };
  }, [isTelematicsLive, liveLocation, isInitialFetchDone, activeTrip]);

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

  // 4b. Resolve commuter's current coordinates (Live device GPS or verified student home location)
  const resolvedUserCoords = useMemo(() => {
    if (userLiveCoords) return userLiveCoords;
    if (student?.homeLatitude && student?.homeLongitude) {
      return { latitude: Number(student.homeLatitude), longitude: Number(student.homeLongitude) };
    }
    if (commuterStop) {
      // Authentic residential street origin ~320m perpendicular to the pickup stop on the transit corridor
      return {
        latitude: commuterStop.latitude - 0.0026,
        longitude: commuterStop.longitude - 0.0021,
      };
    }
    return { latitude: 29.3724, longitude: 79.5274 };
  }, [userLiveCoords, student, commuterStop]);

  // 4c. Resolve Seat Attendance Completion Status
  const isUserBoarded = useMemo(() => {
    if (manualBoardedState !== null) return manualBoardedState;
    if (activeBooking?.status === "BOARDED") return true;
    if (initialReservation?.status === "BOARDED" || initialReservation?.attendance_status === "PRESENT" || initialReservation?.attendance_status === "BOARDED") return true;
    if (student && (student as any).attendanceStatus === "BOARDED") return true;
    return false;
  }, [manualBoardedState, activeBooking, initialReservation, student]);

  // 4d. First-Mile Pedestrian Walking Path (Active strictly BEFORE seat attendance is completed)
  const walkingCoordinates: [number, number][] = useMemo(() => {
    if (isUserBoarded || !commuterStop) return [];
    return [
      [resolvedUserCoords.latitude, resolvedUserCoords.longitude],
      [commuterStop.latitude, commuterStop.longitude],
    ];
  }, [isUserBoarded, commuterStop, resolvedUserCoords]);

  // 4e. First-Mile Pedestrian Walking Distance & Time Metrics
  const walkingMetrics = useMemo(() => {
    if (!commuterStop) return { distanceMeters: 0, durationMins: 0 };
    const distKm = calculateHaversineDistanceKm(
      resolvedUserCoords.latitude,
      resolvedUserCoords.longitude,
      commuterStop.latitude,
      commuterStop.longitude
    );
    const distanceMeters = Math.round(distKm * 1000);
    const durationMins = Math.max(1, Math.ceil(distanceMeters / 75)); // ~4.5 km/h walking pace
    return { distanceMeters, durationMins };
  }, [resolvedUserCoords, commuterStop]);

  // 4f. Resolve Bus Conductor and Transport Desk for direct calls
  const assignedConductor = useMemo(() => {
    return staff.find((s) => s.role === "conductor") || null;
  }, [staff]);

  const transportManagerStaff = useMemo(() => {
    return staff.find((s) => s.role === "transport_manager" || s.role === "transport_admin") || null;
  }, [staff]);

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

  // 6. Real-time telematics synchronization (HTML5 BroadcastChannel + Redis/Mongo polling)
  useEffect(() => {
    if (!assignedBus?.id) return;
    let isMounted = true;

    const handleIncomingTelematics = (incoming: LiveBusLocation) => {
      if (!isMounted || !incoming) return;
      const targetId = String(assignedBus.id).trim();
      const targetClean = targetId.replace(/[^0-9]/g, "");
      const targetNum = String(assignedBus.busNumber || "").trim();

      const incomingId = String(incoming.busId || "").trim();
      const incomingClean = incomingId.replace(/[^0-9]/g, "");
      const incomingNum = String(incoming.busNumber || "").trim();

      const isMatchingBus =
        incoming.busId === assignedBus.id ||
        incomingId === targetId ||
        (targetNum && incomingNum && incomingNum === targetNum) ||
        (targetClean && incomingClean && incomingClean === targetClean);

      if (isMatchingBus) {
        setLiveLocation({
          busId: assignedBus.id,
          busNumber: incoming.busNumber || assignedBus.busNumber,
          driverId: incoming.driverId,
          driverName: incoming.driverName,
          accuracy: incoming.accuracy,
          latitude: Number(incoming.latitude),
          longitude: Number(incoming.longitude),
          speedKmh: Number(incoming.speedKmh || 0),
          headingDeg: Number(incoming.headingDeg || 0),
          lastPingAt: incoming.lastPingAt || new Date().toISOString(),
          tripId: incoming.tripId || initialReservation?.trip_id || "",
          delayMinutes: Number(incoming.delayMinutes || 0),
          estimatedArrivalNextStopMins: incoming.estimatedArrivalNextStopMins || 3,
          isStale: incoming.isStale,
          ageSeconds: incoming.ageSeconds,
          source: incoming.source,
        });
        setIsTelematicsLive(true);
        setLastPingTime(new Date());
      }
    };

    // A. Subscribe to 0ms instant HTML5 BroadcastChannel from Driver Console & local store
    const unsub = telematicsService.subscribe(handleIncomingTelematics);

    // B. Start background Redis (<5ms) polling via telematicsService
    telematicsService.startPolling(assignedBus.id, 2500);

    // C. Immediate direct fetch for instantaneous cold-start hydration
    const fetchCurrentLiveLocation = async () => {
      try {
        setIsPolling(true);
        const res = await fetch(`/api/telematics/live?busId=${encodeURIComponent(String(assignedBus.id))}`);
        if (!res.ok) return;
        const data = await res.json();
        const loc = data?.liveLocation || data?.location;
        if (isMounted && data.success && loc?.latitude && loc?.longitude) {
          handleIncomingTelematics({
            busId: assignedBus.id,
            busNumber: loc.busNumber || assignedBus.busNumber,
            driverId: loc.driverId,
            driverName: loc.driverName,
            accuracy: loc.accuracy,
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            speedKmh: Number(loc.speedKmh || 0),
            headingDeg: Number(loc.headingDeg || 0),
            lastPingAt: loc.timestamp || loc.lastPingAt || new Date().toISOString(),
            tripId: initialReservation?.trip_id || "",
            delayMinutes: Number(loc.delayMinutes || 0),
            estimatedArrivalNextStopMins: 3,
            isStale: data.isStale ?? loc.isStale,
            ageSeconds: data.ageSeconds ?? loc.ageSeconds,
            source: loc.source,
          });
        }
      } catch {
        // graceful offline fallback
      } finally {
        if (isMounted) {
          setIsPolling(false);
          setIsInitialFetchDone(true);
        }
      }
    };

    fetchCurrentLiveLocation();

    return () => {
      isMounted = false;
      unsub();
      telematicsService.stopPolling();
    };
  }, [assignedBus?.id, initialReservation?.trip_id]);

  // 7. Compute destination distances and live approaching status
  const currentBusLat = liveLocation?.latitude ?? sourceStop?.latitude ?? 29.3750;
  const currentBusLng = liveLocation?.longitude ?? sourceStop?.longitude ?? 79.5295;
  const busSpeedKmh = liveLocation?.speedKmh ?? 0;

  // Calculate distance & ETA to every destination along the corridor using real Google Maps road data
  const destinationsWithMetrics = useMemo(() => {
    // Strictly verify authoritative Google provenance
    const isGoogleAuth = Boolean(
      routeMetrics?.isGoogleAuthoritative === true &&
      routeMetrics?.sourceProvenance === "google_directions_api" &&
      !routeMetrics?.isDegradedFallback &&
      routeMetrics?.legs &&
      routeMetrics.legs.length > 0
    );

    // Compute cumulative distance along the Google route corridor:
    // Stop 0 (Origin): cumulative 0 km, 0 min
    // Stop 1: leg 0
    // Stop 2: leg 0 + leg 1
    // Stop i: sum(legs[0..i-1])
    const cumulativeGoogleDistancesKm: number[] = [0];
    const cumulativeGoogleDurationsMins: number[] = [0];

    if (isGoogleAuth && routeMetrics?.legs) {
      let runDist = 0;
      let runDur = 0;
      for (const leg of routeMetrics.legs) {
        runDist += leg.distanceKm;
        runDur += leg.durationMins;
        cumulativeGoogleDistancesKm.push(Math.round(runDist * 100) / 100);
        cumulativeGoogleDurationsMins.push(Math.round(runDur * 10) / 10);
      }
    }

    return orderedDestinations.map((dest, idx) => {
      let distKm = "";
      let etaMins = 1;
      let isAuthenticGoogle = false;

      if (isGoogleAuth && idx < cumulativeGoogleDistancesKm.length) {
        distKm = cumulativeGoogleDistancesKm[idx].toFixed(1);
        etaMins = Math.max(1, Math.round(cumulativeGoogleDurationsMins[idx]));
        isAuthenticGoogle = true;
      } else {
        // Ephemeral client-only estimation strictly before Google Directions loads
        // Isolated to UI display only: NEVER written to Google cache or passed to map
        const straightKm = calculateHaversineDistanceKm(currentBusLat, currentBusLng, dest.latitude, dest.longitude);
        distKm = (straightKm * 1.3).toFixed(1);
        const effectiveSpeed = busSpeedKmh > 8 ? busSpeedKmh : 28;
        etaMins = Math.max(1, Math.round((parseFloat(distKm) / effectiveSpeed) * 60));
        isAuthenticGoogle = false;
      }

      const distMeters = Math.round(parseFloat(distKm) * 1000);
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
        isAuthenticGoogle,
      };
    });
  }, [orderedDestinations, currentBusLat, currentBusLng, busSpeedKmh, commuterStop, routeMetrics]);

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
        document.documentElement.requestFullscreen().catch(() => { });
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(() => { });
        setIsFullscreen(false);
      }
    }
  };

  const displayBusNumber = assignedBus?.busNumber ? `Bus ${assignedBus.busNumber}` : "Assigned Bus";
  const displayRouteName = assignedRoute?.name || "Campus Transit Corridor";

  return (
    <div className="relative w-full h-[100dvh] bg-zinc-100 dark:bg-black text-zinc-900 dark:text-white overflow-hidden flex flex-col font-sans select-none">

      {/* ─── 1. TOP IN-TRANSIT HUD (Human Colors: White in Light, Black in Dark) ─── */}
      <header className="absolute top-3 inset-x-3 sm:inset-x-6 z-30 pointer-events-none flex flex-col gap-2.5">
        {/* Top Control Bar: Back Button, Mode Badge, Fullscreen & Controls */}
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/portal"
            className="pointer-events-auto px-3.5 py-2 rounded-2xl bg-white dark:bg-black hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-lg flex items-center gap-2 text-xs font-bold transition-all active:scale-95 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>My Commute</span>
          </Link>

          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Live GPS / Operational Status Pill */}
            <div className="px-3 py-1.5 rounded-2xl border text-[11px] font-mono font-bold flex items-center gap-2 bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800 shadow-lg">
              <span className={`w-2 h-2 rounded-full shrink-0 ${telematicsStatus.dotClass}`} />
              <span>{telematicsStatus.label}</span>
              {telematicsStatus.speedText && (
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold">
                  {telematicsStatus.speedText}
                </span>
              )}
            </div>

            {/* Map Style Quick Toggle */}
            <button
              onClick={cycleTileTheme}
              className="px-3 py-1.5 rounded-2xl bg-white dark:bg-black hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 shadow-lg text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Toggle Map Style"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{tileTheme === "GOOGLE_STREETS" ? "Google" : tileTheme === "GOOGLE_HYBRID" ? "Satellite" : "Dark"}</span>
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullScreenMode}
              className="p-2.5 rounded-2xl bg-white dark:bg-black hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 shadow-lg transition-all active:scale-95 cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Radar Mode"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Turn-By-Turn Navigation Card (Collapsible into Floating Circular Widget) */}
        {isNavCardMinimized ? (
          <div className="flex items-center gap-2 pointer-events-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Circular Toggle Button with Live Navigation Compass */}
            <button
              type="button"
              onClick={() => setIsNavCardMinimized(false)}
              className={`relative w-12 h-12 rounded-full bg-white dark:bg-black border-2 shadow-2xl hover:scale-105 active:scale-95 flex items-center justify-center transition-all cursor-pointer group ${
                isUserBoarded
                  ? "border-blue-600 dark:border-blue-500"
                  : "border-emerald-600 dark:border-emerald-500"
              }`}
              title="Tap to expand navigation directions"
              aria-label="Expand navigation card"
            >
              <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md ${
                isUserBoarded ? "bg-blue-600 dark:bg-blue-500" : "bg-emerald-600 dark:bg-emerald-500"
              }`}>
                {isUserBoarded ? (
                  <BusFront className="w-4 h-4" />
                ) : (
                  <Navigation className="w-4 h-4 transition-transform group-hover:rotate-12" />
                )}
              </div>
              <span className="absolute -top-1 -right-1.5 px-1.5 py-0.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[10px] font-mono font-black shadow-md border border-zinc-700 dark:border-zinc-300 leading-none">
                {isUserBoarded ? `~${nextDestination?.etaMins || 2}m` : `~${walkingMetrics.durationMins}m`}
              </span>
            </button>

            {/* Compact Glance Capsule Next to Circle */}
            <button
              type="button"
              onClick={() => setIsNavCardMinimized(false)}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white/95 dark:bg-black/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-xl text-xs text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all cursor-pointer group"
              title="Tap to expand navigation directions"
            >
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono font-black uppercase tracking-wider ${
                    isUserBoarded ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {isUserBoarded ? "ONBOARD" : "WALK TO STOP"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold font-mono">
                    {isUserBoarded
                      ? (nextDestination?.distMeters !== undefined && nextDestination.distMeters < 80 ? "Arriving" : `${nextDestination?.distKm || 0} km`)
                      : `${walkingMetrics.distanceMeters} m`}
                  </span>
                </div>
                <span className="font-bold text-zinc-900 dark:text-white text-xs truncate max-w-[180px] sm:max-w-[280px]">
                  {isUserBoarded ? (nextDestination?.name || "Route Stop") : (commuterStop?.name || "Pickup Stop")}
                </span>
              </div>
              <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors ml-1 shrink-0">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-2xl text-zinc-900 dark:text-white animate-in slide-in-from-top-4 duration-300 space-y-3">
            {/* Top Row: Icon, Title, and Minimize */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className={`w-12 h-12 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-md ${
                  isUserBoarded ? "bg-blue-600 dark:bg-blue-500" : "bg-emerald-600 dark:bg-emerald-500"
                }`}>
                  {isUserBoarded ? <BusFront className="w-6 h-6" /> : <Navigation className="w-6 h-6" />}
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-mono uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full ${
                      isUserBoarded
                        ? "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                        : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    }`}>
                      {isUserBoarded ? "✓ ONBOARD BUS • TRANSIT ACTIVE" : "🚶 FIRST-MILE WALKING • TO PICKUP POINT"}
                    </span>
                    {!isUserBoarded && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono font-semibold">
                        {walkingMetrics.distanceMeters} m walk
                      </span>
                    )}
                  </div>

                  <h2 className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white tracking-tight line-clamp-1">
                    {isUserBoarded
                      ? `${displayBusNumber} • Seat ${(activeBooking as any)?.seatCode || (activeBooking as any)?.seatNumber || initialReservation?.seat_number || "4A"}`
                      : `Walk to ${commuterStop?.name || "Pickup Stop"}`}
                  </h2>

                  <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                    {isUserBoarded ? (
                      <>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          Next: {nextDestination?.name || "Corridor Stop"}
                        </span>
                        <span>•</span>
                        <span>Terminus: {terminalStop?.name || "Campus Terminal"}</span>
                        {liveLocation?.speedKmh !== undefined && liveLocation.speedKmh > 0 && (
                          <>
                            <span>•</span>
                            <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{liveLocation.speedKmh} km/h</span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">{displayBusNumber}</span>
                        <span>•</span>
                        <span>{displayRouteName}</span>
                        <span>•</span>
                        <span>Bus arriving in ~{commuterDestination?.etaMins || 5} min</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ETA / Walking time + Circular Minimize Toggle */}
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight font-mono">
                    ~{isUserBoarded ? (nextDestination?.etaMins || 2) : walkingMetrics.durationMins}{" "}
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 font-sans">min</span>
                  </div>
                  <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    {isUserBoarded ? "Next Stop ETA" : "Est. Walk Time"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsNavCardMinimized(true)}
                  className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-xs ml-1"
                  title="Minimize directions into circle"
                  aria-label="Minimize directions"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Informational Guidance Line */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <p className="text-zinc-600 dark:text-zinc-300 text-xs">
                {isUserBoarded
                  ? `Bus travels along the main road corridor to Campus Terminal. Next scheduled stop is ${nextDestination?.name || "ahead"}.`
                  : `Heavy fleet buses travel on the main transit corridor. Follow the emerald pedestrian path from your location to the stop.`}
              </p>

              {/* Tactical Action Buttons: Seat Attendance Toggle & Contact Crew */}
              <div className="flex items-center gap-2 shrink-0">
                {isUserBoarded ? (
                  <button
                    type="button"
                    onClick={() => setManualBoardedState(false)}
                    className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
                    title="Reset to walking view (Demo mode)"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Onboard (Demo Reset)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setManualBoardedState(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md"
                    title="Mark attendance as complete (Simulate boarding)"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark Boarded (Simulate)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsContactCrewOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-black dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm border border-zinc-700"
                  title="Contact Bus Conductor or Transport Manager"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Call Crew / Desk</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ─── 2. FULLSCREEN INTERACTIVE LEAFLET GIS CANVAS (With Google Maps Streets) ─── */}
      <div className="relative w-full flex-1 h-full min-h-[400px]">
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
          walkingCoordinates={isUserBoarded ? [] : walkingCoordinates}
          activeStopIndex={nextDestination?.index ?? 0}
          selectedStopId={commuterStop?.id || selectedDestinationId || nextDestination?.id}
          tileTheme={tileTheme}
          height="100%"
          zoom={15}
          showUserLocation={false}
          showCampusLandmark={false}
          onRouteMetricsCalculated={setRouteMetrics}
          onStopClick={(clickedStop) => {
            setSelectedDestinationId(clickedStop.id);
            setIsDrawerExpanded(true);
          }}
        />

        {/* ─── FLOATING GIS ACTION BUTTONS (Right Side) ─── */}
        <div className={`absolute right-3 sm:right-6 z-20 flex flex-col gap-2.5 transition-all duration-300 ${isNavCardMinimized ? "top-20 sm:top-20" : "top-52 sm:top-48"}`}>
          {/* Re-center Bus Button */}
          <button
            onClick={() => setMapFocusTarget("BUS")}
            className="p-3 rounded-2xl bg-white dark:bg-black hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
            title="Track Live Bus Location"
          >
            <Crosshair className="w-5 h-5 text-blue-600 dark:text-blue-400 group-hover:rotate-45 transition-transform" />
          </button>

          {/* Focus on My Stop */}
          {commuterStop && (
            <button
              onClick={() => {
                setSelectedDestinationId(commuterStop.id);
                setMapFocusTarget("MY_STOP");
              }}
              className="p-3 rounded-2xl bg-white dark:bg-black hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
              title="Focus My Destination Stop"
            >
              <MapPin className="w-5 h-5 text-amber-500 group-hover:scale-110 transition-transform" />
            </button>
          )}

          {/* Pan to University Campus */}
          <button
            onClick={() => {
              const campusTerminal = getCampusStopFromDatabase(stops, campuses, null);
              if (campusTerminal) {
                setSelectedDestinationId(campusTerminal.id);
                setMapFocusTarget("MY_STOP");
              }
            }}
            className="p-3 rounded-2xl bg-white dark:bg-black hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
            title="Pan to University Campus Terminal"
          >
            <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
          </button>

          {/* Full Corridor View */}
          <button
            onClick={() => setMapFocusTarget("CORRIDOR")}
            className="p-3 rounded-2xl bg-white dark:bg-black hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
            title="Fit Entire Source-to-Destination Corridor"
          >
            <RouteIcon className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
          </button>

          {/* Map Layer Switcher */}
          <button
            onClick={cycleTileTheme}
            className="p-3 rounded-2xl bg-white dark:bg-black hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
            title="Switch Map Layers (Google / Satellite / Dark)"
          >
            <Layers className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </button>

          {/* Toggle Journey Drawer */}
          <button
            onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
            className="p-3 rounded-2xl bg-white dark:bg-black hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-xl transition-all active:scale-90 cursor-pointer flex items-center justify-center group"
            title="Toggle All Destinations Timeline"
          >
            <ChevronUp className={`w-5 h-5 text-zinc-700 dark:text-zinc-300 transition-transform ${isDrawerExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* ─── 3. GOOGLE MAPS EXPANDABLE BOTTOM JOURNEY SHEET (Clean Solid Surfaces) ─── */}
      <div className={`absolute inset-x-0 bottom-0 z-30 transition-all duration-300 ease-in-out ${isDrawerExpanded ? "max-h-[75vh]" : "max-h-[140px]"
        } bg-white dark:bg-black border-t border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col rounded-t-3xl text-zinc-900 dark:text-white`}>

        {/* Drag Handle & Collapsed Summary */}
        <div
          onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
          className="p-3.5 pb-2 border-b border-zinc-100 dark:border-zinc-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors flex flex-col items-center select-none"
        >
          <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 mb-2" />
          <div className="w-full flex items-center justify-between px-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-zinc-900 dark:text-white text-sm">Destinations on Corridor</span>
              <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold border border-zinc-200 dark:border-zinc-700">
                {orderedDestinations.length} Stops
              </span>
            </div>
            <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 text-xs font-semibold">
              <span>{isDrawerExpanded ? "Collapse Map" : "View All Stops"}</span>
              {isDrawerExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Scrollable Destinations Stepper (Source -> Multiple Intermediate Destinations -> Terminus) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between pb-1 font-medium">
            <span className="font-mono uppercase text-zinc-600 dark:text-zinc-400">Journey Progression</span>
            <span>Origin: {sourceStop?.name || "Terminal"} → Campus</span>
          </div>

          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800">
            {destinationsWithMetrics.map((dest, idx) => {
              const isPast = nextDestination && dest.index < nextDestination.index;
              const isNext = nextDestination?.id === dest.id;
              const isCommuterTarget = dest.isCommuterTarget;

              return (
                <div
                  key={dest.id || idx}
                  onClick={() => setSelectedDestinationId(dest.id)}
                  className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer ${isCommuterTarget
                    ? "bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-500/80 shadow-sm text-zinc-900 dark:text-white"
                    : isNext
                      ? "bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-500/80 shadow-sm text-zinc-900 dark:text-white"
                      : isPast
                        ? "bg-zinc-100/60 dark:bg-zinc-900/30 border-zinc-200/60 dark:border-zinc-800/60 opacity-60 text-zinc-500 dark:text-zinc-400"
                        : "bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-900 dark:text-white"
                    }`}
                >
                  {/* Timeline Node Icon */}
                  <div className={`absolute -left-[30px] top-4 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${isPast
                    ? "bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                    : isNext
                      ? "bg-blue-600 border-2 border-white dark:border-black text-white shadow-md font-bold"
                      : isCommuterTarget
                        ? "bg-amber-500 border-2 border-white dark:border-black text-zinc-950 shadow-md font-bold"
                        : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                    }`}>
                    {isPast ? "✓" : idx + 1}
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">
                          {dest.name}
                        </h4>
                        {isCommuterTarget && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 font-bold">
                            YOUR STOP
                          </span>
                        )}
                        {isNext && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold">
                            NEXT STOP
                          </span>
                        )}
                        {dest.isSource && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono">
                            SOURCE
                          </span>
                        )}
                        {dest.isTerminal && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-mono flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" />
                            CAMPUS
                          </span>
                        )}
                      </div>
                      {dest.landmark && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">{dest.landmark}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                        {isPast ? "Passed" : `~${dest.etaMins} mins`}
                      </div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                        {dest.distKm} km
                      </div>
                      {dest.isAuthenticGoogle && (
                        <div className="text-[9px] text-blue-600 dark:text-blue-400 font-mono font-medium">
                          Google Road
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vehicle & Telematics Footer Summary */}
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
                <BusFront className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="font-bold text-zinc-900 dark:text-white">{displayBusNumber}</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {lastPingTime ? `Last Ping: ${lastPingTime.toLocaleTimeString()}` : "Awaiting Telematics Fix"}
                </div>
              </div>
            </div>

            <Link
              href="/portal"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black text-center font-bold text-xs transition-all active:scale-95 shadow-md"
            >
              Return to Commute Pass & Cockpit
            </Link>
          </div>
        </div>
      </div>

      {/* ─── 4. COMMUTER-CREW CONTACT SHEET MODAL ─── */}
      <ContactCrewModal
        isOpen={isContactCrewOpen}
        onClose={() => setIsContactCrewOpen(false)}
        bus={assignedBus}
        shift={null}
        route={assignedRoute}
        conductor={assignedConductor}
        transportManager={transportManagerStaff}
        stopName={commuterStop?.name}
      />
    </div>
  );
}
