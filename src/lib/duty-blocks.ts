import { Trip, Bus, Route, Shift, Staff, UserAccount } from "./types";
import { createTripId } from "./id";

export interface BusDutyBlock {
  busId: number;
  busNumber: number;
  registrationNo: string;
  model: string;
  capacity: number;
  routeId: string;
  routeName: string;
  routeCode: string;

  // Dynamic Incoming Shift (Home -> Campus)
  incomingShiftId: string;
  incomingShiftName: string;
  incomingShiftTime: string;
  incomingTripId?: string;
  incomingTripCode?: string;

  // Dynamic Outgoing Shift (Campus -> Home)
  outgoingShiftId: string;
  outgoingShiftName: string;
  outgoingShiftTime: string;
  outgoingTripId?: string;
  outgoingTripCode?: string;

  // Primary Crew assigned to this vehicle block
  driverId?: string;
  conductorId?: string;
  driverName?: string;
  conductorName?: string;
  driverPhone?: string;
  conductorPhone?: string;
  driverLicense?: string;

  // Operational Integrity Status
  dutyStatus: "VERIFIED" | "CONFLICT_MULTIPLE_OUTGOING" | "MISSING_OUTGOING" | "PENDING_CONFIRMATION";

  // Redundant / conflicting trips detected in DB for this bus on target date
  conflictingTrips: Trip[];
  allActiveTrips: Trip[];
}

export interface ShiftSummaryOption {
  id: string;
  name: string;
  shiftType: string;
  direction: string;
  startTime: string;
  endTime: string;
}

/**
 * Dynamically categorizes shifts into Incoming (Home -> Campus) and Outgoing (Campus -> Home).
 * Works dynamically with any shifts stored in the database.
 */
export function categorizeShifts(shifts: Shift[]): {
  incomingShifts: Shift[];
  outgoingShifts: Shift[];
} {
  const activeShifts = shifts.filter((s) => !s.isSpecial);

  const incomingShifts = activeShifts.filter(
    (s) => s.direction === "HOME_TO_CAMPUS" || s.shiftType === "MORNING"
  );

  const outgoingShifts = activeShifts.filter(
    (s) =>
      s.direction === "CAMPUS_TO_HOME" ||
      s.shiftType === "AFTERNOON" ||
      s.shiftType === "EVENING" ||
      (!incomingShifts.some((inc) => inc.id === s.id) && s.direction !== "CAMPUS_TO_CAMPUS")
  );

  return {
    incomingShifts: incomingShifts.length > 0 ? incomingShifts : activeShifts.slice(0, 1),
    outgoingShifts: outgoingShifts.length > 0 ? outgoingShifts : activeShifts.slice(1),
  };
}

/**
 * Builds vehicle duty blocks by dynamically pairing active buses with:
 * 1 Dynamic Incoming Shift (Home -> Campus) + 1 Dynamic Outgoing Shift (Campus -> Home).
 * Detects any duplicate or conflicting outgoing shifts where a bus was scheduled for multiple runs.
 */
