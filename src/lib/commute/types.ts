import type { Student, Bus, Stop, Shift, Trip, Booking, Route, Staff } from "@/lib/types";

export type CommuteStage =
  | "LOADING"
  | "DAY_OFF"
  | "SHIFTS_CONCLUDED"
  | "NO_BUS_ASSIGNED"
  | "WALKING_TO_STOP"
  | "SEAT_SELECTION"
  | "RIDE_CONFIRMED";

export interface CommuteResolvedEntities {
  activeBooking: Booking | null;
  assignedBus: Bus | null;
  assignedRoute: Route | null;
  assignedStop: Stop | null;
  assignedShift: Shift | null;
  assignedConductor: Staff | null;
  transportManager: Staff | null;
  assignedDriverName: string;
  confirmedSeatNumber: string | null;
  isTripInProgress: boolean;
  isTodayOff: boolean;
  isAllShiftsOver: boolean;
  isAttendanceMarked: boolean;
}

export interface FirstMileMetrics {
  userToStopDistMeters: number | null;
  busToStopDistMeters: number | null;
  busToUserDistMeters: number | null;
  walkingEtaMins: number;
  busEtaMins: number | null;
  arrivalCushionMins: number | null;
  liveEtaText: string;
  googleMapsWalkingUrl: string | null;
  walkingCoordinates: [number, number][];
}

export interface SeatPartnerState {
  activePartnership: any | null;
  incomingRequests: any[];
  outgoingRequests: any[];
  rowPreference: string;
  positionPreference: string;
  partnerSeat: string | null;
  partnerName: string | null;
}

