"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Trip, Bus, Route, Booking, Student, Stop, Shift, AttendanceRecord, HaltRequest } from "@/lib/types";
import type { CrewDuty, DutyPassenger, DutyTrip } from "@/lib/crew/duty";

/**
 * Conductor state. Single source: GET /api/crew/duty (the trip the transport manager assigned
 * to this conductor today, and its boarding chart). No bus choosing, no client store.
 */

function chime(type: "sos" | "success" | "toggle") {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const [from, to, len] = type === "sos" ? [587, 880, 0.35] : type === "success" ? [784, 1046, 0.25] : [659, 659, 0.12];
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + len * 0.6);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + len);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + len);
  } catch {}
}

export interface EnrichedPassenger extends Booking {
  student?: Student;
  fullName: string;
  studentIdCode: string;
  photoUrl: string;
  phone: string | null;
  department: string;
  semester: string;
  className: string;
  seatCode: string;
  isBoarded: boolean;
  isAbsent: boolean;
  isWaitlisted: boolean;
  boardedAt?: string;
  unlockedBy?: string;
  /** On today's chart but no seat yet (seat is chosen / assigned when boarding). */
  isUnseated: boolean;
  boardingStopName: string;
}

export interface BusDepartureAlert {
  id: string;
  tripId: string;
  busId?: string | number;
  alertType: string;
  message: string;
  triggeredAt: string;
  triggeredBy?: string;
  status: string;
}

interface ConductorContextValue {
  currentUser: any;
  duty: CrewDuty | null;
  loadError: string | null;
  trips: Trip[];
  buses: Bus[];
  students: Student[];
  bookings: Booking[];
  stops: Stop[];
  routes: Route[];
  shifts: Shift[];
  attendanceRecords: AttendanceRecord[];
  haltRequests: HaltRequest[];
  pendingHaltRequests: number;

  myTrips: Trip[];
  activeTrip?: Trip;
  bus?: Bus;
  route?: Route;
  shift?: Shift;
  tripBookings: EnrichedPassenger[];

  totalConfirmed: number;
  boardedCount: number;
  pendingCount: number;
  waitlistCount: number;
  absentCount: number;
  roamingCount: number;
  onboardConfirmedCount: number;
  runningCount: number;
  outsideCount: number;
  unseatedCount: number;

  activeDepartureAlert: BusDepartureAlert | null;
  triggerDepartureAlert: (customMessage?: string) => Promise<boolean>;
  dismissDepartureAlert: () => Promise<boolean>;

  selectedTripId: string;
  setSelectedTripId: (id: string) => void;
  showToast: (msg: string) => void;
  markAttendance: (studentId: string, status: "BOARDED" | "ABSENT" | "NO_SHOW", method?: string, notes?: string, seat?: string) => Promise<boolean>;
  refreshLiveState: () => Promise<void>;
  isSyncing: boolean;
}

const ConductorContext = createContext<ConductorContextValue | null>(null);