export function buildDutyBlocks(
  buses: Bus[],
  routes: Route[],
  shifts: Shift[],
  trips: Trip[],
  staff: Staff[],
  users: UserAccount[],
  targetDate: string
): {
  dutyBlocks: BusDutyBlock[];
  incomingShifts: ShiftSummaryOption[];
  outgoingShifts: ShiftSummaryOption[];
  summary: {
    totalBuses: number;
    incomingCount: number;
    outgoingCounts: Record<string, number>;
    conflictCount: number;
    fullyCrewedCount: number;
    uncrewedCount: number;
  };
} {
  const { incomingShifts, outgoingShifts } = categorizeShifts(shifts);

  const activeBuses = buses
    .filter((b) => b.status === "ACTIVE")
    .sort((a, b) => Number(a.busNumber) - Number(b.busNumber));

  const primaryIncomingShift = incomingShifts[0];
  const dateTrips = trips.filter((t) => t.tripDate === targetDate);

  // Day parity offset for cyclic rotation (e.g. day of month)
  const dayNumber = parseInt(targetDate.replace(/[^0-9]/g, "").slice(-2), 10) || 1;

  const dutyBlocks: BusDutyBlock[] = activeBuses.map((bus, idx) => {
    const route = routes.find((r) => r.id === bus.currentRouteId) || routes[0];
    const busTrips = dateTrips.filter((t) => t.busId === bus.id);

    // 1. Inbound Trip (Home -> Campus)
    const inboundTrip = busTrips.find((t) =>
      incomingShifts.some((s) => s.id === t.shiftId)
    );
    const assignedIncomingShift =
      incomingShifts.find((s) => s.id === inboundTrip?.shiftId) || primaryIncomingShift;

    // 2. Outgoing Trips (Campus -> Home)
    const activeOutboundTrips = busTrips.filter((t) =>
      outgoingShifts.some((s) => s.id === t.shiftId)
    );

    const hasMultipleOutgoing = activeOutboundTrips.length > 1;
    const conflictingTrips: Trip[] = [];

    // Dynamically pick the assigned outgoing shift:
    // If existing trips has exactly 1 outgoing trip, use that
    // If multiple exist (conflict) or none, use dynamic rotation offset across available outgoing shifts
    let assignedOutgoingShift: Shift;
    let selectedOutboundTrip: Trip | undefined;

    if (activeOutboundTrips.length === 1) {
      selectedOutboundTrip = activeOutboundTrips[0];
      assignedOutgoingShift =
        outgoingShifts.find((s) => s.id === selectedOutboundTrip?.shiftId) || outgoingShifts[0];
    } else if (hasMultipleOutgoing) {
      // Pick first or rotatory, flag the rest as conflicts
      const rotIndex = (idx + dayNumber) % outgoingShifts.length;
      assignedOutgoingShift = outgoingShifts[rotIndex] || outgoingShifts[0];
      selectedOutboundTrip = activeOutboundTrips.find((t) => t.shiftId === assignedOutgoingShift.id) || activeOutboundTrips[0];
      
      activeOutboundTrips.forEach((t) => {
        if (t.id !== selectedOutboundTrip?.id) {
          conflictingTrips.push(t);
        }
      });
    } else {
      // No outgoing trip yet in DB: assign via dynamic rotation
      const rotIndex = (idx + dayNumber) % outgoingShifts.length;
      assignedOutgoingShift = outgoingShifts[rotIndex] || outgoingShifts[0];
    }

    // Resolve primary crew
    const driverId = inboundTrip?.driverId || selectedOutboundTrip?.driverId || "";
    const conductorId = inboundTrip?.conductorId || selectedOutboundTrip?.conductorId || "";

    const driverStaff = staff.find((s) => s.id === driverId) || users.find((u) => u.id === driverId);
    const conductorStaff = staff.find((s) => s.id === conductorId) || users.find((u) => u.id === conductorId);

    const dutyStatus = hasMultipleOutgoing
      ? "CONFLICT_MULTIPLE_OUTGOING"
      : !selectedOutboundTrip
      ? "MISSING_OUTGOING"
      : "VERIFIED";

    return {
      busId: bus.id,
      busNumber: bus.busNumber,
      registrationNo: bus.registrationNo || `UK-07-FLEET-${bus.busNumber}`,
      model: bus.model || "Tata Starbus Ultra",
      capacity: bus.capacity || 40,
      routeId: route?.id || "",
      routeName: route?.name || "Campus Corridor",
      routeCode: route?.code || `CR-${bus.busNumber}`,

      incomingShiftId: assignedIncomingShift?.id || "shift-incoming",
      incomingShiftName: assignedIncomingShift?.name || "Incoming Transit Shift",
      incomingShiftTime: assignedIncomingShift?.startTime?.substring(0, 5) || "07:15",
      incomingTripId: inboundTrip?.id,
      incomingTripCode: inboundTrip?.tripCode,

      outgoingShiftId: assignedOutgoingShift?.id || "shift-outgoing",
      outgoingShiftName: assignedOutgoingShift?.name || "Outgoing Transit Shift",
      outgoingShiftTime: assignedOutgoingShift?.startTime?.substring(0, 5) || "16:45",
      outgoingTripId: selectedOutboundTrip?.id,
      outgoingTripCode: selectedOutboundTrip?.tripCode,

      driverId,
      conductorId,
      driverName: driverStaff?.fullName,
      conductorName: conductorStaff?.fullName,
      driverPhone: driverStaff?.phone || undefined,
      conductorPhone: conductorStaff?.phone || undefined,
      driverLicense: (driverStaff as any)?.licenseNo || "Commercial HMV",

      dutyStatus,
      conflictingTrips,
      allActiveTrips: busTrips,
    };
  });

  // Calculate dynamic shift distribution counts
  const outgoingCounts: Record<string, number> = {};
  outgoingShifts.forEach((s) => {
    outgoingCounts[s.id] = dutyBlocks.filter((b) => b.outgoingShiftId === s.id).length;
  });

  const summary = {
    totalBuses: dutyBlocks.length,
    incomingCount: dutyBlocks.filter((b) => b.incomingTripId).length,
    outgoingCounts,
    conflictCount: dutyBlocks.filter((b) => b.dutyStatus === "CONFLICT_MULTIPLE_OUTGOING").length,
    fullyCrewedCount: dutyBlocks.filter((b) => b.driverId && b.conductorId).length,
    uncrewedCount: dutyBlocks.filter((b) => !b.driverId || !b.conductorId).length,
  };

  const formatShiftSummary = (s: Shift): ShiftSummaryOption => ({
    id: s.id,
    name: s.name,
    shiftType: s.shiftType,
    direction: s.direction,
    startTime: s.startTime?.substring(0, 5) || "",
    endTime: s.endTime?.substring(0, 5) || "",
  });

  return {
    dutyBlocks,
    incomingShifts: incomingShifts.map(formatShiftSummary),
    outgoingShifts: outgoingShifts.map(formatShiftSummary),
    summary,
  };
}

