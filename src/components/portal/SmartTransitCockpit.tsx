"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BusFront,
  MapPin,
  Clock,
  CheckCircle2,
  Navigation,
  QrCode,
  Layers,
  Settings,
  ChevronRight,
  X,
  Sparkles,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Lock,
  Unlock,
  Calendar,
  Moon,
  ArrowLeftRight,
  XCircle,
  ShieldAlert,
} from "lucide-react";
import { InteractiveBusSeatGrid } from "@/components/booking/InteractiveBusSeatGrid";
import { generateSeatLayout, getTeacherStartingSeats } from "@/lib/utils";
import { AttendanceLockCard } from "./AttendanceLockCard";
import LiveTrackerView from "./LiveTrackerView";
import type { Student, Bus, Stop, Shift, Trip, Booking, Route, TransportSettings, Staff } from "@/lib/types";

interface SmartTransitCockpitProps {
  student?: Student;
  user: any;
  buses: Bus[];
  stops: Stop[];
  shifts: Shift[];
  trips: Trip[];
  bookings: Booking[];
  routes: Route[];
  staff?: Staff[];
  students?: Student[];
  initialReservation?: any;
  initialSchedule?: any;
  onOpenLiveRadar?: () => void;
  onOpenDigitalPass?: () => void;
}

export default function SmartTransitCockpit({
  student,
  user,
  buses,
  stops,
  shifts,
  trips,
  bookings,
  routes,
  staff,
  students,
  initialReservation,
  initialSchedule,
  onOpenLiveRadar,
  onOpenDigitalPass,
}: SmartTransitCockpitProps) {
  // Navigation router
  const router = useRouter();

  // Reservation state - initialized immediately from SSR to eliminate skeleton wait time
  const [reservation, setReservation] = useState<any>(initialReservation || null);
  const [settings, setSettings] = useState<TransportSettings | null>(null);
  const [schedule, setSchedule] = useState<any>(initialSchedule || null);
  const [previousReservation, setPreviousReservation] = useState<any>(null);
  const [occupiedSeats, setOccupiedSeats] = useState<string[]>([]);
  const [isRfidVerified, setIsRfidVerified] = useState<boolean>(false);
  const [isLoadingReservation, setIsLoadingReservation] = useState(
    initialReservation === undefined && initialSchedule === undefined
  );

  // Seat attendance state
  const [isSavingSeat, setIsSavingSeat] = useState(false);
  const [tentativeSeat, setTentativeSeat] = useState<string | null>(() => initialReservation?.chosen_seat || null);
  const [isChangingSeat, setIsChangingSeat] = useState(false);
  const [isCancellingSeat, setIsCancellingSeat] = useState(false);
  const [isSwitchingSeat, setIsSwitchingSeat] = useState(false);

  // Modal for live bus radar
  const [isLiveRadarOpen, setIsLiveRadarOpen] = useState(false);

  // Cancel confirmation modal (replaces browser confirm())
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Toast notification (replaces browser alert())
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "warning" } | null>(null);
  const showToast = (text: string, type: "success" | "error" | "warning" = "error") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Real-time Attendance Lock (Distance / RFID) State
  const [attendanceLockStatus, setAttendanceLockStatus] = useState<"LOCKED" | "UNLOCKED">(() =>
    initialReservation?.lock_status === "UNLOCKED" ? "UNLOCKED" : "LOCKED"
  );
  const [isPeekingSeats, setIsPeekingSeats] = useState(false);
  const isLockCleared = attendanceLockStatus === "UNLOCKED" || isRfidVerified || reservation?.lock_status === "UNLOCKED";

  const studentId = student?.id || user?.studentId || user?.userId || user?.id;
  const isTeacher = Boolean(
    user?.role === "teacher" ||
    user?.role === "faculty" ||
    user?.role === "staff" ||
    user?.role === "admin" ||
    user?.role === "TEACHER" ||
    user?.role === "FACULTY" ||
    user?.role === "STAFF" ||
    user?.role === "ADMIN"
  );
  const settingsHref = isTeacher ? "/teacher/settings" : "/portal/settings";

  // Fetch Reservation & Settings
  const fetchReservation = async (silent = false) => {
    try {
      if (!silent && !reservation && !schedule?.isTodayOff && !schedule?.isAllShiftsOver) {
        setIsLoadingReservation(true);
      }
      const url = studentId
        ? `/api/students/attendance?studentId=${encodeURIComponent(studentId)}`
        : `/api/students/attendance`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setReservation(data.reservation);
        if (data.reservation?.chosen_seat) {
          setTentativeSeat(data.reservation.chosen_seat);
        } else {
          setTentativeSeat(null);
        }
        if (data.occupiedSeats) setOccupiedSeats(data.occupiedSeats);
        // Sync RFID and lock state from server (respects cancel rollback scoping)
        if (typeof data.isRfidVerified === "boolean") setIsRfidVerified(data.isRfidVerified);
        if (data.lockStatus) setAttendanceLockStatus(data.lockStatus === "UNLOCKED" ? "UNLOCKED" : "LOCKED");
        if (data.settings) setSettings(data.settings);
        if (data.schedule || data.teacherSchedule) setSchedule(data.schedule || data.teacherSchedule);
        if (data.previousReservation) setPreviousReservation(data.previousReservation);
      }
    } catch (e) {
      console.warn("Could not fetch smart transit reservation", e);
    } finally {
      setIsLoadingReservation(false);
    }
  };

  useEffect(() => {
    // If SSR provided initialReservation or initialSchedule, perform background sync quietly without showing skeleton
    fetchReservation(Boolean(initialReservation || initialSchedule));
  }, [studentId]);

  // Active booking scoped to today's active commute / reservation
  const activeBooking = useMemo(() => {
    if (!studentId) return null;
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const today = new Date(now.getTime() + istOffset).toISOString().split("T")[0];
    const utcToday = now.toISOString().split("T")[0];

    return (
      bookings.find(
        (b) =>
          (b.studentId === student?.id || b.studentId === studentId) &&
          (b.status === "CONFIRMED" || b.status === "BOARDED") &&
          (!reservation?.trip_id || b.tripId === reservation.trip_id) &&
          (b.bookingDate === today || b.bookingDate === utcToday || (b.createdAt && b.createdAt.startsWith(today)))
      ) || null
    );
  }, [bookings, student, studentId, reservation]);

  // Resolved bus entity (supports ?busId=xxx when scanning physical bus QR)
  const assignedBus = useMemo(() => {
    let queryBusId: string | null = null;
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        queryBusId = params.get("busId");
      } catch {}
    }
    const busId = queryBusId || reservation?.bus_id || activeBooking?.busId;
    if (!busId) return null;
    return buses.find((b) => b.id === busId) || reservation?.bus || null;
  }, [reservation, activeBooking, buses]);

  // Resolved stop entity
  const assignedStop = useMemo(() => {
    const stopId =
      reservation?.boarding_stop_id ||
      activeBooking?.boardingStopId ||
      student?.autoAssignedStopId ||
      student?.primaryStopId;
    if (!stopId) return null;
    return stops.find((s) => s.id === stopId) || reservation?.stop || null;
  }, [reservation, activeBooking, student, stops]);

  // Single Source of Truth: dynamically resolve shift from database shifts
  const assignedShift = useMemo(() => {
    // 1. If shifts prop has the shift matching reservation shift_id, prefer the latest from shifts prop (Source of Truth)
    const shiftId =
      reservation?.shift_id ||
      (reservation as any)?.shiftId ||
      reservation?.shift?.id ||
      (activeBooking as any)?.shiftId;

    if (shiftId) {
      const found = shifts.find((s) => s.id === shiftId);
      if (found) return found;
    }

    // 2. Check trip's shift if trip_id is present
    const tripId = reservation?.trip_id || activeBooking?.tripId;
    if (tripId) {
      const foundTrip = trips.find((t) => t.id === tripId);
      if (foundTrip?.shiftId) {
        const found = shifts.find((s) => s.id === foundTrip.shiftId);
        if (found) return found;
      }
    }

    // 3. Fallback to enriched reservation shift
    if (reservation?.shift) return reservation.shift;

    // 4. Dynamic fallback: Pick upcoming shift based on current time or first shift
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const upcoming = shifts.find((s) => {
      const parts = (s.startTime || "").split(":");
      const startMins = parseInt(parts[0] || "0", 10) * 60 + parseInt(parts[1] || "0", 10);
      return startMins >= currentMins;
    });
    return upcoming || shifts[0] || null;
  }, [reservation, activeBooking, shifts, trips]);

  // Derive trip status for conductor lock (Cancel blocked when IN_PROGRESS)
  const assignedTripStatus = useMemo(() => {
    const tripId = reservation?.trip_id || activeBooking?.tripId;
    if (!tripId) return null;
    const foundTrip = trips.find((t) => t.id === tripId);
    return foundTrip?.status || (foundTrip as any)?.trip_status || null;
  }, [reservation, activeBooking, trips]);
  const isTripInProgress = assignedTripStatus === "IN_PROGRESS" || assignedTripStatus === "COMPLETED";

  const assignedShiftName =
    assignedShift?.name ||
    (assignedShift as any)?.shift_name ||
    "Regular Transit Shift";

  const assignedShiftStartTime =
    assignedShift?.startTime ||
    (assignedShift as any)?.start_time ||
    "";

  const assignedShiftEndTime =
    assignedShift?.endTime ||
    (assignedShift as any)?.end_time ||
    "";

  const formatShiftTime = (timeStr?: string) => {
    if (!timeStr) return "";
    const clean = String(timeStr).trim();
    if (clean.toUpperCase().includes("AM") || clean.toUpperCase().includes("PM")) return clean;
    const parts = clean.split(":");
    const h = parseInt(parts[0], 10);
    const m = parts[1] || "00";
    if (isNaN(h)) return clean;
    const ampm = h >= 12 ? "PM" : "AM";
    const formattedH = h % 12 === 0 ? 12 : h % 12;
    return `${String(formattedH).padStart(2, "0")}:${m} ${ampm}`;
  };

  // Resolved confirmed seat number (from reservation or active booking)
  const confirmedSeatNumber = useMemo(() => {
    const rawSeat =
      reservation?.chosen_seat ||
      activeBooking?.seatNumber ||
      (activeBooking as any)?.seat_number;
    if (rawSeat && String(rawSeat).trim() !== "") {
      return String(rawSeat).trim();
    }
    return null;
  }, [reservation, activeBooking]);

  // Attendance status: marked ONLY when a valid seat number exists for today's commute
  const isAttendanceMarked = useMemo(() => {
    if (isChangingSeat) return false;
    // CRITICAL: Without a chosen seat number, student MUST remain on the seat selection page!
    // Prevents jumping directly to "Seat Confirmed" with missing seat data when refreshed.
    if (!confirmedSeatNumber) return false;

    if (
      reservation?.status === "BOARDED" ||
      reservation?.status === "SEAT_SELECTED" ||
      reservation?.status === "CONFIRMED" ||
      reservation?.status === "ASSIGNED"
    ) {
      return true;
    }
    if (activeBooking?.status === "BOARDED" || activeBooking?.status === "CONFIRMED") {
      return true;
    }
    return true;
  }, [reservation, activeBooking, isChangingSeat, confirmedSeatNumber]);

  // Dynamic Commute Schedule Resolution (NO HARDCODED DAYS - strictly follows timetable schedule):
  const isTodayOff = useMemo(() => {
    // 1. Direct flag on current schedule state
    if (schedule?.isTodayOff === true || schedule?.is_today_off === true) return true;
    // 2. Both shifts null/empty on schedule
    if (
      schedule &&
      !schedule.incomingShiftId &&
      !schedule.outgoingShiftId &&
      !schedule.incoming_shift_id &&
      !schedule.outgoing_shift_id
    ) {
      return true;
    }
    // 3. SSR initialSchedule fallback before client fetch completes
    if (initialSchedule?.isTodayOff === true || initialSchedule?.is_today_off === true) return true;
    if (
      initialSchedule &&
      !initialSchedule.incomingShiftId &&
      !initialSchedule.outgoingShiftId &&
      !initialSchedule.incoming_shift_id &&
      !initialSchedule.outgoing_shift_id
    ) {
      return true;
    }
    return false;
  }, [schedule, initialSchedule]);

  // Check if all commute shifts for today have concluded (ONLY FOR ACTIVE COMMUTE DAYS, NEVER ON OFF DAYS)
  const isAllShiftsOver = useMemo(() => {
    // If today is an off day, shifts are NOT over (there were none scheduled today)
    if (isTodayOff) return false;
    if (schedule?.isAllShiftsOver) return true;

    // Check IST time against fleet shift schedule
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const currentIstMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();

    let maxShiftEnd = 0;
    for (const s of (shifts || [])) {
      const parts = (s.endTime || (s as any).end_time || "").split(":");
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h)) {
        const total = h * 60 + (isNaN(m) ? 0 : m);
        if (total > maxShiftEnd) maxShiftEnd = total;
      }
    }

    if (maxShiftEnd > 0 && currentIstMinutes >= maxShiftEnd) {
      return true;
    }

    if (schedule?.isIncomingOver && schedule?.isOutgoingOver) {
      return true;
    }

    return false;
  }, [isTodayOff, schedule, shifts]);

  // Tomorrow morning shift details for preview
  const tomorrowMorningShift = useMemo(() => {
    return (
      shifts.find((s) => s.shiftType === "MORNING" || s.direction === "HOME_TO_CAMPUS") ||
      shifts[0] ||
      null
    );
  }, [shifts]);

  const tomorrowShiftStartTime =
    tomorrowMorningShift?.startTime ||
    (tomorrowMorningShift as any)?.start_time ||
    "07:15:00";

  const tomorrowPickupStop = assignedStop ? assignedStop.name : (student?.primaryStopId ? `Stop: ${student.primaryStopId}` : "Campus Stop");

  // Confirm Seat Selection & Mark Attendance
  const handleConfirmSeat = async (seatNumber: string) => {
    if (!seatNumber) return;
    if (!isLockCleared) {
      showToast("Attendance is currently locked for anti-proxy fraud prevention. Please tap 'Distance Unlock (<2m)' or tap your physical RFID card on the bus reader before confirming your seat.", "warning");
      return;
    }
    if (!isTeacher && assignedBus) {
      const teacherCount =
        typeof (assignedBus as any)?.teacherSeatsCount === "number"
          ? (assignedBus as any).teacherSeatsCount
          : typeof (assignedBus as any)?.teacher_seats_count === "number"
          ? (assignedBus as any).teacher_seats_count
          : 0;
      if (teacherCount > 0) {
        const allSeats = generateSeatLayout(assignedBus.capacity, assignedBus.seatLayout);
        const teacherSeats = getTeacherStartingSeats(allSeats, teacherCount);
        if (teacherSeats.includes(seatNumber)) {
          showToast(`The first ${teacherCount} starting seat${teacherCount !== 1 ? "s" : ""} on this bus are reserved for Faculty and Teachers. Please choose another seat.`, "warning");
          return;
        }
      }
    }
    setIsSavingSeat(true);
    try {
      // 1. Acquire current device GPS coordinates for live verification against moving bus
      let lat: number | undefined;
      let lng: number | undefined;
      if (typeof window !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 6000,
              maximumAge: 0,
            });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch (geoErr) {
          console.warn("GPS coordinates unavailable or permission denied:", geoErr);
        }
      }

      const res = await fetch("/api/students/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          reservationId: reservation?.id,
          seatNumber,
          latitude: lat,
          longitude: lng,
          verifyGps: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReservation(data.reservation);
        setTentativeSeat(seatNumber);
        setIsChangingSeat(false);
      } else {
        showToast(data.message || "Could not confirm seat & mark attendance.", "error");
      }
    } catch (e: any) {
      showToast("Error marking attendance: " + e.message, "error");
    } finally {
      setIsSavingSeat(false);
    }
  };

  // Cancel Seat Selection & Rollback Attendance (Atomic)
  // Opens the cancel confirmation modal instead of browser confirm()
  const handleCancelSeat = () => {
    if (!reservation?.id) return;
    if (isTripInProgress) {
      showToast("🚌 Trip is in progress — the bus has departed. You cannot cancel attendance after departure. You can still switch your seat.", "warning");
      return;
    }
    setShowCancelConfirm(true);
  };

  // Executes the actual cancel after modal confirmation
  const executeCancelSeat = async () => {
    if (!reservation?.id) return;
    setShowCancelConfirm(false);
    setIsCancellingSeat(true);
    try {
      const res = await fetch("/api/students/attendance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: reservation.id,
          studentId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Full atomic rollback: reset ALL local state to pre-boarding condition
        // Lock MUST re-engage — student must re-verify proximity/RFID to select again
        setReservation((prev: any) => ({
          ...prev,
          chosen_seat: null,
          seat_chosen_at: null,
          status: "ASSIGNED",
          boarded_at: null,
          lock_status: "LOCKED",
          unlocked_by: null,
          unlock_timestamp: null,
        }));
        setTentativeSeat(null);
        setIsChangingSeat(false);
        setAttendanceLockStatus("LOCKED");
        setIsRfidVerified(false);
        setIsPeekingSeats(false);
        showToast("Seat cancelled and attendance rolled back. You must re-verify to select again.", "success");
        // Delayed server refresh — allows DB + Redis transaction to fully settle
        // The GET handler will now correctly return lock_status=LOCKED & isRfidVerified=false
        setTimeout(() => fetchReservation(), 600);
      } else {
        showToast(data.message || "Could not cancel seat.", "error");
      }
    } catch (e: any) {
      showToast("Error cancelling seat: " + e.message, "error");
    } finally {
      setIsCancellingSeat(false);
    }
  };

  // Switch Seat (Atomic Swap via PATCH)
  const handleSwitchSeat = async (newSeatNumber: string) => {
    if (!reservation?.id || !newSeatNumber) return;
    if (newSeatNumber === reservation?.chosen_seat) {
      setIsChangingSeat(false);
      return;
    }
    setIsSwitchingSeat(true);
    try {
      const res = await fetch("/api/students/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: reservation.id,
          studentId,
          newSeatNumber,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReservation((prev: any) => ({
          ...prev,
          chosen_seat: newSeatNumber,
          seat_chosen_at: new Date().toISOString(),
        }));
        setTentativeSeat(newSeatNumber);
        setIsChangingSeat(false);
        // Refresh from server for occupied seats and reservation consistency
        fetchReservation();
      } else {
        showToast(data.message || "Could not switch seat.", "error");
      }
    } catch (e: any) {
      showToast("Error switching seat: " + e.message, "error");
    } finally {
      setIsSwitchingSeat(false);
    }
  };

  // ─── 0. HIGH-PERFORMANCE ZERO-CLS COMMUTE SKELETON ──────────────────
  if (isLoadingReservation) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          {/* Header pill skeleton */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div className="h-6 w-36 bg-slate-200 dark:bg-slate-800 rounded-full" />
            <div className="h-4 w-28 bg-slate-100 dark:bg-slate-800/60 rounded-md" />
          </div>

          {/* Title & subtitle skeleton */}
          <div className="space-y-3">
            <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded-xl" />
            <div className="h-4 w-96 max-w-full bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
          </div>

          {/* Metric cards grid skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-2"
              >
                <div className="h-3.5 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-5 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
              </div>
            ))}
          </div>

          {/* Live radar container placeholder */}
          <div className="h-56 rounded-2xl bg-slate-100/70 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 flex items-center justify-center">
                <BusFront className="w-5 h-5 animate-pulse" />
              </div>
              <span className="text-xs text-slate-400 font-medium">Syncing live transit telemetry...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── 0.4 TODAY IS SCHEDULED OFF (ACADEMIC TIMETABLE DAY OFF) ────────
  if (isTodayOff) {
    const todayName = schedule?.dayOfWeek || initialSchedule?.dayOfWeek || "Today";

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          {/* Top Status Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>No Bus Shifts Scheduled Today</span>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <span>Timetable Scheduled Off ({todayName})</span>
            </div>
          </div>

          {/* Greeting Headline */}
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>No Transit Scheduled for Today</span>
              <Sparkles className="w-6 h-6 text-amber-500 shrink-0" />
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Your academic timetable has no bus commute shifts scheduled for {todayName}. Enjoy your day off—CampusFleet will be ready to pick you up for your next scheduled academic commute!
            </p>
          </div>

          {/* Tomorrow's / Next Scheduled Commute Preview */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Next Scheduled Commute</span>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                Scheduled
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Departure Time</span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {formatShiftTime(tomorrowShiftStartTime) || "07:15 AM"}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>Pick-Up Stop</span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate" title={tomorrowPickupStop}>
                  {tomorrowPickupStop}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <BusFront className="w-3.5 h-3.5 text-slate-400" />
                  <span>Shift Type</span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {tomorrowMorningShift?.name || "Morning Academic Daily Shift"}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/portal/qr/show")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Show My QR Pass</span>
            </button>

            <button
              onClick={() => fetchReservation()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Schedule</span>
            </button>

            <Link
              href={settingsHref}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-medium transition-colors ml-auto"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── 0.5 TODAY'S COMMUTE CONCLUDED (ACTIVE DAY ALL SHIFTS OVER) ──
  // "if todays all shift are over show in my commute: thank you for today lets see tomorrow"
  if (isAllShiftsOver) {
    const todaySeat = reservation?.chosen_seat || tentativeSeat;
    const todayBusNumber = assignedBus?.busNumber || (assignedBus?.id ? `Bus #${assignedBus.id}` : "Assigned Bus");

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Main "Thank You for Today! See You Tomorrow" Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          {/* Top Status Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Today's Commute Concluded</span>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Moon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <span>All Shifts Completed</span>
            </div>
          </div>

          {/* Greeting Headline */}
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>Thank You for Today! See You Tomorrow</span>
              <Sparkles className="w-6 h-6 text-amber-500 shrink-0" />
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              All scheduled bus shifts for today have successfully concluded. Rest well tonight—CampusFleet will be ready to pick you up tomorrow morning!
            </p>
          </div>

          {/* Tomorrow's Morning Commute Preview */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Next Scheduled Commute</span>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                Scheduled
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Departure Time</span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {formatShiftTime(tomorrowShiftStartTime) || "07:15 AM"}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>Pick-Up Stop</span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate" title={tomorrowPickupStop}>
                  {tomorrowPickupStop}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <BusFront className="w-3.5 h-3.5 text-slate-400" />
                  <span>Shift Type</span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {tomorrowMorningShift?.name || "Morning Academic Daily Shift"}
                </div>
              </div>
            </div>
          </div>

          {/* Today's Commute Record (if attended) */}
          {todaySeat && (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-200">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Today's Ride Recorded on <strong>{todayBusNumber}</strong> (Seat: <strong>{todaySeat}</strong>)</span>
              </span>
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Attendance Completed ✓</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/portal/qr/show")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Show My QR Pass</span>
            </button>

            <button
              onClick={() => fetchReservation()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Commute Status</span>
            </button>

            <Link
              href={settingsHref}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-medium transition-colors ml-auto"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── 1. NO ASSIGNED BUS CURRENTLY ─────────────────────────────────
  if (!assignedBus) {
    return (
      <div className="space-y-6">
        {/* Clean "No Bus Assigned Currently" State */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 md:p-12 border border-slate-200/80 dark:border-slate-800 shadow-sm text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
            <BusFront className="w-8 h-8" />
          </div>

          <div className="space-y-2 max-w-md mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs font-bold">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Transit Status</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
              No Bus Assigned Currently
            </h2>
            <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              There is currently no transport vehicle assigned to your profile for today's commute. Your route administrator or automated allocator will assign a bus prior to departure.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => fetchReservation()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-sm active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check For Assignment</span>
            </button>
            <Link
              href={settingsHref}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 text-xs font-bold transition-all shadow-sm"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Review Home Stop in Settings</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── 2. BUS ASSIGNED, ATTENDANCE NOT YET MARKED ───────────────────
  // "show the seat attendance page to mark attendance that's it nothing else"
  if (!isAttendanceMarked) {
    return (
      <div className="space-y-6">
        {schedule?.isIncomingOver && previousReservation && (
          <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-xs flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-bold text-indigo-950 dark:text-indigo-200">
                Morning Shift Completed {previousReservation.chosen_seat ? `• Seat ${previousReservation.chosen_seat}` : ""}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
              Next Shift Assigned by Teacher: <strong className="text-indigo-600 dark:text-indigo-400">{assignedShiftName}</strong>
            </div>
          </div>
        )}

        {/* Assigned Bus Info Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
                <BusFront className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">
                  Assigned Bus Vehicle
                </span>
                <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">
                  {assignedBus.busNumber || `Bus #${assignedBus.id}`}
                </h2>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-pink-500" />
                <span className="font-semibold text-slate-900 dark:text-white">
                  {assignedStop ? assignedStop.name : "Assigned Pick-Up Stop"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>
                  {assignedShiftStartTime
                    ? `${formatShiftTime(assignedShiftStartTime)} Departure`
                    : "Scheduled Departure"}
                </span>
              </div>
            </div>
          </div>

          {/* Seat Attendance Interface (Nothing else) */}
          <div className="pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span>Mark Seat Attendance</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select your desired seat on the bus to record your commute attendance.
                </p>
              </div>

              {isChangingSeat && reservation?.chosen_seat && (
                <button
                  onClick={() => {
                    setIsChangingSeat(false);
                    setTentativeSeat(reservation.chosen_seat);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white self-start sm:self-auto"
                >
                  Cancel Change
                </button>
              )}
            </div>

            {/* Verified Attendance Banner (Above Seat Grid when unlocked) */}
            {isLockCleared && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    <strong>Attendance Security Cleared:</strong> Proximity verified. Select your seat below to record attendance.
                  </span>
                </div>
                <span className="font-bold text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 shrink-0">
                  UNLOCKED ✓
                </span>
              </div>
            )}

            {/* Embedded Interactive Seat Grid with Attendance Lock Layered Above */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div
                className={`p-2 sm:p-6 max-h-[460px] overflow-y-auto overflow-x-hidden flex justify-center transition-all duration-300 ${
                  !isLockCleared && !isPeekingSeats
                    ? "pointer-events-none select-none opacity-25 filter blur-[1px]"
                    : ""
                }`}
              >
                <InteractiveBusSeatGrid
                  bus={assignedBus}
                  activeBookings={
                    reservation?.trip_id
                      ? bookings.filter((b) => b.tripId === reservation.trip_id)
                      : []
                  }
                  occupiedSeats={occupiedSeats}
                  selectedSeat={tentativeSeat}
                  onSelectSeat={(seatNum) => {
                    if (!isLockCleared) {
                      setIsPeekingSeats(false);
                      return;
                    }
                    if (!isTeacher && assignedBus) {
                      const teacherCount =
                        typeof (assignedBus as any)?.teacherSeatsCount === "number"
                          ? (assignedBus as any).teacherSeatsCount
                          : typeof (assignedBus as any)?.teacher_seats_count === "number"
                          ? (assignedBus as any).teacher_seats_count
                          : 0;
                      if (teacherCount > 0) {
                        const allSeats = generateSeatLayout(assignedBus.capacity, assignedBus.seatLayout);
                        const teacherSeats = getTeacherStartingSeats(allSeats, teacherCount);
                        if (teacherSeats.includes(seatNum)) {
                          showToast(`Starting seats (first ${teacherCount} seats) on this bus are reserved for Faculty and Teachers. Please choose another seat.`, "warning");
                          return;
                        }
                      }
                    }
                    setTentativeSeat(seatNum);
                  }}
                  isTeacher={isTeacher}
                  userRole={user?.role}
                  teacherCount={
                    typeof (assignedBus as any)?.teacherSeatsCount === "number"
                      ? (assignedBus as any).teacherSeatsCount
                      : typeof (assignedBus as any)?.teacher_seats_count === "number"
                      ? (assignedBus as any).teacher_seats_count
                      : undefined
                  }
                />
              </div>

              {/* Attendance Lock Layered Directly Above Seat UI when Locked */}
              {!isLockCleared && !isPeekingSeats && (
                <div className="absolute inset-0 z-20 flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-[2px] transition-all">
                  <div className="w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                    <AttendanceLockCard
                      busId={assignedBus.id}
                      busNumber={assignedBus.busNumber}
                      gpsDeviceId={assignedBus.gpsDeviceId}
                      studentId={studentId}
                      onStatusChange={(status) => setAttendanceLockStatus(status)}
                      onUnlocked={() => {
                        setAttendanceLockStatus("UNLOCKED");
                        setIsPeekingSeats(false);
                      }}
                      onPeekSeats={() => setIsPeekingSeats(true)}
                    />
                  </div>
                </div>
              )}

              {/* Subtle floating banner when user is peeking at seats while still locked */}
              {!isLockCleared && isPeekingSeats && (
                <div className="absolute top-3 left-3 right-3 z-20 p-3 rounded-xl bg-slate-900/90 dark:bg-slate-950/95 text-white backdrop-blur-md shadow-lg flex items-center justify-between text-xs animate-in slide-in-from-top-2 border border-slate-700">
                  <div className="flex items-center gap-2 font-medium">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Seat Preview Mode (Attendance Verification Required to Confirm)</span>
                  </div>
                  <button
                    onClick={() => setIsPeekingSeats(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-xs transition-colors shrink-0 cursor-pointer"
                  >
                    Return to Unlock
                  </button>
                </div>
              )}
            </div>

            {/* Action Confirmation Bar */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                Selected Seat:{" "}
                <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm sm:text-base">
                  {tentativeSeat ? `Seat ${tentativeSeat}` : "Tap an available seat on the grid"}
                </span>
              </div>

              <button
                onClick={() => {
                  if (!tentativeSeat) return;
                  // Use atomic switch RPC when changing an existing seat,
                  // otherwise use the initial book RPC
                  if (isChangingSeat && reservation?.chosen_seat) {
                    handleSwitchSeat(tentativeSeat);
                  } else {
                    handleConfirmSeat(tentativeSeat);
                  }
                }}
                disabled={!tentativeSeat || isSavingSeat || isSwitchingSeat}
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-sm transition-all active:scale-95 cursor-pointer ${
                  !isLockCleared
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {!isLockCleared ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>
                  {isSwitchingSeat
                    ? "Switching Seat..."
                    : isSavingSeat
                    ? "Recording Attendance..."
                    : !isLockCleared
                    ? "Unlock Distance / RFID to Confirm Seat"
                    : isChangingSeat && reservation?.chosen_seat && tentativeSeat
                    ? `Switch to Seat ${tentativeSeat}`
                    : tentativeSeat
                    ? `Confirm Seat ${tentativeSeat} & Mark Attendance`
                    : "Select a Seat to Mark Attendance"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── 3. ATTENDANCE IS MARKED ──────────────────────────────────────
  // Show confirmed attendance summary + professional buttons for Digital QR and Live Bus Radar
  const displaySeatNumber = confirmedSeatNumber || tentativeSeat || "";

  return (
    <div className="space-y-6">
      {/* Confirmed Commute Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
              <BusFront className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">
                Assigned Bus Vehicle
              </span>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                {assignedBus.busNumber || `Bus #${assignedBus.id}`}
              </h2>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Attendance Verified</span>
          </span>
        </div>

        {/* Commute Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <MapPin className="w-4 h-4 text-pink-500" />
              <span>Your Pick-Up Stop</span>
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {assignedStop ? assignedStop.name : (student?.primaryStopId ? `Stop: ${student.primaryStopId}` : "Campus Stop")}
            </div>
            {assignedStop?.landmark && (
              <div className="text-[11px] text-slate-500 truncate">Near {assignedStop.landmark}</div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>Schedule / Shift</span>
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {assignedShiftName}
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
              {assignedShiftStartTime
                ? `${formatShiftTime(assignedShiftStartTime)} Departure`
                : "Scheduled Departure"}
              {assignedShiftEndTime ? ` • Arrive ${formatShiftTime(assignedShiftEndTime)}` : ""}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <Layers className="w-4 h-4 text-purple-500" />
              <span>Bus Specifications</span>
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {assignedBus?.model || "Campus Coach"}
            </div>
            <div className="text-[11px] text-slate-500">
              Reg: {assignedBus?.registrationNo || "MP-09-FA-2026"} • {assignedBus?.capacity || 40} Seats
            </div>
          </div>

          {/* Confirmed Seat Section */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2.5">
            <div className="text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between font-bold">
              <span>Confirmed Seat</span>
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                Marked ✓
              </span>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <div className="text-base font-black text-emerald-950 dark:text-emerald-200">
                {displaySeatNumber ? `Seat ${displaySeatNumber}` : "Seat Confirmed"}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setTentativeSeat(confirmedSeatNumber || reservation?.chosen_seat || null);
                    setIsChangingSeat(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold transition-all flex items-center gap-1"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  Switch
                </button>
                <button
                  onClick={handleCancelSeat}
                  disabled={isCancellingSeat || isTripInProgress}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                    isTripInProgress
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                      : "bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300"
                  }`}
                  title={isTripInProgress ? "Trip in progress or completed — cancel disabled" : "Cancel seat & rollback attendance"}
                >
                  <XCircle className="w-3 h-3" />
                  {isCancellingSeat ? "Cancelling..." : "Cancel"}
                </button>
              </div>
            </div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
              Attendance verified for today
            </div>

            {/* Conductor Lock Banner — Trip In Progress or Completed */}
            {isTripInProgress && (
              <div className="mt-1 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  <span className="font-bold">🚌 Bus has departed</span> — Attendance is locked by transit operations. You cannot cancel your seat, but you can switch to another available seat.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Professional Action Buttons: Show Digital QR & Live Bus Radar ─── */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Show Digital QR Button */}
          <button
            onClick={() => {
              if (onOpenDigitalPass) {
                onOpenDigitalPass();
              } else {
                router.push("/portal/qr/show");
              }
            }}
            className="flex items-center justify-between p-4 md:p-5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 transition-all text-left group active:scale-[0.99] shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 border border-pink-200/80 dark:border-pink-800/60 flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm md:text-base font-bold text-slate-900 dark:text-white">
                  Show My QR Pass
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Dynamic digital pass & conductor verification
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Live Bus Radar Button */}
          <button
            onClick={() => {
              if (onOpenLiveRadar) {
                onOpenLiveRadar();
              } else {
                setIsLiveRadarOpen(true);
              }
            }}
            className="flex items-center justify-between p-4 md:p-5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 transition-all text-left group active:scale-[0.99] shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                <Navigation className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm md:text-base font-bold text-slate-900 dark:text-white">
                  Live Bus Radar
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time GPS telematics & stop ETA tracker
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Footer Link to Settings */}
        <div className="pt-2 text-center sm:text-left">
          <Link
            href={settingsHref}
            className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
          >
            <span>Need to update your home address or submit a bus switch request? Go to Settings</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ─── MODAL: LIVE BUS RADAR ─────────────────────────────────── */}
      {isLiveRadarOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-5xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-in zoom-in-95 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Navigation className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Live Bus Radar
                </h3>
              </div>
              <button
                onClick={() => setIsLiveRadarOpen(false)}
                className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="h-[650px] overflow-hidden rounded-2xl">
              <LiveTrackerView
                initialUser={user}
                initialBuses={buses}
                initialRoutes={routes}
                initialStops={stops}
                initialTrips={trips}
                initialStaff={staff || []}
                initialStudents={students || []}
                isEmbedded={true}
                activeBooking={activeBooking}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CANCEL SEAT CONFIRMATION (replaces browser confirm()) ─── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 pb-8 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full sm:max-w-md p-6 border border-slate-200 dark:border-slate-800 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Cancel Seat & Rollback</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/50">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Your {displaySeatNumber ? <span className="font-bold">Seat {displaySeatNumber}</span> : <span className="font-bold">seat</span>} will be released and attendance rolled back.
                You will need to <span className="font-semibold text-amber-700 dark:text-amber-400">re-verify proximity or RFID</span> to select a new seat.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold transition-all cursor-pointer"
              >
                Keep Seat
              </button>
              <button
                onClick={executeCancelSeat}
                disabled={isCancellingSeat}
                className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isCancellingSeat ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Cancel Seat
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOAST NOTIFICATION (replaces browser alert()) ─── */}
      {toastMessage && (
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[110] w-[90%] max-w-md animate-in slide-in-from-bottom-4 duration-300">
          <div className={`px-5 py-4 rounded-2xl shadow-2xl border flex items-start gap-3 ${
            toastMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
              : toastMessage.type === "warning"
              ? "bg-amber-50 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200"
              : "bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-200"
          }`}>
            <div className="shrink-0 mt-0.5">
              {toastMessage.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : toastMessage.type === "warning" ? (
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
            </div>
            <p className="text-sm font-medium leading-relaxed flex-1">{toastMessage.text}</p>
            <button
              onClick={() => setToastMessage(null)}
              className="shrink-0 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