// ── Mapping the duty payload onto the shared domain types the tabs already use ──
export function toTrip(t: DutyTrip): Trip {
  return {
    id: t.id,
    tripCode: "",
    routeId: t.route?.id || "",
    busId: t.bus.id,
    shiftId: t.shift?.id || "",
    driverId: "",
    conductorId: "",
    tripDate: "",
    status: t.status as Trip["status"],
    startedAt: t.startedAt || undefined,
    completedAt: t.completedAt || undefined,
    delayMinutes: 0,
    manifestLocked: t.manifestLocked,
    currentStopIndex: t.currentStopIndex,
  };
}
export function toBus(t: DutyTrip): Bus {
  return {
    id: t.bus.id,
    busNumber: t.bus.busNumber,
    registrationNo: t.bus.registrationNo,
    model: "",
    capacity: t.bus.capacity,
    seatLayout: t.bus.seatLayout,
    totalRows: t.bus.totalRows ?? undefined,
    status: "ACTIVE" as Bus["status"],
    gpsDeviceId: "",
    insuranceExpiry: "",
    maintenanceDueDate: "",
    teacherSeatsCount: t.bus.teacherSeatsCount,
  };
}
export function toStops(t: DutyTrip): Stop[] {
  return (t.route?.stops || []).map((s) => ({
    id: s.stopId,
    name: s.name,
    code: "",
    latitude: s.latitude,
    longitude: s.longitude,
    landmark: "",
    geofenceRadiusMeters: 100,
  }));
}
export function toRoute(t: DutyTrip): Route | undefined {
  if (!t.route) return undefined;
  const stops = toStops(t);
  return {
    id: t.route.id,
    code: "",
    name: t.route.name,
    description: "",
    direction: (t.route.direction || "HOME_TO_CAMPUS") as Route["direction"],
    color: "#2563EB",
    isActive: true,
    totalDistanceKm: 0,
    estimatedDurationMins: 0,
    stops: t.route.stops.map((s, i) => ({
      stopId: s.stopId,
      stopOrder: s.order,
      arrivalOffsetMinutes: s.arrivalOffsetMinutes,
      bufferTimeMinutes: 0,
      stop: stops[i],
    })),
  };
}
function toShift(t: DutyTrip): Shift | undefined {
  if (!t.shift) return undefined;
  return {
    id: t.shift.id,
    name: t.shift.name,
    shiftType: "MORNING" as Shift["shiftType"],
    direction: t.shift.direction as Shift["direction"],
    startTime: t.shift.startTime,
    endTime: t.shift.endTime,
    bookingCutoffMins: t.shift.cutoffMinutes,
  };
}
function toStudent(p: DutyPassenger): Student {
  return {
    id: p.studentId,
    userId: p.studentId,
    fullName: p.fullName,
    email: "",
    phone: p.phone,
    department: "",
    semester: "",
    className: p.className,
    studentIdCode: p.studentIdCode,
    photoUrl: p.photoUrl,
    primaryStopId: p.boardingStopId,
  } as unknown as Student;
}
function toPassenger(p: DutyPassenger, trip: DutyTrip): EnrichedPassenger {
  const isBoarded = p.status === "BOARDED" || p.status === "ALIGHTED" || Boolean(p.boardedAt);
  const isAbsent = p.status === "ABSENT";
  // Tabs treat "CONFIRMED" as "on the chart, not boarded yet" (covers ASSIGNED / SEAT_SELECTED).
  const status = (isBoarded ? "BOARDED" : isAbsent ? "ABSENT" : "CONFIRMED") as Booking["status"];
  const seat = p.seat || undefined;
  return {
    id: p.reservationId,
    bookingCode: "",
    studentId: p.studentId,
    tripId: trip.id,
    busId: trip.bus.id,
    boardingStopId: p.boardingStopId,
    boardingStopName: p.boardingStopName,
    status,
    seatNumber: seat,
    seatCode: seat || (isBoarded ? "ONBOARD" : "NO SEAT"),
    passengerType: seat ? "SEATED" : "STANDING_TILL_MERGE",
    roamingStatus: (isBoarded ? "ONBOARD_CONFIRMED" : (p.roamingStatus as any) || "CONFIRMED") as Booking["roamingStatus"],
    boardedAt: p.boardedAt || undefined,
    unlockedBy: p.unlockedBy || undefined,
    createdAt: "",
    student: toStudent(p),
    fullName: p.fullName,
    studentIdCode: p.studentIdCode,
    photoUrl: p.photoUrl,
    phone: p.phone,
    department: "",
    semester: "",
    className: p.className,
    isBoarded,
    isAbsent,
    isWaitlisted: false,
    isUnseated: !seat && !isAbsent,
  };
}