/**
 * Dynamically rotates fleet outgoing shift assignments across all available outgoing shifts.
 * Works seamlessly whether there are 2, 3, or N outgoing shifts configured in the database.
 */
export function rotateDutyBlocks(
  currentBlocks: BusDutyBlock[],
  outgoingShifts: ShiftSummaryOption[],
  rotationStep: number = 1
): BusDutyBlock[] {
  if (currentBlocks.length === 0 || outgoingShifts.length === 0) return currentBlocks;

  return currentBlocks.map((block, idx) => {
    const currentShiftIndex = outgoingShifts.findIndex((s) => s.id === block.outgoingShiftId);
    const baseIndex = currentShiftIndex >= 0 ? currentShiftIndex : idx % outgoingShifts.length;
    const nextIndex = (baseIndex + rotationStep) % outgoingShifts.length;
    const nextShift = outgoingShifts[nextIndex];

    return {
      ...block,
      outgoingShiftId: nextShift.id,
      outgoingShiftName: nextShift.name,
      outgoingShiftTime: nextShift.startTime,
      dutyStatus: "PENDING_CONFIRMATION",
    };
  });
}

/**
 * Automatically assigns outgoing shifts dynamically to balance fleet capacity across corridors.
 */
export function autoAssignDutyBlocks(
  currentBlocks: BusDutyBlock[],
  outgoingShifts: ShiftSummaryOption[],
  rotationOffset: number = 0
): BusDutyBlock[] {
  if (currentBlocks.length === 0 || outgoingShifts.length === 0) return currentBlocks;

  return currentBlocks.map((block, idx) => {
    const shiftIndex = (idx + rotationOffset) % outgoingShifts.length;
    const assignedShift = outgoingShifts[shiftIndex];

    return {
      ...block,
      outgoingShiftId: assignedShift.id,
      outgoingShiftName: assignedShift.name,
      outgoingShiftTime: assignedShift.startTime,
      dutyStatus: "PENDING_CONFIRMATION",
    };
  });
}

