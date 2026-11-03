"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
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
  Radio,
  Zap,
  PhoneCall,
  ExternalLink,
  Footprints,
  Route as RouteIcon,
  Users,
  HeartHandshake,
} from "lucide-react";
import { InteractiveBusSeatGrid } from "@/components/booking/InteractiveBusSeatGrid";
import { generateSeatLayout, getTeacherStartingSeats } from "@/lib/utils";
import { AttendanceLockCard } from "./AttendanceLockCard";
import { telematicsService } from "@/lib/telematicsService";
import { ContactCrewModal } from "./ContactCrewModal";
import { SeatPartnerModal } from "./SeatPartnerModal";
import type { Student, Bus, Stop, Shift, Trip, Booking, Route, TransportSettings, Staff } from "@/lib/types";

// Dynamic import for CampusFleetMap with fallback
const CampusFleetMap = dynamic(() => import("@/components/maps/CampusFleetMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-72 rounded-3xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-col items-center gap-2 text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="text-xs font-medium">Loading Navigation Map...</span>
      </div>
    </div>
  ),
});

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

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


  // Cancel confirmation modal (replaces browser confirm())
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isContactCrewOpen, setIsContactCrewOpen] = useState(false);

  // Seat Preferences & Partner State
  const [isSeatPartnerModalOpen, setIsSeatPartnerModalOpen] = useState(false);
  const [seatPartnerData, setSeatPartnerData] = useState<{
    activePartnership: any | null;
    incomingRequests: any[];
    outgoingRequests: any[];
    rowPreference: string;
    positionPreference: string;
    partnerSeat: string | null;
    partnerName: string | null;
  }>({
    activePartnership: null,
    incomingRequests: [],
    outgoingRequests: [],
    rowPreference: "NO_PREFERENCE",
    positionPreference: "NO_PREFERENCE",
    partnerSeat: null,
    partnerName: null,
  });

  // Toast notification (replaces browser alert())
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "warning" } | null>(null);
  const showToast = (text: string, type: "success" | "error" | "warning" = "error") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  const renderToastNotification = () => {
    if (!toastMessage) return null;
    return (
      <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[110] w-[90%] max-w-md animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
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
    );
  };

  // Real-time Attendance Lock (Distance / RFID) State
  const [attendanceLockStatus, setAttendanceLockStatus] = useState<"LOCKED" | "UNLOCKED">(() =>
    initialReservation?.lock_status === "UNLOCKED" ? "UNLOCKED" : "LOCKED"
  );
  const [isPeekingSeats, setIsPeekingSeats] = useState(false);
  const isLockCleared = attendanceLockStatus === "UNLOCKED" || isRfidVerified || reservation?.lock_status === "UNLOCKED";

  // Live Telematics & Radar state
  const [telematicsLocation, setTelematicsLocation] = useState<any>(null);
  const [isTelematicsLive, setIsTelematicsLive] = useState(false);
  const [userGeoCoords, setUserGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isQuickUnlocking, setIsQuickUnlocking] = useState(false);

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
    const strId = String(busId).trim();
    return (
      buses.find((b) => String(b.id) === strId || String(b.busNumber) === strId) ||
      reservation?.bus ||
      reservation?.buses ||
      null
    );
  }, [reservation, activeBooking, buses]);

  // Resolved route entity for commuter context
  const assignedRoute = useMemo(() => {
    const routeId =
      reservation?.route_id ||
      (assignedBus as any)?.currentRouteId ||
      (activeBooking as any)?.routeId ||
      student?.primaryRouteId;
    if (routeId) {
      const match = routes.find((r) => r.id === routeId);
      if (match) return match;
    }
    const tripId = reservation?.trip_id || activeBooking?.tripId;
    if (tripId) {
      const foundTrip = trips.find((t) => t.id === tripId);
      if (foundTrip?.routeId) {
        const match = routes.find((r) => r.id === foundTrip.routeId);
        if (match) return match;
      }
    }
    return routes[0] || null;
  }, [reservation, assignedBus, activeBooking, student?.primaryRouteId, routes, trips]);

  // Resolved stop entity
  const assignedStop = useMemo(() => {
    const stopId =
      reservation?.boarding_stop_id ||
      activeBooking?.boardingStopId ||
      student?.autoAssignedStopId ||
      student?.primaryStopId;
    if (!stopId) return null;
    const strStopId = String(stopId).trim();
    return (
      stops.find((s) => String(s.id) === strStopId) ||
      reservation?.stop ||
      reservation?.stops ||
      null
    );
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

  const fetchSeatPartnerData = async () => {
    if (!studentId) return;
    try {
      const bId = assignedBus?.id || reservation?.bus_id;
      const busIdParam = bId ? `&busId=${encodeURIComponent(bId)}` : "";
      const sId = assignedShift?.id || reservation?.shift_id;
      const shiftIdParam = sId ? `&shiftId=${encodeURIComponent(sId)}` : "";
      const res = await fetch(`/api/students/seat-partner-requests?studentId=${encodeURIComponent(studentId)}${busIdParam}${shiftIdParam}`);
      const data = await res.json();
      if (data.success) {
        const active = data.activePartnership;
        let pSeat: string | null = null;
        let pName: string | null = null;
        if (active) {
          const isSender = active.sender_id === studentId;
          pName = isSender ? active.receiver_name : active.sender_name;
          if (active.allocated_pair) {
            pSeat = isSender ? active.allocated_pair.receiverSeat : active.allocated_pair.senderSeat;
          }
        }
        setSeatPartnerData((prev) => ({
          ...prev,
          activePartnership: active,
          incomingRequests: data.incomingRequests || [],
          outgoingRequests: data.outgoingRequests || [],
          partnerSeat: pSeat,
          partnerName: pName,
        }));
      }

      // Fetch preferences
      const prefRes = await fetch(`/api/students/seat-preferences?studentId=${encodeURIComponent(studentId)}`);
      const prefData = await prefRes.json();
      if (prefData.success && prefData.preferences) {
        setSeatPartnerData((prev) => ({
          ...prev,
          rowPreference: prefData.preferences.rowPreference || "NO_PREFERENCE",
          positionPreference: prefData.preferences.positionPreference || "NO_PREFERENCE",
        }));
      }
    } catch {
      // silent
    }
  };

  const handleQuickAcceptPartner = async (requestId: string) => {
    try {
      const res = await fetch("/api/students/seat-partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ACCEPT_REQUEST",
          requestId,
          studentId,
          busId: assignedBus?.id || reservation?.bus_id,
          shiftId: assignedShift?.id || reservation?.shift_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to accept partner request");
      showToast(data.message || "Seat partner request accepted! Adjacent seats allocated.", "success");
      fetchSeatPartnerData();
      fetchReservation(true);
    } catch (err: any) {
      showToast(err.message || "Failed to accept partner request", "error");
    }
  };

  useEffect(() => {
    fetchSeatPartnerData();
  }, [studentId, assignedBus?.id, reservation?.bus_id]);

  // Resolve assigned conductor and transport manager staff for contact modal
  const assignedConductor = useMemo(() => {
    if (!staff || staff.length === 0) return null;
    const tripId = reservation?.trip_id || activeBooking?.tripId;
    const foundTrip = tripId ? trips.find((t) => t.id === tripId) : null;
    if (foundTrip?.conductorId) {
      const match = staff.find(
        (s) => s.id === foundTrip.conductorId || s.userId === foundTrip.conductorId
      );
      if (match) return match;
    }
    return staff.find((s) => s.role === "conductor" || s.category === "CONDUCTORS") || null;
  }, [staff, trips, reservation?.trip_id, activeBooking?.tripId]);

  const transportManagerStaff = useMemo(() => {
    if (!staff || staff.length === 0) return null;
    return (
      staff.find(
        (s) =>
          s.role === "transport_manager" ||
          s.role === "transport_admin" ||
          s.category === "TRANSPORT_OPS"
      ) || null
    );
  }, [staff]);

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

  // ─── LIVE TELEMATICS SUBSCRIPTION & REAL-TIME GPS WATCH ───────────
  useEffect(() => {
    const busId = assignedBus?.id;
    if (!busId) return;

    let isMounted = true;
    const pollTelematics = async () => {
      try {
        const res = await fetch(`/api/telematics/live?busId=${encodeURIComponent(String(busId))}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.liveLocation) {
            setTelematicsLocation(data.liveLocation);
            setIsTelematicsLive(true);
          }
        }
      } catch {
        // silent
      }
    };

    pollTelematics();

    const unsub = telematicsService.subscribe((incoming) => {
      if (incoming && (String(incoming.busId) === String(busId) || incoming.busId === busId)) {
        if (isMounted) {
          setTelematicsLocation(incoming);
          setIsTelematicsLive(true);
        }
      }
    });

    telematicsService.startPolling(busId, 2500);

    return () => {
      isMounted = false;
      unsub();
      telematicsService.stopPolling();
    };
  }, [assignedBus?.id]);

  // Non-blocking browser GPS detection for proximity unlock & map centering
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
    );
  }, []);

  const busToStopDistMeters = useMemo(() => {
    if (!assignedStop?.latitude || !assignedStop?.longitude || !telematicsLocation?.latitude || !telematicsLocation?.longitude) {
      return null;
    }
    return calculateDistanceMeters(
      telematicsLocation.latitude,
      telematicsLocation.longitude,
      assignedStop.latitude,
      assignedStop.longitude
    );
  }, [assignedStop, telematicsLocation]);

  const busToUserDistMeters = useMemo(() => {
    if (!userGeoCoords?.lat || !userGeoCoords?.lng || !telematicsLocation?.latitude || !telematicsLocation?.longitude) {
      return null;
    }
    return calculateDistanceMeters(
      telematicsLocation.latitude,
      telematicsLocation.longitude,
      userGeoCoords.lat,
      userGeoCoords.lng
    );
  }, [userGeoCoords, telematicsLocation]);

  const liveEtaText = useMemo(() => {
    if (busToStopDistMeters === null) {
      return isTelematicsLive ? "Computing arrival..." : "Awaiting GPS Ping";
    }
    if (busToStopDistMeters < 60) return "At Your Pick-Up Stop • Board Now";
    if (busToStopDistMeters < 250) return "Arriving in ~1 min";
    const mins = Math.max(1, Math.round((busToStopDistMeters / 1000) / (25 / 60)));
    return `~${mins} mins (${busToStopDistMeters > 1000 ? `${(busToStopDistMeters / 1000).toFixed(1)} km` : `${busToStopDistMeters}m`})`;
  }, [busToStopDistMeters, isTelematicsLive]);

  // Effective User GPS / Residential Location for First-Mile Guidance
  const effectiveUserLat = userGeoCoords?.lat ?? (student as any)?.home_latitude ?? (student as any)?.homeLatitude ?? 29.220936;
  const effectiveUserLng = userGeoCoords?.lng ?? (student as any)?.home_longitude ?? (student as any)?.homeLongitude ?? 79.514496;

  const [hasArrivedAtStopManually, setHasArrivedAtStopManually] = useState(false);
  const [showSeatGridWhileWalking, setShowSeatGridWhileWalking] = useState(false);

  const userToStopDistMeters = useMemo(() => {
    if (!effectiveUserLat || !effectiveUserLng || !assignedStop?.latitude || !assignedStop?.longitude) {
      return null;
    }
    return calculateDistanceMeters(
      effectiveUserLat,
      effectiveUserLng,
      assignedStop.latitude,
      assignedStop.longitude
    );
  }, [effectiveUserLat, effectiveUserLng, assignedStop]);

  const isAtPickupStop = useMemo(() => {
    if (hasArrivedAtStopManually) return true;
    if (userToStopDistMeters !== null && userToStopDistMeters <= 60) return true;
    return false;
  }, [hasArrivedAtStopManually, userToStopDistMeters]);

  const walkingCoordinates = useMemo<[number, number][]>(() => {
    if (!effectiveUserLat || !effectiveUserLng || !assignedStop?.latitude || !assignedStop?.longitude) {
      return [];
    }
    return [
      [effectiveUserLat, effectiveUserLng],
      [assignedStop.latitude, assignedStop.longitude],
    ];
  }, [effectiveUserLat, effectiveUserLng, assignedStop]);

  const walkingEtaMins = useMemo(() => {
    if (!userToStopDistMeters) return 5;
    return Math.max(1, Math.round(userToStopDistMeters / 80));
  }, [userToStopDistMeters]);

  const busEtaMins = useMemo(() => {
    if (!busToStopDistMeters) return null;
    return Math.max(1, Math.round(busToStopDistMeters / 416));
  }, [busToStopDistMeters]);

  const arrivalCushionMins = useMemo(() => {
    if (busEtaMins === null) return null;
    return busEtaMins - walkingEtaMins;
  }, [busEtaMins, walkingEtaMins]);

  const googleMapsWalkingUrl = useMemo(() => {
    if (!assignedStop?.latitude || !assignedStop?.longitude) return null;
    const originStr = effectiveUserLat && effectiveUserLng ? `&origin=${effectiveUserLat},${effectiveUserLng}` : "";
    return `https://www.google.com/maps/dir/?api=1${originStr}&destination=${assignedStop.latitude},${assignedStop.longitude}&travelmode=walking`;
  }, [effectiveUserLat, effectiveUserLng, assignedStop]);

  const assignedDriverName = useMemo(() => {
    if (telematicsLocation?.driverName) return telematicsLocation.driverName;
    const foundDriver = staff?.find((s) => s.id === (activeBooking as any)?.driverId || s.id === "staff-drv-37" || s.role === "driver");
    return foundDriver?.fullName || "Assigned Fleet Driver";
  }, [telematicsLocation, staff, activeBooking]);

  const handleQuickProximityUnlock = async () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      showToast("Geolocation is not supported by your browser. Please enable GPS.", "error");
      return;
    }

    setIsQuickUnlocking(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0,
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const acc = position.coords.accuracy;

      if (!lat || !lng || (lat === 0 && lng === 0)) {
        showToast("Device GPS is turned off or has no satellite fix. Turn on Location services.", "error");
        setIsQuickUnlocking(false);
        return;
      }

      setUserGeoCoords({ lat, lng });

      const res = await fetch("/api/attendance/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "LOCATION_DISTANCE",
          latitude: lat,
          longitude: lng,
          accuracy: acc ? Math.round(acc) : undefined,
          busId: assignedBus?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Location Distance Unlock (<2m) failed. Approach the bus to unlock.", "error");
      } else {
        setAttendanceLockStatus("UNLOCKED");
        setIsPeekingSeats(false);
        showToast("✓ Proximity verified! Attendance security cleared. Choose your seat below.", "success");
        fetchReservation(true);
      }
    } catch (err: any) {
      showToast("GPS Error: " + (err.message || "Failed to acquire location"), "error");
    } finally {
      setIsQuickUnlocking(false);
    }
  };

  const renderLiveRadarLauncherBanner = () => {
    if (!assignedBus) return null;

    const displayBusNum = assignedBus.busNumber ? `Bus ${assignedBus.busNumber}` : `Bus #${assignedBus.id}`;

    return (
      <div className="space-y-3">
        {/* Clean Live Navigation Launcher Card (Google Maps Turn-by-Turn Mode) */}
        <div className="bg-white dark:bg-black rounded-3xl p-5 sm:p-6 border border-zinc-200 dark:border-zinc-800 shadow-md text-zinc-900 dark:text-white relative overflow-hidden animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-md">
                <Navigation className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase text-blue-600 dark:text-blue-400 tracking-wider">Live Bus Radar</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${isTelematicsLive ? "bg-emerald-500" : "bg-amber-500"}`} />
                    {isTelematicsLive ? "LIVE GPS STREAM" : "GPS READY"}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white mt-0.5">
                  Tracking {displayBusNum} on Route
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {telematicsLocation?.speedKmh ? `${telematicsLocation.speedKmh} km/h • ` : ""}
                  {liveEtaText ? `ETA: ${liveEtaText} • ` : ""}
                  Fullscreen turn-by-turn multi-destination navigation
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={() => setIsContactCrewOpen(true)}
                className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                title="Call Bus Conductor & Transport Helpline"
              >
                <PhoneCall className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Call Crew / Desk</span>
              </button>

              <Link
                href={`/portal/radar?busId=${assignedBus.id}`}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                <Navigation className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                <span>Open Live Radar →</span>
              </Link>
            </div>
          </div>

          {/* Quick Proximity Unlock / Status Strip if seat is locked */}
          {!isLockCleared && (
            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs relative z-10">
              <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Seat Selection Locked: Approach {displayBusNum} (&lt;2m) or tap RFID card</span>
              </div>
              <button
                type="button"
                onClick={handleQuickProximityUnlock}
                disabled={isQuickUnlocking}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isQuickUnlocking ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying Proximity...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Distance Unlock (&lt;2m)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

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
      // 1. Acquire current device GPS coordinates (skip slow wait if already verified via in-bus RFID)
      let lat: number | undefined;
      let lng: number | undefined;
      if (!isRfidVerified && typeof window !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 3000,
              maximumAge: 10000,
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
          verifyGps: !isRfidVerified,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReservation(data.reservation);
        setTentativeSeat(seatNumber);
        setIsChangingSeat(false);
        showToast(data.message || `✓ Seat ${seatNumber} confirmed and attendance recorded!`, "success");
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
        {renderToastNotification()}
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
        {renderToastNotification()}
      </div>
    );
  }

  // ─── 1. FIRST-MILE WALKING NAVIGATION (NOT ON BUS & NOT AT STOP) ───
  const isWalkingToStop = !isAttendanceMarked && !isAtPickupStop && !hasArrivedAtStopManually && Boolean(assignedStop?.latitude && assignedStop?.longitude);

  if (isWalkingToStop && !showSeatGridWhileWalking) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Top shift update */}
        {schedule?.isIncomingOver && previousReservation && (
          <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-bold text-indigo-950 dark:text-indigo-200">
                Morning Shift Completed {previousReservation.chosen_seat ? `• Seat ${previousReservation.chosen_seat}` : ""}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
              Next Shift Assigned: <strong className="text-indigo-600 dark:text-indigo-400">{assignedShiftName}</strong>
            </div>
          </div>
        )}

        {/* Live Radar Launcher Banner */}
        {renderLiveRadarLauncherBanner()}

        {/* Modern First-Mile Walking Navigation Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <Footprints className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                    First-Mile Guidance
                  </span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {userToStopDistMeters ? `${userToStopDistMeters}m to stop` : "Walking Mode"}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white mt-0.5">
                  Walk to {assignedStop?.name || "Designated Stop"}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHasArrivedAtStopManually(true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>I've Arrived at Stop</span>
              </button>
            </div>
          </div>

          {/* Google / CampusFleet Interactive Map: Walking Path + Realtime Bus Pin */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-1.5 font-medium">
                <Navigation className="w-3.5 h-3.5 text-blue-600" />
                Live Pedestrian Walking Route to Boarding Point
              </span>
              <span className="font-mono text-[11px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                ~{walkingEtaMins} min walk
              </span>
            </div>

            <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm relative z-0">
              <CampusFleetMap
                height="300px"
                zoom={15}
                walkingCoordinates={walkingCoordinates}
                stops={stops}
                selectedStopId={assignedStop?.id}
                busLocation={telematicsLocation}
                showUserLocation={true}
                tileTheme="GOOGLE_STREETS"
              />
            </div>
          </div>

          {/* Walking Sync & Bus Telematics Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <div className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-emerald-600" />
                <span>Your Walk Time</span>
              </div>
              <div className="text-base font-black text-zinc-900 dark:text-white font-mono">
                ~{walkingEtaMins} mins
              </div>
              <p className="text-[11px] text-zinc-500">
                {userToStopDistMeters ? `${userToStopDistMeters}m at 4.8 km/h` : "Standard walking pace"}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <div className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                <BusFront className="w-3.5 h-3.5 text-blue-600" />
                <span>Bus Arrival ETA</span>
              </div>
              <div className="text-base font-black text-blue-600 dark:text-blue-400 font-mono">
                {liveEtaText || "~10 mins"}
              </div>
              <p className="text-[11px] text-zinc-500">
                {telematicsLocation?.speedKmh ? `${telematicsLocation.speedKmh} km/h • ` : ""}
                {assignedBus?.busNumber ? `Bus ${assignedBus.busNumber}` : "Assigned Fleet Bus"}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <div className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Sync Status</span>
              </div>
              <div className={`text-sm font-bold ${
                arrivalCushionMins !== null && arrivalCushionMins >= 2
                  ? "text-emerald-600 dark:text-emerald-400"
                  : arrivalCushionMins !== null && arrivalCushionMins < 2
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-900 dark:text-white"
              }`}>
                {arrivalCushionMins !== null && arrivalCushionMins >= 2
                  ? `On Track (+${arrivalCushionMins}m buffer)`
                  : arrivalCushionMins !== null && arrivalCushionMins < 2
                  ? "Speed Up! Bus arriving soon"
                  : "Scheduled Run"}
              </div>
              <p className="text-[11px] text-zinc-500">
                {assignedShiftStartTime ? `${formatShiftTime(assignedShiftStartTime)} Shift Departure` : "On-time departure"}
              </p>
            </div>
          </div>

          {/* Turn-by-Turn External Link & Seat Preview Actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            {googleMapsWalkingUrl && (
              <a
                href={googleMapsWalkingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Navigation className="w-4 h-4" />
                <span>Start Walking Navigation in Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            )}

            <button
              type="button"
              onClick={() => setShowSeatGridWhileWalking(true)}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>Select Bus Seat Ahead of Time ↓</span>
            </button>
          </div>
        </div>
        {renderToastNotification()}
      </div>
    );
  }

  // ─── 2. NO ASSIGNED BUS CURRENTLY ─────────────────────────────────
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
        {renderToastNotification()}
      </div>
    );
  }

  // ─── 3. BUS ASSIGNED, ATTENDANCE NOT YET MARKED ───────────────────
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

        {/* ─── LIVE BUS TELEMATICS RADAR LAUNCHER BANNER ─── */}
        {renderLiveRadarLauncherBanner()}

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

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsSeatPartnerModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
                >
                  <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Seat Partner & Preferences</span>
                  {seatPartnerData.incomingRequests.length > 0 && (
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-500/20 animate-pulse" />
                  )}
                </button>

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
            </div>

            {/* Incoming Seat Partner Request Alert */}
            {seatPartnerData.incomingRequests.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200 dark:border-amber-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in slide-in-from-top-1 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                    <HeartHandshake className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <div className="font-bold text-amber-950 dark:text-amber-200">
                      Seat Partner Request from {seatPartnerData.incomingRequests[0].sender_name}!
                    </div>
                    <div className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                      Rides on Bus {assignedBus?.busNumber} with you. Accept to automatically sit together side-by-side.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    onClick={() => handleQuickAcceptPartner(seatPartnerData.incomingRequests[0].id)}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    Accept & Pair
                  </button>
                  <button
                    onClick={() => setIsSeatPartnerModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-white transition-all cursor-pointer"
                  >
                    Review
                  </button>
                </div>
              </div>
            )}

            {/* Active Partner or Auto-Assigned Preferences Status Chip */}
            {(seatPartnerData.activePartnership || seatPartnerData.rowPreference !== "NO_PREFERENCE" || seatPartnerData.positionPreference !== "NO_PREFERENCE") && (
              <div className="p-2.5 px-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  {seatPartnerData.activePartnership ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-indigo-700 dark:text-indigo-300">
                      <HeartHandshake className="w-3.5 h-3.5 text-indigo-500" />
                      Paired with {seatPartnerData.partnerName} {seatPartnerData.partnerSeat ? `(Seat ${seatPartnerData.partnerSeat})` : ""}
                    </span>
                  ) : (
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      Auto-Assignment Active
                    </span>
                  )}
                  <span className="text-slate-400 dark:text-slate-500">•</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Row: <strong className="text-slate-700 dark:text-slate-200 capitalize">{seatPartnerData.rowPreference.toLowerCase()}</strong>
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">•</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Position: <strong className="text-slate-700 dark:text-slate-200 capitalize">{seatPartnerData.positionPreference.toLowerCase()}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSeatPartnerModalOpen(true)}
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Change
                </button>
              </div>
            )}

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
                  partnerSeat={seatPartnerData.partnerSeat}
                  partnerName={seatPartnerData.partnerName}
                  autoAssignedSeat={reservation?.auto_assigned_seat || tentativeSeat}
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
        {renderToastNotification()}
      </div>
    );
  }

  // ─── 3. ATTENDANCE IS MARKED ──────────────────────────────────────
  // Show confirmed attendance summary + professional buttons for Digital QR and Live Bus Radar
  const displaySeatNumber = confirmedSeatNumber || tentativeSeat || "";

  return (
    <div className="space-y-6">
      {/* ─── LIVE BUS TELEMATICS RADAR LAUNCHER BANNER ─── */}
      {renderLiveRadarLauncherBanner()}

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

          {/* Live Bus Radar Direct Navigation Link */}
          <Link
            href={assignedBus ? `/portal/radar?busId=${assignedBus.id}` : "/portal/radar"}
            className="flex items-center justify-between p-4 md:p-5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 transition-all text-left group active:scale-[0.99] shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                <Navigation className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm md:text-base font-bold text-slate-900 dark:text-white">
                  Live Bus Radar Fullscreen
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Google Maps-style turn-by-turn navigation & multi-destination timeline
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </Link>

          {/* Contact Bus Conductor & Transport Helpline Action */}
          <button
            type="button"
            onClick={() => setIsContactCrewOpen(true)}
            className="flex items-center justify-between p-4 md:p-5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 transition-all text-left group active:scale-[0.99] shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/60 flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                <PhoneCall className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm md:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Contact Bus Crew & Helpline</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase">
                    Call
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Direct call to assigned bus conductor & university transport manager
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

      {/* ─── CONTACT CREW & TRANSPORT HELPLINE MODAL ─── */}
      <ContactCrewModal
        isOpen={isContactCrewOpen}
        onClose={() => setIsContactCrewOpen(false)}
        bus={assignedBus}
        shift={assignedShift}
        route={assignedRoute}
        conductor={assignedConductor}
        transportManager={transportManagerStaff}
        stopName={assignedStop?.name}
      />

      {/* ─── SEAT PARTNER & PREFERENCES MODAL ─── */}
      {assignedBus && (
        <SeatPartnerModal
          isOpen={isSeatPartnerModalOpen}
          onClose={() => setIsSeatPartnerModalOpen(false)}
          studentId={studentId}
          busId={assignedBus.id}
          busNumber={assignedBus.busNumber}
          shiftId={assignedShift?.id}
          currentSeat={tentativeSeat || reservation?.chosen_seat}
          onPairUpdated={() => {
            fetchSeatPartnerData();
            fetchReservation(true);
          }}
          showToast={showToast}
        />
      )}

      {/* ─── TOAST NOTIFICATION (replaces browser alert()) ─── */}
      {renderToastNotification()}
    </div>
  );
}
