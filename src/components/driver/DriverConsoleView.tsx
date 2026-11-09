"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Navigation,
  MapPin,
  Radio,
  Compass,
  Gauge,
  Play,
  Square,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Volume2,
  VolumeX,
  Bus,
  Signal,
  RefreshCw,
  PhoneCall,
  ExternalLink,
  ChevronRight,
  Activity,
  ArrowRight,
  Sparkles,
  Info,
  Search,
  Check,
  X,
  SlidersHorizontal,
  Sun,
  Moon,
  Users,
  Clock,
  Smartphone,
  ShieldAlert,
  Wrench,
  Flame,
  Award,
  Flag,
  Zap,
} from "lucide-react";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { useTheme } from "@/components/common/ThemeProvider";
import { telematicsService } from "@/lib/telematicsService";
import { store } from "@/lib/store";
import { calculateDistanceKm } from "@/lib/utils";
import type { Trip, Bus as BusType, Route, Booking, Stop, LiveBusLocation } from "@/lib/types";
import DriverLiveRadarView from "@/components/driver/DriverLiveRadarView";
import { DriverGateCameraConsole } from "@/components/driver/DriverGateCameraConsole";
import { estimateRouteStopTimings, type StopEstimate } from "@/lib/transit-timing";

interface DriverConsoleViewProps {
  initialUser?: any;
  initialDriverStaffId?: string | null;
  initialTrips: Trip[];
  initialBuses: BusType[];
  initialRoutes: Route[];
  initialBookings?: Booking[];
  initialStops?: Stop[];
}