/**
 * Generates the clean database reconciliation payload for confirmed duty blocks.
 * For each bus:
 * - Upserts 1 trip for incomingShiftId
 * - Upserts 1 trip for outgoingShiftId
 * - Detects and marks any other outgoing trips for that bus on targetDate for deletion.
 */
export function reconcileDutyTrips(
  dutyBlocks: BusDutyBlock[],
  existingTrips: Trip[],
  targetDate: string,
  shifts: Shift[]
): {
  tripsToUpsert: any[];
  tripIdsToDelete: string[];
} {
  const { incomingShifts, outgoingShifts } = categorizeShifts(shifts);
  const dateTrips = existingTrips.filter((t) => t.tripDate === targetDate);
  const tripsToUpsert: any[] = [];
  const tripIdsToDelete: string[] = [];

  const dateCompact = targetDate.replace(/[^0-9]/g, "");

  dutyBlocks.forEach((block) => {
    const routeCode = block.routeCode.toUpperCase().replace(/[^a-zA-Z0-9]/g, "");

    // 1. Inbound Trip
    const existingInbound = dateTrips.find(
      (t) => t.busId === block.busId && t.shiftId === block.incomingShiftId
    );
    const inboundShift = incomingShifts.find((s) => s.id === block.incomingShiftId);
    const inTimeCode = inboundShift?.startTime ? inboundShift.startTime.substring(0, 5).replace(":", "") : "0715";

    const inboundTripId = existingInbound?.id || block.incomingTripId || createTripId();
    const inboundTripCode = existingInbound?.tripCode || `TRIP-${routeCode}-${inTimeCode}-${dateCompact}`;

    tripsToUpsert.push({
      id: inboundTripId,
      trip_code: inboundTripCode,
      route_id: block.routeId,
      bus_id: block.busId,
      shift_id: block.incomingShiftId,
      driver_id: block.driverId || null,
      conductor_id: block.conductorId || null,
      trip_date: targetDate,
      status: existingInbound?.status || "SCHEDULED",
      delay_minutes: existingInbound?.delayMinutes || 0,
      manifest_locked: existingInbound?.manifestLocked || false,
      current_stop_index: existingInbound?.currentStopIndex || 0,
    });

    // 2. Selected Outbound Trip
    const existingSelectedOutbound = dateTrips.find(
      (t) => t.busId === block.busId && t.shiftId === block.outgoingShiftId
    );
    const outboundShift = outgoingShifts.find((s) => s.id === block.outgoingShiftId);
    const outTimeCode = outboundShift?.startTime ? outboundShift.startTime.substring(0, 5).replace(":", "") : "1645";

    const outboundTripId = existingSelectedOutbound?.id || block.outgoingTripId || createTripId();
    const outboundTripCode = existingSelectedOutbound?.tripCode || `TRIP-${routeCode}-${outTimeCode}-${dateCompact}`;

    tripsToUpsert.push({
      id: outboundTripId,
      trip_code: outboundTripCode,
      route_id: block.routeId,
      bus_id: block.busId,
      shift_id: block.outgoingShiftId,
      driver_id: block.driverId || null,
      conductor_id: block.conductorId || null,
      trip_date: targetDate,
      status: existingSelectedOutbound?.status || "SCHEDULED",
      delay_minutes: existingSelectedOutbound?.delayMinutes || 0,
      manifest_locked: existingSelectedOutbound?.manifestLocked || false,
      current_stop_index: existingSelectedOutbound?.currentStopIndex || 0,
    });

    // 3. Prune ANY other outgoing trips for this bus that are not the selected outgoingShiftId
    const otherOutgoingTrips = dateTrips.filter(
      (t) =>
        t.busId === block.busId &&
        t.shiftId !== block.outgoingShiftId &&
        outgoingShifts.some((s) => s.id === t.shiftId)
    );

    otherOutgoingTrips.forEach((t) => {
      if (t.id !== outboundTripId && !tripIdsToDelete.includes(t.id)) {
        tripIdsToDelete.push(t.id);
      }
    });
  });

  return { tripsToUpsert, tripIdsToDelete };
}
