import { Stop, RouteStop } from "./types";
import { calculateHaversineDistanceKm } from "./eta-calculator";

export interface StopTimingEstimate {
  stopId: string;
  stopOrder: number;
  stopIndex: number;
  stopName: string;
  landmark: string;
  stop: Stop;
  arrivalOffsetMinutes: number;
  legMinutes: number;
  distanceFromStartKm: number;
  legDistanceKm: number;
  scheduledArrival: string;
  rollingLiveArrival: string;
  displayTime: string;
  status: "PASSED" | "ACTIVE" | "UPCOMING";
  isOrigin: boolean;
  isTerminal: boolean;
  activeDistanceMeters?: number | null;
  activeEtaMinutes?: number | null;
  etaMinutesFromBus?: number | null;
  isEstimatedFromRoad: boolean;
}

export type StopEstimate = StopTimingEstimate;

export interface RouteTimingOptions {
  baseDepartureTime?: string | null; // e.g. "07:15" or "07:30"
  baseScheduledTime?: string | null; // alias for baseDepartureTime
  tripStartedAt?: string | null;     // ISO timestamp when trip started
  isDepartNow?: boolean;             // Force rolling projection from current time
  departNow?: boolean;               // alias for isDepartNow
  currentCoords?: { latitude: number; longitude: number } | null;
  currentStopIndex?: number;
  activeStopIndex?: number;          // alias for currentStopIndex
}

/**
 * Format minutes offset from a base HH:MM string into 12-hour AM/PM string
 */
export function formatTimeWithOffset(baseTimeStr = "07:30", offsetMins = 0): string {
  let [hStr, mStr] = (baseTimeStr || "07:30").split(":");
  let hours = parseInt(hStr, 10);
  let mins = parseInt(mStr, 10);
  if (isNaN(hours)) hours = 7;
  if (isNaN(mins)) mins = 30;

  let totalMins = hours * 60 + mins + Math.round(offsetMins);
  totalMins = (totalMins + 1440) % 1440;

  const finalHours = Math.floor(totalMins / 60);
  const finalMins = totalMins % 60;
  const ampm = finalHours >= 12 ? "PM" : "AM";
  const displayHours = finalHours % 12 === 0 ? 12 : finalHours % 12;
  const displayMins = finalMins < 10 ? `0${finalMins}` : `${finalMins}`;

  return `${displayHours}:${displayMins} ${ampm}`;
}

/**
 * Format a Date object with minute offset into 12-hour AM/PM string
 */
export function formatTimeFromDateWithOffset(date: Date, offsetMins = 0): string {
  const target = new Date(date.getTime() + Math.round(offsetMins) * 60000);
  const hours = target.getHours();
  const mins = target.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMins = mins < 10 ? `0${mins}` : `${mins}`;

  return `${displayHours}:${displayMins} ${ampm}`;
}

/**
 * Estimates stop-by-stop transit timings, incorporating Google Maps-style
 * road curvature distances and dynamic rolling arrival estimates.
 */
export function estimateRouteStopTimings(
  routeStops: {
    stopId?: string;
    stopOrder?: number;
    arrivalOffsetMinutes?: number;
    bufferTimeMinutes?: number;
    stop: Stop;
  }[],
  options: RouteTimingOptions = {}
): StopTimingEstimate[] {
  if (!routeStops || routeStops.length === 0) return [];

  const baseDepTime = options.baseDepartureTime || options.baseScheduledTime || "07:30";
  const departNowFlag = options.isDepartNow ?? options.departNow ?? false;
  const currentStopIdx = options.currentStopIndex ?? options.activeStopIndex ?? 0;
  const { tripStartedAt, currentCoords } = options;

  const now = new Date();
  const tripStartDate = tripStartedAt ? new Date(tripStartedAt) : null;
  const baseLiveTime = departNowFlag || !tripStartDate ? now : tripStartDate;

  // Check if stops already have valid non-zero offsets
  const hasExistingOffsets = routeStops.some(
    (rs, i) => i > 0 && typeof rs.arrivalOffsetMinutes === "number" && rs.arrivalOffsetMinutes > 0
  );

  let cumulativeMins = 0;
  let cumulativeDistKm = 0;

  return routeStops.map((rs, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === routeStops.length - 1;
    const stop = rs.stop;

    let legMins = 0;
    let legDistKm = 0;

    if (!isFirst) {
      const prevStop = routeStops[idx - 1].stop;
      // Calculate straight line distance and apply standard corridor winding factor (1.35)
      const straightKm = calculateHaversineDistanceKm(
        prevStop.latitude,
        prevStop.longitude,
        stop.latitude,
        stop.longitude
      );
      legDistKm = Math.round(straightKm * 1.35 * 10) / 10;
      cumulativeDistKm += legDistKm;

      if (hasExistingOffsets && typeof rs.arrivalOffsetMinutes === "number" && rs.arrivalOffsetMinutes > 0) {
        const prevOffset = routeStops[idx - 1].arrivalOffsetMinutes || 0;
        legMins = Math.max(1, rs.arrivalOffsetMinutes - prevOffset);
        cumulativeMins = rs.arrivalOffsetMinutes;
      } else {
        // Average institutional bus speed ~28 km/h + 1.5 min boarding dwell per stop
        legMins = Math.max(3, Math.round((legDistKm / 28) * 60) + 2);
        cumulativeMins += legMins;
      }
    }

    const scheduledArrival = formatTimeWithOffset(baseDepTime, cumulativeMins);
    const rollingLiveArrival = formatTimeFromDateWithOffset(baseLiveTime, cumulativeMins);

    // Operational Status
    let status: "PASSED" | "ACTIVE" | "UPCOMING" = "UPCOMING";
    if (idx < currentStopIdx) {
      status = "PASSED";
    } else if (idx === currentStopIdx) {
      status = "ACTIVE";
    }

    // Live GPS distance from current bus coordinates
    let activeDistanceMeters: number | null = null;
    let activeEtaMinutes: number | null = null;

    if (currentCoords && status === "ACTIVE") {
      const distKm = calculateHaversineDistanceKm(
        currentCoords.latitude,
        currentCoords.longitude,
        stop.latitude,
        stop.longitude
      );
      activeDistanceMeters = Math.round(distKm * 1000);
      activeEtaMinutes = Math.max(1, Math.round((distKm / 28) * 60));
    }

    const displayTime = (departNowFlag || tripStartDate) ? rollingLiveArrival : scheduledArrival;

    return {
      stopId: rs.stopId || stop.id,
      stopOrder: rs.stopOrder || idx + 1,
      stopIndex: idx,
      stopName: stop.name,
      landmark: stop.landmark || (isLast ? "Campus University Terminal" : isFirst ? "Corridor Starting Point" : "Transit Stop"),
      stop,
      arrivalOffsetMinutes: cumulativeMins,
      legMinutes: legMins,
      distanceFromStartKm: Math.round(cumulativeDistKm * 10) / 10,
      legDistanceKm: legDistKm,
      scheduledArrival,
      rollingLiveArrival,
      displayTime,
      status,
      isOrigin: isFirst,
      isTerminal: isLast,
      activeDistanceMeters,
      activeEtaMinutes,
      etaMinutesFromBus: activeEtaMinutes,
      isEstimatedFromRoad: !hasExistingOffsets,
    };
  });
}
