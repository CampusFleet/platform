/**
 * CommuteTransitEngine (OOP Domain Service)
 * Encapsulates commuter state, attendance security validation, first-mile distance,
 * and lifecycle transitions for the student mobility portal.
 */

import type { Student, Bus, Stop, Shift, Trip, Booking, Route, Staff } from "@/lib/types";
import { generateSeatLayout, getTeacherStartingSeats } from "@/lib/utils";
import type { CommuteStage, CommuteResolvedEntities, FirstMileMetrics } from "./types";

export class CommuteTransitEngine {
  // In-memory cache for Google Maps Routes API responses
  private static roadDistanceCache = new Map<
    string,
    { distanceMeters: number; durationSeconds: number; coordinates: [number, number][] }
  >();

  /**
   * Fetches high-precision road and pedestrian walking distance via Google Maps Routes API (/api/geo/directions).
   * Unlike straight-line Euclidean/Haversine math, this measures actual physical road topography, turns, and footpaths.
   */
  public static async fetchRoadDistanceAndDuration(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
    mode: "walk" | "drive" = "walk"
  ): Promise<{ distanceMeters: number; durationSeconds: number; coordinates: [number, number][] }> {
    const key = `${lat1.toFixed(5)},${lon1.toFixed(5)};${lat2.toFixed(5)},${lon2.toFixed(5)}:${mode}`;
    const cached = this.roadDistanceCache.get(key);
    if (cached) {
      return cached;
    }

    try {
      const res = await fetch(`/api/geo/directions?mode=${mode}&coords=${lat1},${lon1};${lat2},${lon2}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.distanceMeters === "number") {
          const result = {
            distanceMeters: Math.round(data.distanceMeters),
            durationSeconds: Math.round(data.durationSeconds || (data.distanceMeters / (mode === "walk" ? 1.33 : 6.94))),
            coordinates: data.coordinates || [[lat1, lon1], [lat2, lon2]],
          };
          this.roadDistanceCache.set(key, result);
          return result;
        }
      }
    } catch (err) {
      console.warn("[CommuteTransitEngine] Google Maps Directions API fetch error, falling back to road-adjusted approximation:", err);
    }

    // Fallback: If network is offline, calculate with realistic road tortuosity factor (1.32x straight line)
    const straightLine = this.calculateStraightLineDistanceMeters(lat1, lon1, lat2, lon2);
    const roadApprox = Math.round(straightLine * 1.32);
    const speedMs = mode === "walk" ? 1.33 : 6.94; // 4.8 km/h walking vs 25 km/h driving
    const fallback = {
      distanceMeters: roadApprox,
      durationSeconds: Math.round(roadApprox / speedMs),
      coordinates: [[lat1, lon1], [lat2, lon2]] as [number, number][],
    };
    this.roadDistanceCache.set(key, fallback);
    return fallback;
  }

  /**
   * Internal straight-line calculation used only for fallback estimation when Google Maps API is unreachable
   */
  public static calculateStraightLineDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
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

  /**
   * Synchronously returns cached road distance, or falls back to road-adjusted estimate
   */
  public static getCachedRoadDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
    mode: "walk" | "drive" = "walk"
  ): number {
    const key = `${lat1.toFixed(5)},${lon1.toFixed(5)};${lat2.toFixed(5)},${lon2.toFixed(5)}:${mode}`;
    const cached = this.roadDistanceCache.get(key);
    if (cached) return cached.distanceMeters;
    return Math.round(this.calculateStraightLineDistanceMeters(lat1, lon1, lat2, lon2) * 1.32);
  }

  /**
   * Formats 24h or ISO time into human-friendly 12h AM/PM time
   */
  public static formatShiftTime(timeStr?: string): string {
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
  }

  /**
   * Resolves the student's active booking for today
   */
  public static resolveActiveBooking(
    bookings: Booking[],
    studentId?: string,
    reservation?: any
  ): Booking | null {
    if (!studentId) return null;
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const today = new Date(now.getTime() + istOffset).toISOString().split("T")[0];
    const utcToday = now.toISOString().split("T")[0];

    return (
      bookings.find(
        (b) =>
          (b.studentId === studentId) &&
          (b.status === "CONFIRMED" || b.status === "BOARDED") &&
          (!reservation?.trip_id || b.tripId === reservation.trip_id) &&
          (b.bookingDate === today || b.bookingDate === utcToday || (b.createdAt && b.createdAt.startsWith(today)))
      ) || null
    );
  }

  /**
   * Resolves the assigned physical bus vehicle entity
   */
  public static resolveAssignedBus(
    buses: Bus[],
    reservation?: any,
    activeBooking?: Booking | null,
    queryBusId?: string | null
  ): Bus | null {
    const busId = queryBusId || reservation?.bus_id || activeBooking?.busId;
    if (!busId) return null;
    const strId = String(busId).trim();
    return (
      buses.find((b) => String(b.id) === strId || String(b.busNumber) === strId) ||
      reservation?.bus ||
      reservation?.buses ||
      null
    );
  }

  /**
   * Resolves the assigned transit route corridor
   */
  public static resolveAssignedRoute(
    routes: Route[],
    trips: Trip[],
    reservation?: any,
    assignedBus?: Bus | null,
    activeBooking?: Booking | null,
    student?: Student
  ): Route | null {
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
  }

  /**
   * Resolves the assigned pick-up / boarding stop
   */
  public static resolveAssignedStop(
    stops: Stop[],
    reservation?: any,
    activeBooking?: Booking | null,
    student?: Student
  ): Stop | null {
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
  }

  /**
   * Resolves the active transit shift window
   */
  public static resolveAssignedShift(
    shifts: Shift[],
    trips: Trip[],
    reservation?: any,
    activeBooking?: Booking | null
  ): Shift | null {
    const shiftId =
      reservation?.shift_id ||
      (reservation as any)?.shiftId ||
      reservation?.shift?.id ||
      (activeBooking as any)?.shiftId;

    if (shiftId) {
      const found = shifts.find((s) => s.id === shiftId);
      if (found) return found;
    }

    const tripId = reservation?.trip_id || activeBooking?.tripId;
    if (tripId) {
      const foundTrip = trips.find((t) => t.id === tripId);
      if (foundTrip?.shiftId) {
        const found = shifts.find((s) => s.id === foundTrip.shiftId);
        if (found) return found;
      }
    }

    if (reservation?.shift) return reservation.shift;

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const upcoming = shifts.find((s) => {
      const parts = (s.startTime || "").split(":");
      const startMins = parseInt(parts[0] || "0", 10) * 60 + parseInt(parts[1] || "0", 10);
      return startMins >= currentMins;
    });
    return upcoming || shifts[0] || null;
  }

  /**
   * Checks whether all daily commute shifts have completed (IST)
   */
  public static isAllShiftsOver(shifts: Shift[], schedule?: any, isTodayOff?: boolean): boolean {
    if (isTodayOff) return false;
    if (schedule?.isAllShiftsOver) return true;

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

    return Boolean(schedule?.isIncomingOver && schedule?.isOutgoingOver);
  }

  /**
   * Security Check: Validates faculty/teacher seat reservation protection.
   * Ensures student passengers cannot claim seats designated for teachers.
   */
  public static validateTeacherSeatProtection(
    seatNumber: string,
    bus: Bus | null,
    isTeacher: boolean
  ): { allowed: boolean; reason?: string } {
    if (isTeacher || !bus) return { allowed: true };
    const teacherCount =
      typeof (bus as any)?.teacherSeatsCount === "number"
        ? (bus as any).teacherSeatsCount
        : typeof (bus as any)?.teacher_seats_count === "number"
        ? (bus as any).teacher_seats_count
        : 0;

    if (teacherCount > 0) {
      const allSeats = generateSeatLayout(bus.capacity, bus.seatLayout);
      const teacherSeats = getTeacherStartingSeats(allSeats, teacherCount);
      if (teacherSeats.includes(seatNumber)) {
        return {
          allowed: false,
          reason: `The first ${teacherCount} seat${teacherCount !== 1 ? "s" : ""} on this bus are reserved for Faculty & Teachers.`,
        };
      }
    }
    return { allowed: true };
  }

  /**
   * Security Check: Enforces attendance lock / anti-proxy fraud status
   */
  public static isLockCleared(
    attendanceLockStatus: "LOCKED" | "UNLOCKED",
    isRfidVerified: boolean,
    reservation?: any
  ): boolean {
    return attendanceLockStatus === "UNLOCKED" || isRfidVerified || reservation?.lock_status === "UNLOCKED";
  }

  /**
   * Computes First-Mile Walking and Bus ETA Metrics using real road distance topography
   */
  public static computeFirstMileMetrics(
    userLat?: number,
    userLng?: number,
    stop?: Stop | null,
    telematicsLocation?: any,
    isTelematicsLive?: boolean
  ): FirstMileMetrics {
    const stopLat = stop?.latitude;
    const stopLng = stop?.longitude;
    const busLat = telematicsLocation?.latitude;
    const busLng = telematicsLocation?.longitude;

    let userToStopDistMeters: number | null = null;
    let busToStopDistMeters: number | null = null;
    let busToUserDistMeters: number | null = null;

    if (userLat && userLng && stopLat && stopLng) {
      userToStopDistMeters = this.getCachedRoadDistance(userLat, userLng, stopLat, stopLng, "walk");
    }

    if (busLat && busLng && stopLat && stopLng) {
      busToStopDistMeters = this.getCachedRoadDistance(busLat, busLng, stopLat, stopLng, "drive");
    }

    if (userLat && userLng && busLat && busLng) {
      busToUserDistMeters = this.getCachedRoadDistance(userLat, userLng, busLat, busLng, "drive");
    }

    const walkingEtaMins = userToStopDistMeters ? Math.max(1, Math.round(userToStopDistMeters / 80)) : 5;
    const busEtaMins = busToStopDistMeters ? Math.max(1, Math.round(busToStopDistMeters / 416)) : null;
    const arrivalCushionMins = busEtaMins !== null ? busEtaMins - walkingEtaMins : null;

    let liveEtaText = "Awaiting GPS Ping";
    if (busToStopDistMeters !== null) {
      if (busToStopDistMeters < 60) {
        liveEtaText = "At Your Pick-Up Stop • Board Now";
      } else if (busToStopDistMeters < 250) {
        liveEtaText = "Arriving in ~1 min";
      } else {
        const mins = Math.max(1, Math.round((busToStopDistMeters / 1000) / (25 / 60)));
        liveEtaText = `~${mins} mins (${busToStopDistMeters > 1000 ? `${(busToStopDistMeters / 1000).toFixed(1)} km` : `${busToStopDistMeters}m`})`;
      }
    } else if (isTelematicsLive) {
      liveEtaText = "Computing arrival...";
    }

    let googleMapsWalkingUrl: string | null = null;
    if (stopLat && stopLng) {
      const originStr = userLat && userLng ? `&origin=${userLat},${userLng}` : "";
      googleMapsWalkingUrl = `https://www.google.com/maps/dir/?api=1${originStr}&destination=${stopLat},${stopLng}&travelmode=walking`;
    }

    const walkingCoordinates: [number, number][] =
      userLat && userLng && stopLat && stopLng
        ? [[userLat, userLng], [stopLat, stopLng]]
        : [];

    return {
      userToStopDistMeters,
      busToStopDistMeters,
      busToUserDistMeters,
      walkingEtaMins,
      busEtaMins,
      arrivalCushionMins,
      liveEtaText,
      googleMapsWalkingUrl,
      walkingCoordinates,
    };
  }

  /**
   * Deterministically evaluates the primary active commuter stage for the UI state machine
   */
  public static evaluateStage(params: {
    isLoading: boolean;
    isTodayOff: boolean;
    isAllShiftsOver: boolean;
    assignedBus: Bus | null;
    isAttendanceMarked: boolean;
    isAtPickupStop: boolean;
    hasArrivedAtStopManually: boolean;
    showSeatGridWhileWalking: boolean;
    hasStopCoordinates: boolean;
  }): CommuteStage {
    if (params.isLoading) return "LOADING";
    if (params.isTodayOff) return "DAY_OFF";
    if (params.isAllShiftsOver) return "SHIFTS_CONCLUDED";
    if (!params.assignedBus) return "NO_BUS_ASSIGNED";

    if (params.isAttendanceMarked) {
      return "RIDE_CONFIRMED";
    }

    // Walking mode if not at stop and not confirmed
    const isWalking =
      !params.isAtPickupStop &&
      !params.hasArrivedAtStopManually &&
      params.hasStopCoordinates &&
      !params.showSeatGridWhileWalking;

    if (isWalking) {
      return "WALKING_TO_STOP";
    }

    return "SEAT_SELECTION";
  }
}
