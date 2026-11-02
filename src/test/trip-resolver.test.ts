import { describe, it, expect } from "vitest";
import {
  scoreTripForNow,
  getBestTripForBus,
  resolveActiveTrip,
  mapBusReservationToBooking,
  mergeReservationsIntoBookings,
  parseTimeToMinutes,
} from "../lib/trip-resolver";
import type { Trip, Shift, Booking } from "../lib/types";

describe("Trip and Shift Resolver & Reservation Unification", () => {
  const shifts: Shift[] = [
    {
      id: "shift-1",
      name: "Morning Academic Daily Shift",
      shiftType: "MORNING",
      direction: "HOME_TO_CAMPUS",
      startTime: "07:15",
      endTime: "08:45",
      bookingCutoffMins: 30,
    },
    {
      id: "shift-halfday",
      name: "Afternoon Half-Day Departure",
      shiftType: "AFTERNOON",
      direction: "CAMPUS_TO_HOME",
      startTime: "13:30",
      endTime: "14:15",
      bookingCutoffMins: 20,
    },
    {
      id: "shift-2",
      name: "Evening Return Daily Corridor",
      shiftType: "EVENING",
      direction: "CAMPUS_TO_HOME",
      startTime: "16:45",
      endTime: "21:00",
      bookingCutoffMins: 30,
    },
  ];

  const trips: Trip[] = [
    {
      id: "trip-old-sept",
      tripCode: "TRIP-GEHUBHT02-M-20260924",
      routeId: "route-bus-2",
      busId: 2,
      shiftId: "shift-1",
      driverId: "drv-1",
      conductorId: "staff-cnd-02",
      tripDate: "2026-09-24",
      status: "COMPLETED",
      delayMinutes: 0,
      manifestLocked: true,
      currentStopIndex: 0,
    },
    {
      id: "trip-today-morning",
      tripCode: "TRIP-GEHUBHT02-0715-20261102",
      routeId: "route-bus-2",
      busId: 2,
      shiftId: "shift-1",
      driverId: "drv-1",
      conductorId: "staff-cnd-02",
      tripDate: "2026-11-02",
      status: "SCHEDULED",
      delayMinutes: 0,
      manifestLocked: false,
      currentStopIndex: 0,
    },
    {
      id: "trip-today-afternoon",
      tripCode: "TRIP-GEHUBHT02-1330-20261102",
      routeId: "route-bus-2",
      busId: 2,
      shiftId: "shift-halfday",
      driverId: "drv-1",
      conductorId: "staff-cnd-02",
      tripDate: "2026-11-02",
      status: "SCHEDULED",
      delayMinutes: 0,
      manifestLocked: false,
      currentStopIndex: 0,
    },
    {
      id: "trip-today-evening",
      tripCode: "TRIP-GEHUBHT02-1645-20261102",
      routeId: "route-bus-2",
      busId: 2,
      shiftId: "shift-2",
      driverId: "drv-1",
      conductorId: "staff-cnd-02",
      tripDate: "2026-11-02",
      status: "SCHEDULED",
      delayMinutes: 0,
      manifestLocked: false,
      currentStopIndex: 0,
    },
  ];

  it("parseTimeToMinutes converts HH:MM properly", () => {
    expect(parseTimeToMinutes("07:15")).toBe(7 * 60 + 15);
    expect(parseTimeToMinutes("13:30")).toBe(13 * 60 + 30);
    expect(parseTimeToMinutes("16:45")).toBe(16 * 60 + 45);
  });

  it("correctly prioritizes today afternoon trip during 14:25 IST window", () => {
    const nowMinutes = 14 * 60 + 25; // 14:25 (865 mins)
    const todayStr = "2026-11-02";

    const scoreOld = scoreTripForNow(trips[0], shifts, nowMinutes, todayStr);
    const scoreMorning = scoreTripForNow(trips[1], shifts, nowMinutes, todayStr);
    const scoreAfternoon = scoreTripForNow(trips[2], shifts, nowMinutes, todayStr);
    const scoreEvening = scoreTripForNow(trips[3], shifts, nowMinutes, todayStr);

    expect(scoreAfternoon).toBeGreaterThan(scoreOld);
    expect(scoreAfternoon).toBeGreaterThan(scoreMorning);
    expect(scoreAfternoon).toBeGreaterThan(scoreEvening);
  });

  it("getBestTripForBus selects the active afternoon departure for bus 2 during afternoon window", () => {
    // When time is afternoon (e.g. 13:45 or 14:25)
    const bestTrip = getBestTripForBus(2, trips, shifts);
    expect(bestTrip).toBeDefined();
    // It should be one of today's scheduled trips, not the 2-month-old trip
    expect(bestTrip?.tripDate).toBe("2026-11-02");
    expect(bestTrip?.id).not.toBe("trip-old-sept");
  });

  it("prioritizes an IN_PROGRESS trip over scheduled trips", () => {
    const inProgressTrips: Trip[] = [
      ...trips.map(t => t.id === "trip-today-afternoon" ? { ...t, status: "IN_PROGRESS" as const } : t)
    ];
    const bestTrip = getBestTripForBus(2, inProgressTrips, shifts);
    expect(bestTrip?.id).toBe("trip-today-afternoon");
    expect(bestTrip?.status).toBe("IN_PROGRESS");
  });

  it("mapBusReservationToBooking formats reservation into standard Booking", () => {
    const rawRes = {
      id: "res-uuid-1",
      student_id: "stud-1",
      trip_id: "trip-today-afternoon",
      bus_id: 2,
      chosen_seat: "8B",
      shift_id: "shift-halfday",
      status: "BOARDED",
      reservation_date: "2026-11-02",
      created_at: "2026-11-02T08:00:00Z",
      boarded_at: "2026-11-02T13:40:00Z",
    };

    const booking = mapBusReservationToBooking(rawRes);
    expect(booking.id).toBe("res-uuid-1");
    expect(booking.seatNumber).toBe("8B");
    expect(booking.status).toBe("BOARDED");
    expect(booking.roamingStatus).toBe("ONBOARD_CONFIRMED");
    expect(booking.busId).toBe(2);
  });

  it("mergeReservationsIntoBookings correctly enriches and unifies bookings with seat allocations", () => {
    const existingBookings: Booking[] = [
      {
        id: "bk-1",
        bookingCode: "BK-0001",
        studentId: "stud-1",
        tripId: "trip-today-afternoon",
        boardingStopId: "stop-1",
        status: "CONFIRMED",
        createdAt: "2026-11-02T07:00:00Z",
      },
      {
        id: "bk-2",
        bookingCode: "BK-0002",
        studentId: "stud-2",
        tripId: "trip-today-afternoon",
        boardingStopId: "stop-2",
        status: "CONFIRMED",
        createdAt: "2026-11-02T07:00:00Z",
      },
    ];

    const rawReservations = [
      {
        id: "res-uuid-1",
        student_id: "stud-1",
        trip_id: "trip-today-afternoon",
        bus_id: 2,
        chosen_seat: "8B",
        shift_id: "shift-halfday",
        status: "BOARDED",
        reservation_date: "2026-11-02",
        created_at: "2026-11-02T08:00:00Z",
        boarded_at: "2026-11-02T13:40:00Z",
      },
      {
        id: "res-uuid-3",
        student_id: "stud-3",
        trip_id: "trip-today-afternoon",
        bus_id: 2,
        chosen_seat: "4A",
        shift_id: "shift-halfday",
        status: "CONFIRMED",
        reservation_date: "2026-11-02",
        created_at: "2026-11-02T08:05:00Z",
      },
    ];

    const merged = mergeReservationsIntoBookings(existingBookings, rawReservations);

    // Should have 3 total unique passengers
    expect(merged.length).toBe(3);

    // stud-1 should now have seat 8B and status BOARDED!
    const stud1 = merged.find(b => b.studentId === "stud-1");
    expect(stud1).toBeDefined();
    expect(stud1?.seatNumber).toBe("8B");
    expect(stud1?.status).toBe("BOARDED");
    expect(stud1?.roamingStatus).toBe("ONBOARD_CONFIRMED");

    // stud-3 should be added with seat 4A
    const stud3 = merged.find(b => b.studentId === "stud-3");
    expect(stud3).toBeDefined();
    expect(stud3?.seatNumber).toBe("4A");
    expect(stud3?.status).toBe("CONFIRMED");
  });
});
