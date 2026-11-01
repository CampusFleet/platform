"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { store } from "@/lib/store";
import { Trip, Bus, Route, Booking, Student, Stop, Shift, AttendanceRecord, HaltRequest } from "@/lib/types";

// Play subtle transit alert chime when new SOS request is received
function playTransitNotification(type: "sos" | "success" | "toggle") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === "sos") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === "success") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(784, ctx.currentTime); // G5
      osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.15); // C6
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    }
  } catch {
    // Ignore audio sandbox restrictions
  }
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
}

interface ConductorContextValue {
  currentUser: any;
  trips: Trip[];
  buses: Bus[];
  students: Student[];
  bookings: Booking[];
  stops: Stop[];
  routes: Route[];
  shifts: Shift[];
  attendanceRecords: AttendanceRecord[];
  haltRequests: HaltRequest[];

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

  selectedTripId: string;
  setSelectedTripId: (id: string) => void;
  showToast: (msg: string) => void;
  markAttendance: (studentId: string, status: "BOARDED" | "ABSENT" | "NO_SHOW", method?: string, notes?: string) => Promise<void>;
  refreshLiveState: () => Promise<void>;
  isSyncing: boolean;
}

const ConductorContext = createContext<ConductorContextValue | null>(null);

export function ConductorProvider({
  children,
  initialUser,
  initialTrips = [],
  initialBuses = [],
  initialRoutes = [],
  initialBookings = [],
  initialStops = [],
  initialShifts = [],
  initialStudents = [],
  initialAttendanceRecords = [],
}: any) {
  const [currentUser, setCurrentUser] = useState(initialUser || store.getCurrentUser());
  const [trips, setTrips] = useState<Trip[]>(() => initialTrips.length > 0 ? initialTrips : store.getTrips());
  const [buses, setBuses] = useState<Bus[]>(() => initialBuses.length > 0 ? initialBuses : store.getBuses());
  const [students, setStudents] = useState<Student[]>(() => initialStudents.length > 0 ? initialStudents : store.getStudents());
  const [bookings, setBookings] = useState<Booking[]>(() => initialBookings.length > 0 ? initialBookings : store.getBookings());
  const [stops, setStops] = useState<Stop[]>(() => initialStops.length > 0 ? initialStops : store.getStops());
  const [routes, setRoutes] = useState<Route[]>(() => initialRoutes.length > 0 ? initialRoutes : store.getRoutes());
  const [shifts, setShifts] = useState<Shift[]>(() => initialShifts.length > 0 ? initialShifts : store.getShifts());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() =>
    initialAttendanceRecords.length > 0 ? initialAttendanceRecords : store.getAttendanceRecords()
  );
  const [haltRequests, setHaltRequests] = useState<HaltRequest[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const prevHaltCountRef = useRef(0);

  // Sync with store on client mount
  useEffect(() => {
    if (initialStudents.length > 0 && store.getStudents().length === 0) {
      (store as any).students = initialStudents;
    }
  }, [initialStudents]);

  // Subscribe to local store mutations
  useEffect(() => {
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      setTrips(store.getTrips());
      setBuses(store.getBuses());
      setStudents(store.getStudents());
      setBookings(store.getBookings());
      setStops(store.getStops());
      setRoutes(store.getRoutes());
      setShifts(store.getShifts());
      setAttendanceRecords(store.getAttendanceRecords());
    });
    return unsub;
  }, []);

  // Filter visible trips
  const visibleTripsForConductor = trips.filter(t => {
    if (store.isTripSpecial(t)) {
      return Boolean(
        currentUser?.id &&
        (t.conductorId === currentUser.id || t.conductorId === currentUser.fullName)
      );
    }
    return true;
  });

  const myTrips = visibleTripsForConductor.filter(
    t =>
      t.conductorId === currentUser?.id ||
      t.conductorId === currentUser?.fullName
  );

  const activeTrip =
    visibleTripsForConductor.find(t => t.id === selectedTripId) ||
    myTrips.find(t => t.id === selectedTripId) ||
    myTrips[0] ||
    visibleTripsForConductor[0];

  const bus = buses.find(b => b.id === activeTrip?.busId) || buses[0];
  const route = routes.find(r => r.id === activeTrip?.routeId);
  const shift = shifts.find(sh => sh.id === activeTrip?.shiftId);

  // High-Frequency 4-Second Live Sync for Active Trip
  const refreshLiveState = useCallback(async () => {
    if (!activeTrip?.id) return;
    try {
      setIsSyncing(true);
      const res = await fetch(`/api/conductor/sync?tripId=${activeTrip.id}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.success) {
        if (Array.isArray(data.attendance)) {
          setAttendanceRecords(prev => {
            const merged = [...data.attendance];
            prev.forEach(p => {
              if (!merged.some(m => m.id === p.id)) {
                merged.push(p);
              }
            });
            return merged;
          });
        }

        if (Array.isArray(data.bookings) && data.bookings.length > 0) {
          setBookings(prev => {
            const updated = [...prev];
            data.bookings.forEach((b: any) => {
              const idx = updated.findIndex(u => u.id === b.id);
              if (idx >= 0) {
                updated[idx] = { ...updated[idx], ...b };
              } else {
                updated.push(b);
              }
            });
            return updated;
          });
        }

        if (Array.isArray(data.haltRequests)) {
          const pending = data.haltRequests.filter((r: any) => r.status === "PENDING").length;
          if (pending > prevHaltCountRef.current) {
            playTransitNotification("sos");
          }
          prevHaltCountRef.current = pending;
          setHaltRequests(data.haltRequests);
        }
      }
    } catch {
      // Silently catch network hiccups
    } finally {
      setIsSyncing(false);
    }
  }, [activeTrip?.id]);

  useEffect(() => {
    if (!activeTrip?.id) return;
    refreshLiveState();

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshLiveState();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeTrip?.id, refreshLiveState]);

  // Combined Authoritative Passenger Roster (Direct Bookings + Assigned Students + Roamers)
  const tripBookings: EnrichedPassenger[] = React.useMemo(() => {
    if (!activeTrip) return [];

    const tripId = activeTrip.id;
    const routeId = activeTrip.routeId;

    const tripAttendance = attendanceRecords.filter(a => a.tripId === tripId);
    const directBookings = bookings.filter(b => b.tripId === tripId);
    const routeStudents = students.filter(s => s.primaryRouteId === routeId);

    const studentMap = new Map<string, Student>();
    students.forEach(s => {
      if (s.id) studentMap.set(s.id, s);
      if (s.userId) studentMap.set(s.userId, s);
    });

    const rosterMap = new Map<string, EnrichedPassenger>();

    // 1. Process Direct Reservations from bookings_full
    directBookings.forEach(b => {
      const stud = studentMap.get(b.studentId);
      const att = tripAttendance.find(
        a => a.studentId === b.studentId || (stud && (a.studentId === stud.id || a.studentId === stud.userId))
      );

      let status: any = b.status || "CONFIRMED";
      if (att) {
        status = att.status;
      }

      const isBoarded = status === "BOARDED";
      const isAbsent = status === "ABSENT" || status === "NO_SHOW";
      const isWaitlisted = status === "WAITLISTED";

      const seatCode = b.seatNumber || (b as any).seat_number || (
        isWaitlisted
          ? (b.waitlistPosition ? `WL-${b.waitlistPosition}` : "WL")
          : "PASS"
      );

      const itemKey = b.studentId || b.id;
      rosterMap.set(itemKey, {
        id: b.id,
        bookingCode: b.bookingCode || `BK-${b.id.substring(0, 6)}`,
        studentId: b.studentId,
        tripId: b.tripId,
        busId: b.busId || activeTrip.busId,
        boardingStopId: b.boardingStopId || stud?.primaryStopId || "",
        seatNumber: seatCode,
        seatCode,
        status,
        isBoarded,
        isAbsent,
        isWaitlisted,
        waitlistPosition: b.waitlistPosition,
        passengerType: b.passengerType || "SEATED",
        roamingStatus: (b as any).roamingStatus || (stud && stud.primaryRouteId && stud.primaryRouteId !== routeId ? "ROAMING" : "CONFIRMED"),
        boardedAt: att?.timestamp || (b as any).boardedAt,
        unlockedBy: att?.method || (b as any).unlocked_by,
        student: stud,
        fullName: stud?.fullName || (b as any).passengerName || "Student Passenger",
        studentIdCode: stud?.studentIdCode || "",
        photoUrl: stud?.photoUrl || "",
        phone: stud?.phone || null,
        department: stud?.department || "",
        semester: stud?.semester || "",
        className: stud?.className || "",
        createdAt: b.createdAt || new Date().toISOString(),
      });
    });

    // 2. Process Route-assigned students (Guaranteed to be present for morning/evening shifts)
    routeStudents.forEach(s => {
      const itemKey = s.id;
      if (!rosterMap.has(itemKey)) {
        const att = tripAttendance.find(a => a.studentId === s.id || a.studentId === s.userId);
        const status: any = att ? att.status : "CONFIRMED";
        const isBoarded = status === "BOARDED";
        const isAbsent = status === "ABSENT" || status === "NO_SHOW";

        rosterMap.set(itemKey, {
          id: att?.id || `roster-${s.id}`,
          bookingCode: `ATD-${s.id.substring(0, 6)}`,
          studentId: s.id,
          tripId,
          busId: activeTrip.busId,
          boardingStopId: s.primaryStopId || "",
          seatNumber: "PASS",
          seatCode: "PASS",
          status,
          isBoarded,
          isAbsent,
          isWaitlisted: false,
          passengerType: "SEATED",
          roamingStatus: "CONFIRMED",
          boardedAt: att?.timestamp,
          unlockedBy: att?.method,
          student: s,
          fullName: s.fullName,
          studentIdCode: s.studentIdCode || "",
          photoUrl: s.photoUrl || "",
          phone: s.phone || null,
          department: s.department || "",
          semester: s.semester || "",
          className: s.className || "",
          createdAt: new Date().toISOString(),
        });
      }
    });

    // 3. Process Unexpected Attendees / Roamers who boarded
    tripAttendance.forEach(a => {
      const stud = studentMap.get(a.studentId);
      const itemKey = a.studentId;
      if (!rosterMap.has(itemKey)) {
        rosterMap.set(itemKey, {
          id: a.id,
          bookingCode: `ROAM-${a.studentId.substring(0, 6)}`,
          studentId: a.studentId,
          tripId,
          busId: activeTrip.busId,
          boardingStopId: stud?.primaryStopId || "",
          seatNumber: "ROAM",
          seatCode: "ROAM",
          status: a.status as any,
          isBoarded: a.status === "BOARDED",
          isAbsent: a.status === "ABSENT" || a.status === "NO_SHOW",
          isWaitlisted: false,
          passengerType: "STANDING_TILL_MERGE",
          roamingStatus: "ROAMING",
          boardedAt: a.timestamp,
          unlockedBy: a.method,
          student: stud,
          fullName: stud?.fullName || "Roaming Passenger",
          studentIdCode: stud?.studentIdCode || "",
          photoUrl: stud?.photoUrl || "",
          phone: stud?.phone || null,
          department: stud?.department || "",
          semester: stud?.semester || "",
          className: stud?.className || "",
          createdAt: a.timestamp,
        });
      }
    });

    return Array.from(rosterMap.values());
  }, [activeTrip, attendanceRecords, students, bookings]);

  const totalConfirmed = tripBookings.filter(b => b.status === "CONFIRMED" || b.status === "BOARDED").length;
  const boardedCount = tripBookings.filter(b => b.status === "BOARDED").length;
  const pendingCount = tripBookings.filter(b => b.status === "CONFIRMED").length;
  const waitlistCount = tripBookings.filter(b => b.status === "WAITLISTED").length;
  const absentCount = tripBookings.filter(b => b.status === "ABSENT" || b.status === "NO_SHOW").length;
  const roamingCount = tripBookings.filter(b => b.roamingStatus === "ROAMING").length;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // 1-Tap Attendance Handler with instant optimistic update
  const markAttendance = useCallback(
    async (
      studentId: string,
      status: "BOARDED" | "ABSENT" | "NO_SHOW",
      method: string = "MANUAL_SELECT",
      notes: string = "Conductor Desk 1-Tap Check"
    ) => {
      if (!activeTrip) return;
      playTransitNotification(status === "BOARDED" ? "success" : "toggle");

      const timestamp = new Date().toISOString();
      const newRecord: AttendanceRecord = {
        id: `att-${Date.now()}`,
        studentId,
        tripId: activeTrip.id,
        busId: activeTrip.busId,
        method: method as any,
        verifiedBy: currentUser?.fullName || "Conductor",
        status,
        timestamp,
        notes,
      };

      // 1. Optimistic Local Update
      setAttendanceRecords(prev => [newRecord, ...prev.filter(a => !(a.studentId === studentId && a.tripId === activeTrip.id))]);
      setBookings(prev =>
        prev.map(b => (b.studentId === studentId && b.tripId === activeTrip.id ? { ...b, status, boardedAt: timestamp } : b))
      );

      const stud = students.find(s => s.id === studentId || s.userId === studentId);
      const studentLabel = stud?.fullName || "Passenger";
      showToast(status === "BOARDED" ? `✓ Marked Boarded: ${studentLabel}` : `Updated status for ${studentLabel}: ${status}`);

      // 2. Persist to store & backend
      try {
        await store.recordAttendance(
          studentId,
          activeTrip.id,
          method as any,
          status,
          notes
        );
      } catch (err) {
        console.warn("recordAttendance error:", err);
      }
    },
    [activeTrip, currentUser?.fullName, showToast, students]
  );

  return (
    <ConductorContext.Provider
      value={{
        currentUser,
        trips: visibleTripsForConductor,
        buses,
        students,
        bookings,
        stops,
        routes,
        shifts,
        attendanceRecords,
        haltRequests,
        myTrips,
        activeTrip,
        bus,
        route,
        shift,
        tripBookings,
        totalConfirmed,
        boardedCount,
        pendingCount,
        waitlistCount,
        absentCount,
        roamingCount,
        selectedTripId,
        setSelectedTripId,
        showToast,
        markAttendance,
        refreshLiveState,
        isSyncing,
      }}
    >
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-full p-4 pointer-events-none">
          <div className="p-3.5 bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 rounded-2xl text-xs font-bold text-center animate-in fade-in slide-in-from-top-4 shadow-2xl flex items-center justify-center gap-2 backdrop-blur-md">
            <span>{toastMessage}</span>
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