export function ConductorProvider({
  children,
  initialUser,
  initialDuty,
}: {
  children: React.ReactNode;
  initialUser: any;
  initialDuty: CrewDuty | null;
}) {
  const [duty, setDuty] = useState<CrewDuty | null>(initialDuty);
  const [selectedTripId, setSelectedTripIdState] = useState(initialDuty?.trip?.id || "");
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const prevHalts = useRef(initialDuty?.pendingHaltRequests || 0);
  const selectedRef = useRef(selectedTripId);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const refreshLiveState = useCallback(async () => {
    setIsSyncing(true);
    try {
      const q = selectedRef.current ? `?tripId=${encodeURIComponent(selectedRef.current)}` : "";
      const res = await fetch(`/api/crew/duty${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not load your duty.");
      if (data.pendingHaltRequests > prevHalts.current) chime("sos");
      prevHalts.current = data.pendingHaltRequests;
      setDuty(data);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message || "Network error.");
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const setSelectedTripId = useCallback(
    (id: string) => {
      selectedRef.current = id;
      setSelectedTripIdState(id);
      void refreshLiveState();
    },
    [refreshLiveState]
  );

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refreshLiveState();
    const interval = setInterval(tick, 8000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshLiveState]);

  const derived = useMemo(() => {
    const t = duty?.trip || null;
    const tripBookings = t ? (duty?.manifest || []).map((p) => toPassenger(p, t)) : [];
    const attendanceRecords: AttendanceRecord[] = t
      ? (duty?.attendance || []).map((a) => ({
          id: a.id,
          studentId: a.studentId,
          tripId: t.id,
          busId: t.bus.id,
          method: a.method as AttendanceRecord["method"],
          verifiedBy: a.verifiedBy,
          status: a.status as AttendanceRecord["status"],
          timestamp: a.timestamp,
        }))
      : [];
    const onChart = tripBookings.filter((b) => !b.isAbsent);
    const boarded = tripBookings.filter((b) => b.isBoarded).length;
    const outside = onChart.filter((b) => !b.isBoarded).length;
    return {
      activeTrip: t ? toTrip(t) : undefined,
      bus: t ? toBus(t) : undefined,
      route: t ? toRoute(t) : undefined,
      shift: t ? toShift(t) : undefined,
      stops: t ? toStops(t) : [],
      myTrips: (duty?.trips || []).map(toTrip),
      tripBookings,
      students: tripBookings.map((b) => b.student!).filter(Boolean),
      attendanceRecords,
      totalConfirmed: onChart.length,
      boardedCount: boarded,
      pendingCount: outside,
      absentCount: tripBookings.filter((b) => b.isAbsent).length,
      roamingCount: tripBookings.filter((b) => b.roamingStatus === "ROAMING").length,
      runningCount: tripBookings.filter((b) => b.roamingStatus === "RUNNING_TO_BUS").length,
      outsideCount: outside,
      unseatedCount: tripBookings.filter((b) => b.isUnseated && !b.isBoarded).length,
    };
  }, [duty]);

  const markAttendance = useCallback(
    async (studentId: string, status: "BOARDED" | "ABSENT" | "NO_SHOW", method = "MANUAL_SELECT", _notes?: string, seat?: string) => {
      const tripId = duty?.trip?.id;
      if (!tripId) return false;
      chime(status === "BOARDED" ? "success" : "toggle");
      try {
        const res = await fetch("/api/crew/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId,
            studentId,
            status: status === "BOARDED" ? "BOARDED" : "ABSENT",
            method: method === "SEAT_MAP_SELECT" ? "SEAT_MAP_SELECT" : "MANUAL_SELECT",
            ...(seat ? { seat } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.error || "Could not save attendance.");
          return false;
        }
        const name = duty?.manifest.find((p) => p.studentId === studentId)?.fullName || "Student";
        showToast(status === "BOARDED" ? `✓ ${name} boarded${seat ? ` · Seat ${seat}` : ""}` : `${name} marked absent`);
        await refreshLiveState();
        return true;
      } catch {
        showToast("Network error. Try again.");
        return false;
      }
    },
    [duty, refreshLiveState, showToast]
  );

  const roaming = useCallback(
    async (body: Record<string, unknown>) => {
      const tripId = duty?.trip?.id;
      if (!tripId) return false;
      try {
        const res = await fetch("/api/boarding/roaming", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, tripId }),
        });
        const data = await res.json();
        await refreshLiveState();
        return Boolean(res.ok && data.success);
      } catch {
        return false;
      }
    },
    [duty?.trip?.id, refreshLiveState]
  );

  const triggerDepartureAlert = useCallback(
    async (message?: string) => {
      const ok = await roaming({ action: "TRIGGER_DEPARTURE_ALERT", message });
      if (ok) {
        chime("sos");
        showToast(`🚨 Departure alarm sent to ${derived.outsideCount} students outside the bus`);
      } else showToast("Could not send the departure alarm.");
      return ok;
    },
    [roaming, showToast, derived.outsideCount]
  );

  const dismissDepartureAlert = useCallback(async () => {
    const ok = await roaming({ action: "DISMISS_ALERT" });
    if (ok) showToast("Departure alarm stopped.");
    return ok;
  }, [roaming, showToast]);

  const t = duty?.trip;
  const value: ConductorContextValue = {
    currentUser: initialUser,
    duty,
    loadError,
    trips: derived.myTrips,
    buses: derived.bus ? [derived.bus] : [],
    students: derived.students,
    bookings: derived.tripBookings,
    stops: derived.stops,
    routes: derived.route ? [derived.route] : [],
    shifts: derived.shift ? [derived.shift] : [],
    attendanceRecords: derived.attendanceRecords,
    haltRequests: [],
    pendingHaltRequests: duty?.pendingHaltRequests || 0,
    myTrips: derived.myTrips,
    activeTrip: derived.activeTrip,
    bus: derived.bus,
    route: derived.route,
    shift: derived.shift,
    tripBookings: derived.tripBookings,
    totalConfirmed: derived.totalConfirmed,
    boardedCount: derived.boardedCount,
    pendingCount: derived.pendingCount,
    waitlistCount: 0,
    absentCount: derived.absentCount,
    roamingCount: derived.roamingCount,
    onboardConfirmedCount: derived.boardedCount,
    runningCount: derived.runningCount,
    outsideCount: derived.outsideCount,
    unseatedCount: derived.unseatedCount,
    activeDepartureAlert:
      duty?.departureAlert && t
        ? {
            id: duty.departureAlert.id,
            tripId: t.id,
            busId: t.bus.id,
            alertType: "MANUAL_RECALL",
            message: duty.departureAlert.message,
            triggeredAt: duty.departureAlert.triggeredAt,
            status: "ACTIVE",
          }
        : null,
    triggerDepartureAlert,
    dismissDepartureAlert,
    selectedTripId,
    setSelectedTripId,
    showToast,
    markAttendance,
    refreshLiveState,
    isSyncing,
  };

  return (
    <ConductorContext.Provider value={value}>
      {toast && (
        <div className="fixed top-[calc(env(safe-area-inset-top)+4.5rem)] inset-x-0 z-[100] flex justify-center px-4 pointer-events-none">
          <div className="max-w-sm w-full p-3.5 bg-emerald-950/95 border border-emerald-500/40 text-emerald-100 rounded-2xl text-xs font-bold text-center shadow-2xl">
            {toast}
          </div>
        </div>
      )}
      {children}
    </ConductorContext.Provider>
  );
}

export function useConductorContext() {
  const ctx = useContext(ConductorContext);
  if (!ctx) throw new Error("Missing ConductorProvider");
  return ctx;
}
