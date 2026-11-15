"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { telematicsService } from "@/lib/telematicsService";
import { ContactCrewModal } from "./ContactCrewModal";
import type { Student, Bus, Stop, Shift, Trip, Booking, Route, Staff } from "@/lib/types";
import { CommuteTransitEngine } from "@/lib/commute/CommuteTransitEngine";
import { getCampusStopFromDatabase } from "@/components/maps/CampusFleetMap";
import {
  CommuteLiveRadarBanner,
  CommuteConfirmedStage,
  CommuteScheduleOffStage,
  CommuteNoBusStage,
  CommuteLoadingSkeleton,
} from "./commute";

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
  const router = useRouter();

  // ─── 1. Core Commute & Reservation State ──────────────────────────
  const [reservation, setReservation] = useState<any>(initialReservation || null);
  const [schedule, setSchedule] = useState<any>(initialSchedule || null);
  const [occupiedSeats, setOccupiedSeats] = useState<string[]>([]);
  const [isRfidVerified, setIsRfidVerified] = useState<boolean>(false);
  const [isLoadingReservation, setIsLoadingReservation] = useState(
    initialReservation === undefined && initialSchedule === undefined
  );

  const [tentativeSeat, setTentativeSeat] = useState<string | null>(() => initialReservation?.chosen_seat || null);
  const [isContactCrewOpen, setIsContactCrewOpen] = useState(false);

  // Anti-proxy Attendance Lock (Distance / RFID) State
  const [attendanceLockStatus, setAttendanceLockStatus] = useState<"LOCKED" | "UNLOCKED">(() =>
    initialReservation?.lock_status === "UNLOCKED" ? "UNLOCKED" : "LOCKED"
  );

  // Live Telematics & Location State
  const [telematicsLocation, setTelematicsLocation] = useState<any>(null);
  const [isTelematicsLive, setIsTelematicsLive] = useState(false);
  const [userGeoCoords, setUserGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Toast Notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "warning" } | null>(null);
  const showToast = useCallback((text: string, type: "success" | "error" | "warning" = "error") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  const studentId = student?.id || user?.studentId || user?.userId || user?.id;
  const isTeacher = Boolean(
    user?.role === "teacher" ||
    user?.role === "faculty" ||
    user?.role === "staff" ||
    user?.role === "admin" ||
    user?.role === "TEACHER" ||
    user?.role === "FACULTY"
  );
  const settingsHref = isTeacher ? "/teacher/settings" : "/portal/settings";

  const reservationRef = useRef(reservation);
  reservationRef.current = reservation;
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  // ─── 2. Server Sync & API Fetchers ─────────────────────────────────
  const fetchReservation = useCallback(async (silent = false) => {
    try {
      if (!silent && !reservationRef.current && !scheduleRef.current?.isTodayOff && !scheduleRef.current?.isAllShiftsOver) {
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
        if (typeof data.isRfidVerified === "boolean") setIsRfidVerified(data.isRfidVerified);
        if (data.lockStatus) setAttendanceLockStatus(data.lockStatus === "UNLOCKED" ? "UNLOCKED" : "LOCKED");
        if (data.schedule || data.teacherSchedule) setSchedule(data.schedule || data.teacherSchedule);
      }
    } catch (e) {
      console.warn("Could not fetch smart transit reservation", e);
    } finally {
      setIsLoadingReservation(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchReservation(Boolean(initialReservation || initialSchedule));
  }, [studentId, fetchReservation]);

  // ─── 3. OOP Entity Resolution via CommuteTransitEngine ─────────────
  const activeBooking = useMemo(
    () => CommuteTransitEngine.resolveActiveBooking(bookings, studentId, reservation),
    [bookings, studentId, reservation]
  );

  const assignedBus = useMemo(() => {
    let queryBusId: string | null = null;
    if (typeof window !== "undefined") {
      try {
        queryBusId = new URLSearchParams(window.location.search).get("busId");
      } catch {}
    }
    return CommuteTransitEngine.resolveAssignedBus(buses, reservation, activeBooking, queryBusId);
  }, [buses, reservation, activeBooking]);

  const assignedRoute = useMemo(
    () => CommuteTransitEngine.resolveAssignedRoute(routes, trips, reservation, assignedBus, activeBooking, student),
    [routes, trips, reservation, assignedBus, activeBooking, student]
  );

  const assignedStop = useMemo(
    () => CommuteTransitEngine.resolveAssignedStop(stops, reservation, activeBooking, student),
    [stops, reservation, activeBooking, student]
  );

  const assignedShift = useMemo(
    () => CommuteTransitEngine.resolveAssignedShift(shifts, trips, reservation, activeBooking),
    [shifts, trips, reservation, activeBooking]
  );

  const assignedConductor = useMemo(() => {
    if (!staff || staff.length === 0) return null;
    const tripId = reservation?.trip_id || activeBooking?.tripId;
    const foundTrip = tripId ? trips.find(t => t.id === tripId) : null;
    if (foundTrip?.conductorId) {
      const match = staff.find(s => s.id === foundTrip.conductorId || s.userId === foundTrip.conductorId);
      if (match) return match;
    }
    return staff.find(s => s.role === "conductor" || s.category === "CONDUCTORS") || null;
  }, [staff, trips, reservation?.trip_id, activeBooking?.tripId]);

  const transportManager = useMemo(() => {
    if (!staff) return null;
    return staff.find(s => s.role === "transport_manager" || s.role === "transport_admin" || s.category === "TRANSPORT_OPS") || null;
  }, [staff]);

  const isTripInProgress = useMemo(() => {
    const tripId = reservation?.trip_id || activeBooking?.tripId;
    if (!tripId) return false;
    const foundTrip = trips.find(t => t.id === tripId);
    const status = foundTrip?.status || (foundTrip as any)?.trip_status;
    return status === "IN_PROGRESS" || status === "COMPLETED";
  }, [trips, reservation?.trip_id, activeBooking?.tripId]);

  const isTodayOff = useMemo(() => {
    if (schedule?.isTodayOff) return true;
    if (initialSchedule?.isTodayOff) return true;
    return false;
  }, [schedule, initialSchedule]);

  const isAllShiftsOver = useMemo(
    () => CommuteTransitEngine.isAllShiftsOver(shifts, schedule, isTodayOff),
    [shifts, schedule, isTodayOff]
  );

  const confirmedSeatNumber = useMemo(() => {
    const raw = reservation?.chosen_seat || activeBooking?.seatNumber || (activeBooking as any)?.seat_number;
    return raw && String(raw).trim() !== "" ? String(raw).trim() : null;
  }, [reservation, activeBooking]);

  const isAttendanceMarked = useMemo(() => {
    if (!confirmedSeatNumber) return false;
    return true;
  }, [confirmedSeatNumber]);

  const isLockCleared = useMemo(
    () => CommuteTransitEngine.isLockCleared(attendanceLockStatus, isRfidVerified, reservation),
    [attendanceLockStatus, isRfidVerified, reservation]
  );

  const isAttendanceVerified = useMemo(() => {
    return Boolean(
      isLockCleared ||
      reservation?.status === "BOARDED" ||
      (reservation as any)?.is_attendance_verified
    );
  }, [isLockCleared, reservation]);

  // ─── 4. Live Telematics & Location Watch ───────────────────────────
  useEffect(() => {
    const busId = assignedBus?.id;
    if (!busId) return;

    let isMounted = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/telematics/live?busId=${encodeURIComponent(String(busId))}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.liveLocation) {
            setTelematicsLocation(data.liveLocation);
            setIsTelematicsLive(true);
          }
        }
      } catch {}
    };

    poll();
    const unsub = telematicsService.subscribe(incoming => {
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

  // Non-blocking device GPS acquisition
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
    );
  }, []);

  // ─── 5. Google Maps Routes API Road Distance Fetcher ──────────────
  const isCoordInTransitRegion = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return false;
    return lat >= 28.5 && lat <= 30.0 && lng >= 78.5 && lng <= 80.5;
  };

  // Priority: Commuter's registered home coordinates always define their home doorstep pin!
  const studentRegisteredLat = (student as any)?.home_latitude ?? (student as any)?.homeLatitude ?? null;
  const studentRegisteredLng = (student as any)?.home_longitude ?? (student as any)?.homeLongitude ?? null;

  const effectiveUserLat =
    studentRegisteredLat ??
    (userGeoCoords && isCoordInTransitRegion(userGeoCoords.lat, userGeoCoords.lng) ? userGeoCoords.lat : null) ??
    (assignedStop?.latitude ? assignedStop.latitude - 0.0025 : 29.220936);

  const effectiveUserLng =
    studentRegisteredLng ??
    (userGeoCoords && isCoordInTransitRegion(userGeoCoords.lat, userGeoCoords.lng) ? userGeoCoords.lng : null) ??
    (assignedStop?.longitude ? assignedStop.longitude - 0.0020 : 79.514496);

  const deviceGpsCoords = useMemo(() => {
    if (userGeoCoords && isCoordInTransitRegion(userGeoCoords.lat, userGeoCoords.lng)) {
      return { latitude: userGeoCoords.lat, longitude: userGeoCoords.lng };
    }
    return null;
  }, [userGeoCoords]);

  // Asynchronously query Google Maps Routes API for actual road distance
  useEffect(() => {
    if (effectiveUserLat && effectiveUserLng && assignedStop?.latitude && assignedStop?.longitude) {
      CommuteTransitEngine.fetchRoadDistanceAndDuration(
        effectiveUserLat,
        effectiveUserLng,
        assignedStop.latitude,
        assignedStop.longitude,
        "walk"
      ).catch(() => {});
    }

    if (telematicsLocation?.latitude && telematicsLocation?.longitude && assignedStop?.latitude && assignedStop?.longitude) {
      CommuteTransitEngine.fetchRoadDistanceAndDuration(
        telematicsLocation.latitude,
        telematicsLocation.longitude,
        assignedStop.latitude,
        assignedStop.longitude,
        "drive"
      ).catch(() => {});
    }
  }, [effectiveUserLat, effectiveUserLng, assignedStop?.latitude, assignedStop?.longitude, telematicsLocation?.latitude, telematicsLocation?.longitude]);

  // Compute First-Mile Road Metrics
  const firstMileMetrics = useMemo(
    () =>
      CommuteTransitEngine.computeFirstMileMetrics(
        effectiveUserLat,
        effectiveUserLng,
        assignedStop,
        telematicsLocation,
        isTelematicsLive
      ),
    [effectiveUserLat, effectiveUserLng, assignedStop, telematicsLocation, isTelematicsLive]
  );

  // ─── 5b. Ordered Corridor Sequence & Resilient Map Geometry ──────────
  const orderedCorridorStops = useMemo(() => {
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
      const matching = stops.slice(0, 8);
      list.push(...matching);
    }

    const campusTerminal = getCampusStopFromDatabase(stops);
    if (campusTerminal && !list.some((s) => s.id === campusTerminal.id || s.code === campusTerminal.code)) {
      list.push(campusTerminal);
    }
    return list;
  }, [assignedRoute?.id, stops]);

  const sourceStop = orderedCorridorStops[0] || null;
  const terminalStop = orderedCorridorStops[orderedCorridorStops.length - 1] || null;

  const corridorRouteCoordinates = useMemo(() => {
    return orderedCorridorStops.map((s) => [s.latitude, s.longitude] as [number, number]);
  }, [orderedCorridorStops]);

  // Guaranteed non-null live bus location fallback so the map is never empty
  const currentBusLat = telematicsLocation?.latitude ?? sourceStop?.latitude ?? 29.3750;
  const currentBusLng = telematicsLocation?.longitude ?? sourceStop?.longitude ?? 79.5295;
  const busSpeedKmh = telematicsLocation?.speedKmh ?? telematicsLocation?.speed ?? 0;

  const effectiveBusLocation = useMemo(
    () => ({
      busId: assignedBus?.id ?? -1,
      latitude: currentBusLat,
      longitude: currentBusLng,
      speedKmh: busSpeedKmh,
      speed: busSpeedKmh,
      headingDeg: telematicsLocation?.headingDeg ?? 0,
      lastPingAt: telematicsLocation?.lastPingAt ?? "",
      tripId: reservation?.trip_id || "",
      delayMinutes: 0,
      estimatedArrivalNextStopMins: 3,
    }),
    [assignedBus?.id, currentBusLat, currentBusLng, busSpeedKmh, telematicsLocation?.headingDeg, telematicsLocation?.lastPingAt, reservation?.trip_id]
  );

  const memoizedUserCoords = useMemo(
    () => ({ latitude: effectiveUserLat, longitude: effectiveUserLng }),
    [effectiveUserLat, effectiveUserLng]
  );

  // ─── 7. Evaluate Commute Stage via OOP State Machine ───────────────
  const activeStage = CommuteTransitEngine.evaluateStage({
    isLoading: isLoadingReservation,
    isTodayOff,
    isAllShiftsOver,
    assignedBus,
    isAttendanceMarked,
    isAtPickupStop: false,
    hasArrivedAtStopManually: false,
    showSeatGridWhileWalking: false,
    hasStopCoordinates: Boolean(assignedStop?.latitude && assignedStop?.longitude),
  });

  const assignedShiftName = assignedShift?.name || (assignedShift as any)?.shift_name || "Regular Transit Shift";
  const assignedShiftStartTime = assignedShift?.startTime || (assignedShift as any)?.start_time || "";
  const assignedShiftEndTime = assignedShift?.endTime || (assignedShift as any)?.end_time || "";
  const displaySeatNumber = confirmedSeatNumber || tentativeSeat || "";

  // Tomorrow preview
  const tomorrowMorningShift = useMemo(
    () => shifts.find(s => s.shiftType === "MORNING" || s.direction === "HOME_TO_CAMPUS") || shifts[0] || null,
    [shifts]
  );
  const tomorrowShiftStartTime = tomorrowMorningShift?.startTime || (tomorrowMorningShift as any)?.start_time || "07:15:00";
  const tomorrowPickupStop = assignedStop ? assignedStop.name : (student?.primaryStopId ? `Stop: ${student.primaryStopId}` : "Campus Stop");

  // ─── 8. Render Modular Views ───────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ─── LIVE BUS TELEMATICS RADAR BANNER (Auxiliary stages only, hidden when primary interactive map is active) ─── */}
      {assignedBus && activeStage !== "LOADING" && activeStage !== "RIDE_CONFIRMED" && activeStage !== "WALKING_TO_STOP" && (
        <CommuteLiveRadarBanner
          assignedBus={assignedBus}
          telematicsLocation={telematicsLocation}
          isTelematicsLive={isTelematicsLive}
          liveEtaText={firstMileMetrics.liveEtaText}
        />
      )}

      {/* ─── STAGE 1: LOADING SKELETON ─── */}
      {activeStage === "LOADING" && <CommuteLoadingSkeleton />}

      {/* ─── STAGE 2: DAY OFF OR SHIFTS CONCLUDED ─── */}
      {(activeStage === "DAY_OFF" || activeStage === "SHIFTS_CONCLUDED") && (
        <CommuteScheduleOffStage
          isTodayOff={activeStage === "DAY_OFF"}
          todayName={schedule?.dayOfWeek || initialSchedule?.dayOfWeek || "Today"}
          tomorrowMorningShift={tomorrowMorningShift}
          tomorrowShiftStartTime={tomorrowShiftStartTime}
          tomorrowPickupStop={tomorrowPickupStop}
          todaySeat={confirmedSeatNumber}
          todayBusNumber={assignedBus?.busNumber ? String(assignedBus.busNumber) : undefined}
          settingsHref={settingsHref}
          onRefresh={() => fetchReservation()}
          formatShiftTime={CommuteTransitEngine.formatShiftTime}
        />
      )}

      {/* ─── STAGE 3: UNASSIGNED FLEET STATUS ─── */}
      {activeStage === "NO_BUS_ASSIGNED" && (
        <CommuteNoBusStage
          settingsHref={settingsHref}
          onRefresh={() => fetchReservation()}
        />
      )}

      {/* ─── STAGE 6: CONFIRMED RIDE COCKPIT ─── */}
      {activeStage === "RIDE_CONFIRMED" && assignedBus && (
        <CommuteConfirmedStage
          assignedBus={assignedBus}
          assignedStop={assignedStop}
          assignedRoute={assignedRoute}
          assignedShiftName={assignedShiftName}
          assignedShiftStartTime={assignedShiftStartTime}
          assignedShiftEndTime={assignedShiftEndTime}
          student={student}
          displaySeatNumber={displaySeatNumber}
          isTripInProgress={isTripInProgress}
          isAttendanceVerified={isAttendanceVerified}
          assignedConductor={assignedConductor}
          transportManager={transportManager}
          stops={orderedCorridorStops}
          routeCoordinates={corridorRouteCoordinates}
          campusDestinationId={terminalStop?.id}
          telematicsLocation={effectiveBusLocation}
          isTelematicsLive={isTelematicsLive}
          firstMileMetrics={firstMileMetrics}
          userCoords={memoizedUserCoords}
          deviceGpsCoords={deviceGpsCoords}
          userAddress={(student as any)?.home_address || (student as any)?.homeAddress || "Your Origin"}
          settingsHref={settingsHref}
          onOpenDigitalPass={onOpenDigitalPass}
          onOpenContactCrew={() => setIsContactCrewOpen(true)}
          formatShiftTime={CommuteTransitEngine.formatShiftTime}
        />
      )}

      {/* ─── MODAL: CONTACT CREW & HELPLINE ─── */}
      <ContactCrewModal
        isOpen={isContactCrewOpen}
        onClose={() => setIsContactCrewOpen(false)}
        bus={assignedBus}
        shift={assignedShift}
        route={assignedRoute}
        conductor={assignedConductor}
        transportManager={transportManager}
        stopName={assignedStop?.name}
      />

      {/* ─── TOAST NOTIFICATION ─── */}
      {toastMessage && (
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[110] w-[90%] max-w-md animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
          <div
            className={`px-5 py-4 rounded-2xl shadow-2xl border flex items-start gap-3 backdrop-blur-xl ${
              toastMessage.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/95 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
                : toastMessage.type === "warning"
                ? "bg-amber-50 dark:bg-amber-950/95 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200"
                : "bg-red-50 dark:bg-red-950/95 border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-200"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toastMessage.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-relaxed flex-1">{toastMessage.text}</p>
            <button
              type="button"
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
