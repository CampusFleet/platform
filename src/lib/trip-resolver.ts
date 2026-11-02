import { Trip, Shift, Booking } from "./types";

/**
 * Returns today's date string (YYYY-MM-DD) in the Indian Standard Time (IST) transit zone.
 */
export function getTodayIST(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Returns the current time in minutes from midnight (0..1439) in IST.
 */
export function getNowMinutesIST(): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(new Date());

    let hour = 0;
    let min = 0;
    for (const p of parts) {
      if (p.type === "hour") hour = parseInt(p.value, 10) % 24;
      if (p.type === "minute") min = parseInt(p.value, 10);
    }
    return hour * 60 + min;
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}

/**
 * Converts a HH:MM or HH:MM:SS string to total minutes from midnight.
 */
export function parseTimeToMinutes(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/**
 * Calculates a relevance score for a trip based on temporal shift window & status.
 * Higher score = more relevant right now.
 */
export function scoreTripForNow(trip: Trip, shifts: Shift[], nowMinutes: number, todayStr: string): number {
  let score = 0;

  // 1. Date match
  const isToday = trip.tripDate === todayStr;
  if (isToday) {
    score += 1000;
  } else if (trip.tripDate > todayStr) {
    score += 200; // Future scheduled
  } else {
    score -= 2000; // Past day historical trip
  }

  // 2. Status priority
  if (trip.status === "IN_PROGRESS") {
    score += 5000; // Highest priority
  } else if (trip.status === "DELAYED") {
    score += 2500;
  } else if (trip.status === "SCHEDULED") {
    score += 1500;
  } else if (trip.status === "COMPLETED") {
    score -= 1000;
  } else if (trip.status === "CANCELLED") {
    score -= 5000;
  }

  // 3. Shift temporal proximity
  const shift = shifts.find((s) => s.id === trip.shiftId);
  if (shift && isToday) {
    const startMins = parseTimeToMinutes(shift.startTime);
    const endMins = parseTimeToMinutes(shift.endTime) || startMins + 45;

    // Active operational window: 30 mins before departure up to 60 mins after scheduled arrival
    const windowStart = startMins - 30;
    const windowEnd = endMins + 60;

    if (nowMinutes >= windowStart && nowMinutes <= windowEnd) {
      score += 3000; // Currently active operational window!
    } else {
      // Proximity bonus: closer to start time gets higher score
      const diff = Math.abs(nowMinutes - startMins);
      const proximityBonus = Math.max(0, 1000 - diff);
      score += proximityBonus;
    }
  }

  return score;
}

/**
 * Resolves the single most relevant active trip for a given bus.
 * Prioritizes:
 * 1. IN_PROGRESS trip
 * 2. Today's trip in the active operational shift window
 * 3. Today's next scheduled trip
 * 4. Any today trip
 * 5. Fallback to latest non-completed trip
 */
export function getBestTripForBus(
  busId: number | string,
  trips: Trip[],
  shifts: Shift[]
): Trip | undefined {
  const busTrips = trips.filter((t) => String(t.busId) === String(busId));
  if (busTrips.length === 0) return undefined;

  const nowMins = getNowMinutesIST();
  const todayStr = getTodayIST();

  const scored = busTrips.map((t) => ({
    trip: t,
    score: scoreTripForNow(t, shifts, nowMins, todayStr),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.trip;
}

/**
 * Resolves the active operational trip for a conductor / crew member or fleet overview.
 */
export function resolveActiveTrip(
  trips: Trip[],
  shifts: Shift[],
  options?: {
    busId?: number | string;
    conductorId?: string;
    conductorName?: string;
    selectedTripId?: string;
  }
): Trip | undefined {
  if (trips.length === 0) return undefined;

  // 1. Explicit selection has highest priority if valid
  if (options?.selectedTripId) {
    const explicit = trips.find((t) => t.id === options.selectedTripId);
    if (explicit) return explicit;
  }

  // 2. Bus specific resolution
  if (options?.busId !== undefined && options?.busId !== null && options?.busId !== "") {
    const busTrip = getBestTripForBus(options.busId, trips, shifts);
    if (busTrip) return busTrip;
  }

  // 3. Conductor assigned trips
  const nowMins = getNowMinutesIST();
  const todayStr = getTodayIST();

  let candidateTrips = trips;
  if (options?.conductorId || options?.conductorName) {
    const myTrips = trips.filter(
      (t) =>
        (options.conductorId && t.conductorId === options.conductorId) ||
        (options.conductorName && t.conductorId === options.conductorName)
    );
    if (myTrips.length > 0) {
      candidateTrips = myTrips;
    }
  }

  const scored = candidateTrips.map((t) => ({
    trip: t,
    score: scoreTripForNow(t, shifts, nowMins, todayStr),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.trip;
}

/**
 * Maps a row from `bus_reservations` into a strongly-typed `Booking` domain object.
 */
export function mapBusReservationToBooking(res: any, defaultTripDate?: string): Booking {
  const chosenSeat = res.chosen_seat || res.seat_number || undefined;
  const isBoarded = res.status === "BOARDED";
  const dateStr = res.reservation_date || defaultTripDate || getTodayIST();

  return {
    id: res.id,
    bookingCode: res.booking_code || `RES-${chosenSeat || "PASS"}-${res.id.slice(0, 6)}`,
    studentId: res.student_id,
    tripId: res.trip_id,
    busId: res.bus_id ? Number(res.bus_id) : undefined,
    bookingDate: dateStr,
    boardingStopId: res.boarding_stop_id || res.stop_id || "",
    status: (res.status as any) || "CONFIRMED",
    waitlistPosition: res.waitlist_position,
    seatNumber: chosenSeat,
    passengerType: chosenSeat ? "SEATED" : "STANDING_TILL_MERGE",
    mergeStopId: res.merge_stop_id,
    confirmedAt: res.created_at,
    boardedAt: res.boarded_at,
    roamingStatus: isBoarded ? "ONBOARD_CONFIRMED" : "CONFIRMED",
    createdAt: res.created_at || new Date().toISOString(),
  };
}

/**
 * Merges raw `bus_reservations` into a unified `Booking[]` roster without duplicates.
 * If a reservation has seat allocation or boarding status, it enriches/overwrites the booking.
 */
export function mergeReservationsIntoBookings(
  bookings: Booking[],
  reservations: any[]
): Booking[] {
  if (!reservations || reservations.length === 0) return bookings;

  const result = [...bookings];
  const lookup = new Map<string, number>();

  result.forEach((b, idx) => {
    // Key by tripId + studentId
    const key = `${b.tripId}__${b.studentId}`;
    lookup.set(key, idx);
    // Also key by booking id
    lookup.set(b.id, idx);
  });

  for (const raw of reservations) {
    if (!raw || raw.status === "CANCELLED") continue;
    const key = `${raw.trip_id}__${raw.student_id}`;
    const mapped = mapBusReservationToBooking(raw);

    if (lookup.has(key)) {
      const existingIdx = lookup.get(key)!;
      const existing = result[existingIdx];
      // Enrich existing booking with reservation data (especially seatNumber & boarding status)
      result[existingIdx] = {
        ...existing,
        seatNumber: mapped.seatNumber || existing.seatNumber,
        status: mapped.status || existing.status,
        passengerType: mapped.seatNumber ? "SEATED" : existing.passengerType,
        boardedAt: mapped.boardedAt || existing.boardedAt,
        roamingStatus: mapped.roamingStatus || existing.roamingStatus,
        boardingStopId: mapped.boardingStopId || existing.boardingStopId,
        busId: mapped.busId || existing.busId,
      };
    } else if (lookup.has(raw.id)) {
      const existingIdx = lookup.get(raw.id)!;
      result[existingIdx] = {
        ...result[existingIdx],
        ...mapped,
      };
    } else {
      lookup.set(key, result.length);
      lookup.set(mapped.id, result.length);
      result.push(mapped);
    }
  }

  return result;
}