export default function DriverConsoleView({
  initialUser,
  initialDriverStaffId,
  initialTrips,
  initialBuses,
  initialRoutes,
  initialBookings = [],
  initialStops = [],
}: DriverConsoleViewProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // ── 1. CORE DRIVER & DUTY STATE ───────────────────────────────────────────
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [buses] = useState<BusType[]>(initialBuses);
  const [routes] = useState<Route[]>(initialRoutes);
  const [stops] = useState<Stop[]>(initialStops);
  const [bookings] = useState<Booking[]>(initialBookings);
  const [isRadarOpen, setIsRadarOpen] = useState(false);

  const effectiveDriverId = initialUser?.userId || initialDriverStaffId || initialUser?.id || "";

  // Identify trip assigned specifically to this logged-in driver
  const myAssignedTrip = useMemo(() => {
    return (
      initialTrips.find(
        (t) =>
          (t.driverId === effectiveDriverId || (initialDriverStaffId && t.driverId === initialDriverStaffId)) &&
          t.status === "IN_PROGRESS"
      ) ||
      initialTrips.find(
        (t) =>
          t.driverId === effectiveDriverId || (initialDriverStaffId && t.driverId === initialDriverStaffId)
      )
    );
  }, [initialTrips, effectiveDriverId, initialDriverStaffId]);

  // Active Trip Resolution (persisted per device session, prioritized to this driver)
  const [selectedTripId, setSelectedTripId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("campusfleet_driver_trip_id");
        if (saved && initialTrips.some((t) => t.id === saved)) return saved;
      } catch {}
    }
    if (myAssignedTrip) return myAssignedTrip.id;
    const running = initialTrips.find((t) => t.status === "IN_PROGRESS");
    return running?.id || initialTrips[0]?.id || "";
  });

  const activeTrip = useMemo(() => {
    return trips.find((t) => t.id === selectedTripId) || trips[0] || null;
  }, [trips, selectedTripId]);

  // Duty Bus Selection & Switching State (independent per driver device)
  const [selectedBusId, setSelectedBusId] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("campusfleet_driver_duty_bus");
        if (saved) {
          const num = Number(saved);
          if (initialBuses.some((b) => b.id === num)) return num;
        }
      } catch {}
    }
    if (myAssignedTrip?.busId) return myAssignedTrip.busId;
    const currentTrip = initialTrips.find((t) => t.id === selectedTripId);
    return currentTrip?.busId || initialTrips[0]?.busId || initialBuses[0]?.id || 2;
  });
  const [showBusSwitchModal, setShowBusSwitchModal] = useState(false);
  const [busSearchQuery, setBusSearchQuery] = useState("");

  const bus = useMemo(() => {
    if (selectedBusId) {
      const found = buses.find((b) => b.id === selectedBusId);
      if (found) return found;
    }
    if (!activeTrip?.busId) return buses[0] || null;
    return buses.find((b) => b.id === activeTrip.busId) || buses[0] || null;
  }, [buses, selectedBusId, activeTrip]);

  const route = useMemo(() => {
    if (!activeTrip?.routeId) return routes[0] || null;
    return routes.find((r) => r.id === activeTrip.routeId) || routes[0] || null;
  }, [routes, activeTrip]);

  // Active transit shift (for scheduled timetable comparison)
  const activeShift = useMemo(() => {
    if (!activeTrip?.shiftId) return null;
    try {
      const allShifts = store.getShifts();
      return allShifts.find((s) => s.id === activeTrip.shiftId) || null;
    } catch {
      return null;
    }
  }, [activeTrip?.shiftId]);

  // Timing estimate mode: "DEPART_NOW" (live rolling ETA from current time/GPS) vs "SCHEDULED" (shift timetable)
  const [timingMode, setTimingMode] = useState<"DEPART_NOW" | "SCHEDULED">("DEPART_NOW");

  // ── 2. HARDWARE SENSORS: SPEEDOMETER, GYROSCOPE & ACCELEROMETER ───────────
  const [isBroadcasting, setIsBroadcasting] = useState(true);
  const [hasRealGpsLock, setHasRealGpsLock] = useState(false);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [gpsStatusText, setGpsStatusText] = useState("Awaiting Satellite Lock");
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Motion Sensor State (Gyroscope & Pitch/Roll)
  const [gyroSupported, setGyroSupported] = useState<boolean | null>(null);
  const [gyroPermissionNeeded, setGyroPermissionNeeded] = useState(false);
  const [gyroHeadingDeg, setGyroHeadingDeg] = useState<number | null>(null);
  const [roadInclineDeg, setRoadInclineDeg] = useState<number>(0); // beta (pitch)
  const [corneringSwayDeg, setCorneringSwayDeg] = useState<number>(0); // gamma (roll)
  const [drivingSmoothness, setDrivingSmoothness] = useState<"SMOOTH" | "HARSH_BRAKE" | "ACCEL">("SMOOTH");

  // GPS Coordinates & Hardware Speedometer Readings
  const [currentCoords, setCurrentCoords] = useState<{
    latitude: number;
    longitude: number;
    speedKmh: number;
    headingDeg: number;
    accuracy?: number;
  }>({
    latitude: 29.0222,
    longitude: 79.4897,
    speedKmh: 0,
    headingDeg: 0,
    accuracy: 10,
  });

  const lastCoordsRef = useRef<{ latitude: number; longitude: number; time: number } | null>(null);
  const realDeviceGpsRef = useRef<{
    latitude: number;
    longitude: number;
    speedKmh: number;
    headingDeg: number;
    accuracy?: number;
  } | null>(null);

  const lastAutoAdvancedStopIdRef = useRef<string | null>(null);
  const lastAnnouncedStopIdRef = useRef<string | null>(null);
  const wakeLockRef = useRef<any>(null);

  // ── AUDIO & HAPTIC FEEDBACK ───────────────────────────────────────────────
  const triggerHaptic = useCallback((pattern: number | number[] = 150) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }, []);

  const playChime = useCallback((frequency = 523.25, duration = 0.25) => {
    if (!isAudioEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, [isAudioEnabled]);

  const speakNextStop = useCallback((stopName: string) => {
    if (!isAudioEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const text = `Next stop: ${stopName}. Please prepare for passengers.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }, [isAudioEnabled]);

  // ── 3. SCREEN WAKE LOCK (PREVENTS PHONE FROM SLEEPING IN BUS CRADLE) ───────
  useEffect(() => {
    const isDriving = activeTrip?.status === "IN_PROGRESS";
    if (!isDriving || typeof window === "undefined" || !("wakeLock" in navigator)) {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
        setWakeLockActive(false);
      }
      return;
    }

    const requestWakeLock = async () => {
      try {
        const lock = await (navigator as any).wakeLock.request("screen");
        wakeLockRef.current = lock;
        setWakeLockActive(true);
        lock.addEventListener("release", () => {
          setWakeLockActive(false);
        });
      } catch (err) {
        console.warn("Screen WakeLock failed:", err);
      }
    };

    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && activeTrip?.status === "IN_PROGRESS") {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
        setWakeLockActive(false);
      }
    };
  }, [activeTrip?.status]);

  // ── 4. GYROSCOPE & ORIENTATION SENSORS ────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("DeviceOrientationEvent" in window)) {
      setGyroSupported(false);
      return;
    }

    setGyroSupported(true);

    if (typeof (DeviceOrientationEvent as any)?.requestPermission === "function") {
      setGyroPermissionNeeded(true);
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // 1. Heading (Compass Bearing)
      let heading: number | null = null;
      if (typeof (e as any).webkitCompassHeading === "number") {
        heading = Math.round((e as any).webkitCompassHeading);
      } else if (e.alpha != null) {
        heading = Math.round(360 - e.alpha) % 360;
      }
      if (heading != null) {
        setGyroHeadingDeg(heading);
      }

      // 2. Pitch (Road Gradient / Incline: Uphill vs Downhill)
      if (e.beta != null) {
        setRoadInclineDeg(Math.round(e.beta));
      }

      // 3. Roll (Vehicle Lateral Lean / Cornering Sway)
      if (e.gamma != null) {
        setCorneringSwayDeg(Math.round(e.gamma));
      }
    };

    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.acceleration || e.accelerationIncludingGravity;
      if (!acc) return;
      const y = acc.y ?? 0;
      if (y < -3.8) {
        setDrivingSmoothness("HARSH_BRAKE");
        setTimeout(() => setDrivingSmoothness("SMOOTH"), 2500);
      } else if (y > 3.8) {
        setDrivingSmoothness("ACCEL");
        setTimeout(() => setDrivingSmoothness("SMOOTH"), 2000);
      }
    };

    window.addEventListener("deviceorientation", handleOrientation, true);
    window.addEventListener("devicemotion", handleMotion, true);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
      window.removeEventListener("devicemotion", handleMotion, true);
    };
  }, []);

  const handleRequestGyroPermission = async () => {
    if (typeof window !== "undefined" && typeof (DeviceOrientationEvent as any)?.requestPermission === "function") {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === "granted") {
          setGyroPermissionNeeded(false);
          setToastMessage("✓ Motion sensors & digital compass active!");
          playChime(659.25, 0.2);
          setTimeout(() => setToastMessage(null), 3000);
        } else {
          setToastMessage("Motion sensor access was not granted");
          setTimeout(() => setToastMessage(null), 3000);
        }
      } catch (err) {
        console.warn("DeviceOrientation permission error:", err);
      }
    }
  };

  // ── 5. BROADCAST LOCATION TO REDIS & PASSENGER APPS ───────────────────────
  const pushDriverCoordinates = useCallback((coords: {
    latitude: number;
    longitude: number;
    speedKmh?: number;
    headingDeg?: number;
    accuracy?: number;
  }, immediate = false) => {
    if (!bus?.id) return;
    const currentStopId = route?.stops?.[activeTrip?.currentStopIndex || 0]?.stopId;
    const nextStopId = route?.stops?.[(activeTrip?.currentStopIndex || 0) + 1]?.stopId;

    const effectiveHeading = gyroHeadingDeg ?? coords.headingDeg ?? 0;

    const payload: LiveBusLocation = {
      busId: bus.id,
      busNumber: bus.busNumber,
      driverId: effectiveDriverId,
      driverName: initialUser?.name || "Driver",
      accuracy: coords.accuracy,
      tripId: activeTrip?.id || "",
      latitude: coords.latitude,
      longitude: coords.longitude,
      speedKmh: coords.speedKmh ?? 0,
      headingDeg: effectiveHeading,
      currentStopId,
      nextStopId,
      estimatedArrivalNextStopMins: 2,
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
  }, [bus, activeTrip, route, gyroHeadingDeg, effectiveDriverId, initialUser?.name, hasRealGpsLock]);

  // ── 6. CONTINUOUS HIGH-PRECISION GPS & SPEEDOMETER WATCH ─────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGpsStatusText("GPS Unavailable");
      return;
    }

    const handlePos = (pos: GeolocationPosition) => {
      const { latitude, longitude, speed, heading, accuracy } = pos.coords;
      const now = Date.now();

      // Compute speed in km/h from hardware GPS (m/s * 3.6)
      let speedKmh = 0;
      if (speed != null && !isNaN(speed) && speed >= 0) {
        speedKmh = Math.round(speed * 3.6);
      } else if (lastCoordsRef.current) {
        // Fallback speed from distance / time delta
        const prev = lastCoordsRef.current;
        const timeDiffSec = (now - prev.time) / 1000;
        if (timeDiffSec > 0.5 && timeDiffSec < 15) {
          const distKm = calculateDistanceKm(prev.latitude, prev.longitude, latitude, longitude);
          const computed = Math.round((distKm / (timeDiffSec / 3600)));
          if (computed >= 0 && computed < 130) {
            speedKmh = computed;
          }
        }
      }

      lastCoordsRef.current = { latitude, longitude, time: now };

      const effectiveHeading = gyroHeadingDeg ?? (heading && !isNaN(heading) ? Math.round(heading) : 0);
      const acc = Math.round(accuracy);
      const reading = { latitude, longitude, speedKmh, headingDeg: effectiveHeading, accuracy: acc };

      realDeviceGpsRef.current = reading;
      setCurrentCoords(reading);
      setHasRealGpsLock(true);
      setGpsAccuracyMeters(acc);
      setGpsStatusText(`Connected (±${acc}m)`);

      // Gentle haptic alert if speed exceeds safe transit threshold (>48 km/h)
      if (speedKmh > 48) {
        triggerHaptic([80, 50, 80]);
      }

      if (isBroadcasting) {
        pushDriverCoordinates(reading);
      }
    };

    const handleErr = (err: GeolocationPositionError) => {
      console.warn("GPS watch position notice:", err.message);
      setGpsStatusText("Searching GPS Signal");
    };

    const watchId = navigator.geolocation.watchPosition(handlePos, handleErr, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 6000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isBroadcasting, pushDriverCoordinates, gyroHeadingDeg, triggerHaptic]);

  // ── 7. NEXT STOP PROGRESSION & PASSENGER DEMAND ───────────────────────────
  const currentStopIndex = activeTrip?.currentStopIndex || 0;
  const currentStopObj = route?.stops?.[currentStopIndex]?.stop;
  const nextStopObj = route?.stops?.[currentStopIndex + 1]?.stop;
  const totalStopsCount = route?.stops?.length || 0;

  // Calculate distance to current stop
  const distanceToCurrentStopMeters = useMemo(() => {
    if (!currentStopObj || !currentCoords) return null;
    const distKm = calculateDistanceKm(
      currentCoords.latitude,
      currentCoords.longitude,
      currentStopObj.latitude,
      currentStopObj.longitude
    );
    return Math.round(distKm * 1000);
  }, [currentCoords, currentStopObj]);

  // Passengers booked / boarding at current stop
  const currentStopPassengers = useMemo(() => {
    if (!currentStopObj || !bookings) return 0;
    return bookings.filter(
      (b) => b.boardingStopId === currentStopObj.id && b.status !== "CANCELLED"
    ).length;
  }, [currentStopObj, bookings]);

  // Passenger boarding counts across all corridor stops
  const stopPassengerCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (!bookings) return map;
    for (const b of bookings) {
      if (b.status === "CANCELLED" || !b.boardingStopId) continue;
      const count = map.get(b.boardingStopId) || 0;
      map.set(b.boardingStopId, count + 1);
    }
    return map;
  }, [bookings]);

  // Dynamic Google Maps-style stop timings (depart now or scheduled timetable)
  const stopEstimates = useMemo(() => {
    if (!route?.stops || route.stops.length === 0) return [];
    return estimateRouteStopTimings(route.stops, {
      currentCoords,
      activeStopIndex: currentStopIndex,
      baseScheduledTime: activeShift?.startTime,
      departNow: timingMode === "DEPART_NOW" || !activeShift?.startTime,
    });
  }, [route?.stops, currentCoords, currentStopIndex, activeShift?.startTime, timingMode]);

  // Auto-advance station when entering 150m geofence radius
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== "IN_PROGRESS" || !currentStopObj) return;

    // Trigger voice announcer when within 250m
    if (
      distanceToCurrentStopMeters !== null &&
      distanceToCurrentStopMeters <= 250 &&
      lastAnnouncedStopIdRef.current !== currentStopObj.id
    ) {
      lastAnnouncedStopIdRef.current = currentStopObj.id;
      speakNextStop(currentStopObj.name);
    }

    // Auto-advance station at 150m
    if (
      distanceToCurrentStopMeters !== null &&
      distanceToCurrentStopMeters <= 150 &&
      lastAutoAdvancedStopIdRef.current !== currentStopObj.id
    ) {
      lastAutoAdvancedStopIdRef.current = currentStopObj.id;
      playChime(659.25, 0.35);
      triggerHaptic(200);
      setToastMessage(`Arrived at ${currentStopObj.name}`);

      const nextIdx = currentStopIndex + 1;
      if (nextIdx < totalStopsCount) {
        setTrips((prev) =>
          prev.map((t) => (t.id === activeTrip.id ? { ...t, currentStopIndex: nextIdx } : t))
        );
        store.updateTrip(activeTrip.id, { currentStopIndex: nextIdx });
      }
    }
  }, [
    distanceToCurrentStopMeters,
    activeTrip,
    currentStopObj,
    currentStopIndex,
    totalStopsCount,
    playChime,
    speakNextStop,
    triggerHaptic,
  ]);

  // ── 8. TRIP CONTROLS: START / ADVANCE / FINISH ────────────────────────────
  const handleStartTrip = async () => {
    if (!activeTrip) return;
    const startedAt = new Date().toISOString();

    setTrips((prev) =>
      prev.map((t) => (t.id === activeTrip.id ? { ...t, status: "IN_PROGRESS", startedAt, currentStopIndex: 0 } : t))
    );

    await store.updateTrip(activeTrip.id, {
      status: "IN_PROGRESS",
      startedAt,
      currentStopIndex: 0,
    });

    setIsBroadcasting(true);

    const startingStop = route?.stops?.[0]?.stop;
    const initialCoords = (hasRealGpsLock && realDeviceGpsRef.current)
      ? realDeviceGpsRef.current
      : startingStop
      ? {
          latitude: startingStop.latitude,
          longitude: startingStop.longitude,
          speedKmh: 0,
          headingDeg: 0,
          accuracy: 5,
        }
      : currentCoords;

    setCurrentCoords(initialCoords);
    pushDriverCoordinates(initialCoords, true);

    playChime(523.25, 0.35);
    triggerHaptic([100, 50, 100]);
    setToastMessage(`Trip Started! Broadcasting Bus ${bus?.busNumber} location.`);
    setTimeout(() => setToastMessage(null), 3500);

    if (currentStopObj) {
      speakNextStop(currentStopObj.name);
    }
  };

  const handleAdvanceStop = async () => {
    if (!activeTrip || !route?.stops) return;
    const nextIdx = currentStopIndex + 1;

    if (nextIdx < totalStopsCount) {
      const targetStop = route.stops[nextIdx].stop;
      setTrips((prev) =>
        prev.map((t) => (t.id === activeTrip.id ? { ...t, currentStopIndex: nextIdx } : t))
      );
      await store.updateTrip(activeTrip.id, { currentStopIndex: nextIdx });

      // Immediate location update to target stop coordinates
      const advanceCoords = targetStop
        ? {
            latitude: targetStop.latitude,
            longitude: targetStop.longitude,
            speedKmh: 24,
            headingDeg: gyroHeadingDeg ?? 45,
            accuracy: 8,
          }
        : currentCoords;

      setCurrentCoords(advanceCoords);
      pushDriverCoordinates(advanceCoords, true);

      playChime(587.33, 0.25);
      triggerHaptic(120);
      setToastMessage(`Now heading to: ${targetStop?.name || `Stop ${nextIdx + 1}`}`);
      setTimeout(() => setToastMessage(null), 3000);

      if (targetStop?.name) {
        speakNextStop(targetStop.name);
      }
    }
  };

  const handleEndTrip = async () => {
    if (!activeTrip) return;
    if (confirm("Are you sure you want to finish this trip and stop broadcasting?")) {
      const completedAt = new Date().toISOString();
      setTrips((prev) =>
        prev.map((t) => (t.id === activeTrip.id ? { ...t, status: "COMPLETED", completedAt } : t))
      );
      await store.updateTrip(activeTrip.id, { status: "COMPLETED", completedAt });

      playChime(440.0, 0.35);
      triggerHaptic([150, 100, 150]);
      setToastMessage("Trip completed. Great job!");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Switch duty vehicle
  const handleSwitchBus = async (newBusId: number) => {
    if (!newBusId) return;
    const targetBus = buses.find((b) => b.id === newBusId);
    if (!targetBus) return;

    setSelectedBusId(newBusId);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("campusfleet_driver_duty_bus", String(newBusId));
      } catch {}
    }

    // 1. Find if a trip exists for this specific bus (each bus has its own dedicated trips)
    const tripForNewBus =
      trips.find((t) => t.busId === newBusId && t.status === "IN_PROGRESS") ||
      trips.find((t) => t.busId === newBusId && t.status === "SCHEDULED") ||
      trips.find((t) => t.busId === newBusId);

    const driverIdToSet = initialUser?.userId || initialDriverStaffId || initialUser?.id || "";

    if (tripForNewBus) {
      // Switch driver to the trip for THIS bus — DO NOT overwrite someone else's trip busId!
      setSelectedTripId(tripForNewBus.id);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("campusfleet_driver_trip_id", tripForNewBus.id);
        } catch {}
      }
      if (driverIdToSet) {
        setTrips((prev) =>
          prev.map((t) => (t.id === tripForNewBus.id ? { ...t, driverId: driverIdToSet } : t))
        );
        await store.updateTrip(tripForNewBus.id, { driverId: driverIdToSet });
      }
    } else if (activeTrip && (activeTrip.driverId === driverIdToSet || !activeTrip.driverId)) {
      // Only mutate activeTrip's busId if this trip is strictly assigned to this driver or unassigned
      setTrips((prev) =>
        prev.map((t) => (t.id === activeTrip.id ? { ...t, busId: newBusId } : t))
      );
      await store.updateTrip(activeTrip.id, { busId: newBusId });
    }

    const currentTripToBroadcast = tripForNewBus || activeTrip;

    const coordsToBroadcast = realDeviceGpsRef.current || currentCoords;
    if (coordsToBroadcast) {
      const currentStopId = route?.stops?.[currentTripToBroadcast?.currentStopIndex || 0]?.stopId;
      const payload: LiveBusLocation = {
        busId: newBusId,
        busNumber: targetBus.busNumber,
        driverId: driverIdToSet,
        driverName: initialUser?.name || "Driver",
        tripId: currentTripToBroadcast?.id || "",
        latitude: coordsToBroadcast.latitude,
        longitude: coordsToBroadcast.longitude,
        speedKmh: coordsToBroadcast.speedKmh ?? 0,
        headingDeg: gyroHeadingDeg ?? coordsToBroadcast.headingDeg ?? 0,
        accuracy: coordsToBroadcast.accuracy,
        currentStopId,
        estimatedArrivalNextStopMins: 2,
        delayMinutes: 0,
        lastPingAt: new Date().toISOString(),
        source: "driver_console",
      };
      store.updateLiveLocation(payload);
      telematicsService.pushLiveLocationNow(payload).catch(() => {});
    }

    playChime(659.25, 0.25);
    setToastMessage(`Switched to Bus ${targetBus.busNumber}`);
    setShowBusSwitchModal(false);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Cardinal direction from heading degrees
  const effectiveHeading = gyroHeadingDeg ?? currentCoords.headingDeg;
  const cardinalHeading = useMemo(() => {
    const directions = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];
    return directions[Math.round(effectiveHeading / 45) % 8];
  }, [effectiveHeading]);

  const shortCardinal = useMemo(() => {
    const short = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return short[Math.round(effectiveHeading / 45) % 8];
  }, [effectiveHeading]);

  // Road incline classification (human wording)
  const inclineDescription = useMemo(() => {
    if (roadInclineDeg > 5) return `Uphill (+${roadInclineDeg}°)`;
    if (roadInclineDeg < -5) return `Downhill (${roadInclineDeg}°)`;
    return "Level Road";
  }, [roadInclineDeg]);

  // Speed evaluation
  const speed = currentCoords.speedKmh;
  const speedStatus = useMemo(() => {
    if (speed === 0) return { label: "Stopped", color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800" };
    if (speed <= 40) return { label: "Safe Speed", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/60" };
    if (speed <= 50) return { label: "Caution (40+)", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/60" };
    return { label: "Slow Down!", color: "text-rose-700 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/60" };
  }, [speed]);

  // Filtered fleet buses for modal
  const filteredBuses = useMemo(() => {
    const q = busSearchQuery.trim().toLowerCase();
    if (!q) return buses;
    return buses.filter(
      (b) =>
        String(b.busNumber).includes(q) ||
        (b.registrationNo && b.registrationNo.toLowerCase().includes(q)) ||
        (b.model && b.model.toLowerCase().includes(q))
    );
  }, [buses, busSearchQuery]);

  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen w-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-28 font-sans select-none transition-colors duration-200">
      {/* ── UNIFIED APP HEADER ────────────────────────────────────────── */}
      <UnifiedAppHeader
        role="driver"
        portalTitle="Driver Cockpit"
        portalSubtitle={bus ? `Bus ${bus.busNumber} • Live Navigation` : "Driver Portal"}
        customActions={
          <div className="flex items-center gap-2">
            {/* Quick Day / Night Switch */}
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs"
              title={isDark ? "Switch to Day Mode (Light)" : "Switch to Night Mode (Dark)"}
              aria-label="Toggle display day/night mode"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            {/* Audio Voice Announcements Mute/Unmute */}
            <button
              type="button"
              onClick={() => {
                const nextState = !isAudioEnabled;
                setIsAudioEnabled(nextState);
                if (nextState) playChime(659.25, 0.2);
              }}
              className={`p-2.5 rounded-xl border transition-all shadow-xs ${
                isAudioEnabled
                  ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                  : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400"
              }`}
              title={isAudioEnabled ? "Voice announcements ON" : "Voice announcements MUTED"}
              aria-label="Toggle voice stop announcements"
            >
              {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Emergency SOS Button */}
            <button
              type="button"
              onClick={() => setShowSosModal(true)}
              className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              title="Emergency Assistance"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>SOS</span>
            </button>
          </div>
        }
      />

      {/* ── TOAST NOTIFICATION ────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold rounded-2xl shadow-xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4">
          <Sparkles className="w-4 h-4 text-amber-400 dark:text-amber-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── MAIN DRIVER COCKPIT ───────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* 1. DUTY STATUS & QUICK VEHICLE SELECTOR STRIP */}
        <section className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 border ${
                activeTrip?.status === "IN_PROGRESS"
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700"
              }`}
            >
              <Bus className="w-7 h-7" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Bus {bus?.busNumber || "Duty"}
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    activeTrip?.status === "IN_PROGRESS"
                      ? "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                  }`}
                >
                  {activeTrip?.status === "IN_PROGRESS" ? "● ON DUTY" : "READY"}
                </span>
                {wakeLockActive && (
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900">
                    Screen Kept Awake
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                {route?.name || "Campus Transit Route"} {bus?.registrationNo ? `• ${bus.registrationNo}` : ""}
              </p>
            </div>
          </div>

          {/* Quick Vehicle Switch Button */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowBusSwitchModal(true)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95 shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Change Bus</span>
            </button>
          </div>
        </section>

        {/* ── AUTONOMOUS BIOMETRIC DUAL-GATE CAMERA TELEMATICS ── */}
        <DriverGateCameraConsole
          busId={bus?.id || 40}
          busNumber={String(bus?.busNumber || "40")}
          tripId={activeTrip?.id}
          capacity={bus?.capacity || 50}
          currentStopName={currentStopObj?.name || "Campus Terminal"}
          latitude={realDeviceGpsRef.current?.latitude ?? currentCoords.latitude}
          longitude={realDeviceGpsRef.current?.longitude ?? currentCoords.longitude}
          filterRouteId={route?.id ? String(route.id) : undefined}
        />

        {/* 2. SPEEDOMETER & MOTION SENSORS COCKPIT */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* SPEEDOMETER CLUSTER */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Vehicle Speed</span>
              </span>

              {/* Speed Limit Sign Badge */}
              <div
                className="w-9 h-9 rounded-full border-2 border-rose-600 bg-white dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-900 dark:text-white shadow-xs"
                title="Campus Speed Limit: 40 km/h"
              >
                40
              </div>
            </div>

            {/* Giant Speed Display */}
            <div className="py-6 text-center">
              <div className="inline-flex items-baseline justify-center gap-1.5">
                <span
                  className={`text-7xl sm:text-8xl font-black font-mono tracking-tight leading-none ${
                    speed > 50
                      ? "text-rose-600 dark:text-rose-400"
                      : speed > 40
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-slate-900 dark:text-white"
                  }`}
                >
                  {speed}
                </span>
                <span className="text-base sm:text-lg font-bold text-slate-500 dark:text-slate-400 uppercase font-sans">
                  km/h
                </span>
              </div>

              {/* Speed Status Badge */}
              <div className="mt-3">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${speedStatus.bg} ${speedStatus.color}`}>
                  {speedStatus.label}
                </span>
              </div>
            </div>

            {/* Clean Linear Speed Progress Gauge */}
            <div className="space-y-1.5">
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    speed > 50
                      ? "bg-rose-600"
                      : speed > 40
                      ? "bg-amber-500"
                      : "bg-emerald-600"
                  }`}
                  style={{ width: `${Math.min(100, (speed / 60) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                <span>0 km/h</span>
                <span>Limit: 40 km/h</span>
                <span>60 km/h</span>
              </div>
            </div>
          </div>

          {/* GYROSCOPE, HEADING & ROAD INCLINE CLUSTER */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Orientation & Road Sensors</span>
              </span>

              <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
                {gpsStatusText}
              </span>
            </div>

            {/* Compass Dial & Heading */}
            <div className="py-4 flex items-center justify-around gap-4">
              {/* Compass Needle Visual */}
              <div className="relative w-24 h-24 rounded-full border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0 shadow-inner">
                <span className="absolute top-1 text-[10px] font-black text-rose-600 dark:text-rose-400 font-mono">N</span>
                <span className="absolute right-1 text-[10px] font-bold text-slate-400 font-mono">E</span>
                <span className="absolute bottom-1 text-[10px] font-bold text-slate-400 font-mono">S</span>
                <span className="absolute left-1 text-[10px] font-bold text-slate-400 font-mono">W</span>

                {/* Rotating needle */}
                <div
                  className="w-full h-full flex items-center justify-center transition-transform duration-300 ease-out"
                  style={{ transform: `rotate(${effectiveHeading}deg)` }}
                >
                  <Navigation className="w-8 h-8 text-rose-600 dark:text-rose-400 fill-rose-600/30" />
                </div>
                <div className="absolute w-2 h-2 rounded-full bg-slate-900 dark:bg-white" />
              </div>

              {/* Heading Text */}
              <div className="space-y-1">
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {shortCardinal} • {effectiveHeading}°
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  Heading {cardinalHeading}
                </p>
                {gyroSupported && (
                  <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                    Gyroscope Active
                  </span>
                )}
              </div>
            </div>

            {/* Incline & Cornering Tilt Badges */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-center">
                <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Road Grade</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                  {inclineDescription}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-center">
                <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Ride Stability</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                  {drivingSmoothness === "HARSH_BRAKE" ? (
                    <span className="text-rose-600 dark:text-rose-400">Braking</span>
                  ) : drivingSmoothness === "ACCEL" ? (
                    <span className="text-amber-600 dark:text-amber-400">Accelerating</span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">Smooth Ride</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. NEXT STOP NAVIGATION CARD (GIANT & GLANCEABLE) */}
        {currentStopObj && (
          <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-blue-600 dark:border-blue-500 shadow-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider">
                    Next Stop ({currentStopIndex + 1} of {totalStopsCount})
                  </span>
                  {currentStopPassengers > 0 && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                      <Users className="w-3.5 h-3.5" />
                      <span>{currentStopPassengers} passengers waiting</span>
                    </span>
                  )}
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <MapPin className="w-6 h-6 text-blue-600 shrink-0" />
                  <span>{currentStopObj.name}</span>
                </h2>

                {currentStopObj.landmark && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium pl-8">
                    {currentStopObj.landmark}
                  </p>
                )}
              </div>

              {/* Distance Countdown */}
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center min-w-[150px] shrink-0">
                <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Distance</div>
                <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {distanceToCurrentStopMeters !== null
                    ? distanceToCurrentStopMeters >= 1000
                      ? `${(distanceToCurrentStopMeters / 1000).toFixed(1)} km`
                      : `${distanceToCurrentStopMeters} m`
                    : "--"}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">To Bus Stop</div>
              </div>
            </div>
          </section>
        )}

        {/* 5. PRIMARY DRIVER TACTICAL BUTTONS (HUGE GLOVE-FRIENDLY BUTTONS) */}
        <section className="space-y-3">
          {activeTrip?.status !== "IN_PROGRESS" ? (
            <button
              type="button"
              onClick={handleStartTrip}
              className="w-full h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-lg flex items-center justify-center gap-3 shadow-md transition-all cursor-pointer"
            >
              <Play className="w-6 h-6 fill-current" />
              <span>START ROUTE (SHARE LIVE BUS GPS)</span>
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Advance to Next Stop Button */}
              <button
                type="button"
                onClick={handleAdvanceStop}
                className="h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-base flex items-center justify-center gap-2.5 shadow-md transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {currentStopIndex + 1 < totalStopsCount
                    ? `ARRIVED • NEXT: ${nextStopObj?.name || `STOP ${currentStopIndex + 2}`}`
                    : "ARRIVED AT TERMINAL"}
                </span>
              </button>

              {/* Complete Trip Button */}
              <button
                type="button"
                onClick={handleEndTrip}
                className="h-16 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-98 text-white font-black text-base flex items-center justify-center gap-2.5 shadow-md transition-all cursor-pointer"
              >
                <Square className="w-5 h-5 fill-current" />
                <span>FINISH ROUTE</span>
              </button>
            </div>
          )}
        </section>

        {/* 6. VERTICAL ROUTE CORRIDOR TIMELINE WITH LIVE GOOGLE-MAPS ETAs */}
        {route?.stops && route.stops.length > 0 && (
          <section className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            {/* Header: Title, Active Stop Counter & Mode Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    Transit Corridor Sequence
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {route.stops.length} Stops
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>Stop {currentStopIndex + 1} of {totalStopsCount} Active</span>
                  <span>•</span>
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    {currentStopIndex === 0
                      ? "At Starting Point"
                      : currentStopIndex === totalStopsCount - 1
                      ? "Arriving Terminal"
                      : "Corridor in Transit"}
                  </span>
                </p>
              </div>

              {/* Timing Selector (Live ETA vs Scheduled Timetable) */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 self-start sm:self-auto text-xs">
                <button
                  type="button"
                  onClick={() => setTimingMode("DEPART_NOW")}
                  className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    timingMode === "DEPART_NOW"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                  title="Compute dynamic ETAs rolling from current time and live GPS"
                >
                  <Zap className="w-3 h-3" />
                  <span>Depart Now (Live ETA)</span>
                </button>
                {activeShift?.startTime && (
                  <button
                    type="button"
                    onClick={() => setTimingMode("SCHEDULED")}
                    className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      timingMode === "SCHEDULED"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    }`}
                    title={`Calculate timings anchored to shift start time (${activeShift.startTime})`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>Shift ({activeShift.startTime})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Smart Road Model Badge (if fallback estimation was used) */}
            {stopEstimates.some((e) => e.isEstimatedFromRoad) && (
              <div className="px-3 py-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 text-[11px] text-blue-800 dark:text-blue-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>Google Maps-style ETAs calculated via road distance & ~28 km/h speed profile.</span>
                </span>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Road Calibrated
                </span>
              </div>
            )}

            {/* Vertical Spine Timeline */}
            <div className="relative pl-7 sm:pl-8 space-y-3 pt-1">
              {/* Continuous Left Spine Rail */}
              <div className="absolute left-[13px] sm:left-[15px] top-3.5 bottom-6 w-0.5 bg-slate-200 dark:bg-slate-800" />

              {route.stops.map((rs, idx) => {
                const isPast = idx < currentStopIndex;
                const isCurrent = idx === currentStopIndex;
                const isLast = idx === totalStopsCount - 1;
                const est = stopEstimates[idx];
                const pickups = stopPassengerCounts.get(rs.stop?.id || "") || 0;

                return (
                  <div key={rs.stop?.id || idx} className="relative group">
                    {/* Spine Node Icon */}
                    <div
                      className={`absolute -left-7 sm:-left-8 top-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white dark:ring-slate-900 z-10 transition-transform ${
                        isCurrent
                          ? "bg-blue-600 text-white shadow-md scale-110 ring-blue-100 dark:ring-blue-900/60"
                          : isPast
                          ? "bg-emerald-500 text-white"
                          : isLast
                          ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-400 dark:border-indigo-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                      }`}
                    >
                      {isPast ? (
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : isCurrent ? (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                        </span>
                      ) : isLast ? (
                        <Flag className="w-3 h-3" />
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>

                    {/* Stop Card */}
                    {isCurrent ? (
                      // ACTIVE TARGET STATION CALLOUT CARD
                      <div className="p-3.5 sm:p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border-2 border-blue-500 shadow-sm transition-all">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider">
                                Next Target Stop
                              </span>
                              {pickups > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  <span>{pickups} to board</span>
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                              {rs.stop?.name || `Stop ${idx + 1}`}
                            </h4>
                            {rs.stop?.landmark && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                <span>{rs.stop.landmark}</span>
                              </p>
                            )}
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-blue-200/60 dark:border-blue-900/40 pt-2 sm:pt-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg font-black font-mono text-blue-700 dark:text-blue-300">
                                {est?.displayTime || "--:--"}
                              </span>
                              <span className="text-[10px] font-bold uppercase text-blue-500 dark:text-blue-400">
                                ETA
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                              {distanceToCurrentStopMeters !== null && (
                                <span className="font-mono text-slate-700 dark:text-slate-300">
                                  {(distanceToCurrentStopMeters / 1000).toFixed(1)} km away
                                </span>
                              )}
                              <span>•</span>
                              <span className="text-blue-600 dark:text-blue-400">
                                ~{est?.etaMinutesFromBus ?? est?.legMinutes ?? 0}m remaining
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : isPast ? (
                      // COMPLETED / PASSED STOP ROW
                      <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-3 opacity-60">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 line-through truncate">
                            {rs.stop?.name || `Stop ${idx + 1}`}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Passed
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-right shrink-0">
                          <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                            {est?.displayTime || "--:--"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      // UPCOMING CORRIDOR STOP ROW
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex items-center justify-between gap-3 shadow-2xs">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {rs.stop?.name || `Stop ${idx + 1}`}
                            </span>
                            {isLast && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                                Terminal
                              </span>
                            )}
                            {pickups > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                                <Users className="w-2.5 h-2.5" />
                                <span>+{pickups}</span>
                              </span>
                            )}
                          </div>
                          {rs.stop?.landmark && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                              {rs.stop.landmark}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-right shrink-0 font-mono">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {est?.displayTime || "--:--"}
                            </span>
                            {est && est.legMinutes > 0 && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                +{est.legMinutes}m
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 7. DRIVER ROLE CLARITY NOTICE */}
        <section className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200">Driver Focus: Navigation & Safe Driving</span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Keep phone mounted in cradle. Passenger QR tickets and RFID scans are handled by the bus conductor.
              </p>
            </div>
          </div>

          <Link
            href="/conductor"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold shrink-0 transition-colors"
          >
            <span>Conductor App</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </section>
      </main>

      {/* ── FLOATING LIVE MAP RADAR BUTTON (BOTTOM-RIGHT FAB) ─────────── */}
      <div className="fixed bottom-6 right-4 sm:right-6 z-40">
        <button
          type="button"
          onClick={() => setIsRadarOpen(true)}
          className="px-4 sm:px-5 py-3 sm:py-3.5 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center gap-2.5 shadow-2xl shadow-blue-600/40 border-2 border-white dark:border-slate-900 transition-all cursor-pointer group"
          title="Open Live Radar Navigation Map"
          aria-label="Open Live Radar Navigation Map"
        >
          <div className="relative flex items-center justify-center">
            <Navigation className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-white/20 transition-transform group-hover:rotate-45 duration-300" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <span className="tracking-tight">Live Map Radar</span>
        </button>
      </div>

      {/* ── FULLSCREEN LIVE RADAR NAVIGATION MODAL OVERLAY ───────────── */}
      {isRadarOpen && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-black animate-in fade-in duration-200 flex flex-col overflow-hidden">
          <DriverLiveRadarView
            initialUser={initialUser}
            initialDriverStaffId={initialDriverStaffId}
            activeTrip={activeTrip}
            route={route}
            bus={bus}
            shift={activeShift}
            allTrips={trips}
            allBuses={buses}
            allRoutes={routes}
            allStops={stops}
            bookings={bookings}
            externalCoords={currentCoords}
            hasRealGpsLock={hasRealGpsLock}
            onClose={() => setIsRadarOpen(false)}
            onTripUpdate={async (tripId, updates) => {
              setTrips((prev) =>
                prev.map((t) => (t.id === tripId ? { ...t, ...updates } : t))
              );
              await store.updateTrip(tripId, updates);
            }}
            onSwitchBus={handleSwitchBus}
          />
        </div>
      )}

      {/* ── EMERGENCY SOS MODAL ────────────────────────────────────────── */}
      {showSosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg">Emergency Driver Assistance</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Notify Campus Transport Control Room</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Select the emergency type. Your live GPS coordinates will be sent immediately to the campus dispatch control desk:
            </p>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setToastMessage("🚨 Mechanical breakdown reported to control room.");
                  setShowSosModal(false);
                }}
                className="w-full p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-800 dark:text-rose-200 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer text-left"
              >
                <Wrench className="w-4 h-4 shrink-0" />
                <span>Bus Breakdown / Mechanical Failure</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setToastMessage("🚨 Heavy traffic delay logged for student passes.");
                  setShowSosModal(false);
                }}
                className="w-full p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-800 dark:text-amber-200 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer text-left"
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span>Heavy Traffic Jam / Route Blockage</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setToastMessage("🚨 Medical assistance requested!");
                  setShowSosModal(false);
                }}
                className="w-full p-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-100 dark:bg-red-950 hover:bg-red-200 text-red-900 dark:text-red-200 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer text-left"
              >
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                <span>Medical Emergency / Road Accident</span>
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSosModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SWITCH DUTY BUS MODAL ────────────────────────────────────────── */}
      {showBusSwitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white space-y-4 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <Bus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base">Select Your Duty Bus</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Tap your active vehicle to broadcast live GPS</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBusSwitchModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busSearchQuery}
                onChange={(e) => setBusSearchQuery(e.target.value)}
                placeholder="Search bus number or plate..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Buses Grid / List */}
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {filteredBuses.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No fleet vehicles match &quot;{busSearchQuery}&quot;
                </div>
              ) : (
                filteredBuses.map((b) => {
                  const isCurrent = b.id === bus?.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => handleSwitchBus(b.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isCurrent
                          ? "bg-blue-50 dark:bg-blue-950/70 border-blue-500 shadow-xs"
                          : "bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                            isCurrent
                              ? "bg-blue-600 border-blue-500 text-white"
                              : "bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          <Bus className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              Bus {b.busNumber}
                            </span>
                            {b.status && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  b.status === "ACTIVE"
                                    ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                                    : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                                }`}
                              >
                                {b.status}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{b.registrationNo || b.model || "Transit Unit"}</span>
                            <span>•</span>
                            <span>{b.capacity} Seats</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        {isCurrent ? (
                          <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>CURRENT</span>
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                            Select →
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span>{buses.length} total buses in fleet</span>
              <button
                type="button"
                onClick={() => setShowBusSwitchModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
