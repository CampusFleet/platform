"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { store } from "@/lib/client-store";
import { Shift, Trip } from "@/lib/types";
import {
  getNowIST,
  getTodayIST,
  getDayOfWeekIST,
  getCurrentTimeIST,
  getCurrentMinutesIST,
  formatTimeIST,
  getShiftOperationalStatus,
  getActiveShift,
  getNextUpcomingShift,
  isTripCutoffPassed,
  getTripLiveStatus,
  formatMinutesCountdown,
  timeStringToMinutes,
  minutesToTimeString,
  ShiftOperationalStatus,
  TripLiveStatus,
} from "@/lib/time-manager";

interface CampusTimeContextValue {
  // Live Time Data in IST
  currentTime: string;             // e.g. "8:35 AM"
  currentTime24: string;           // e.g. "08:35"
  currentDate: string;             // e.g. "2026-09-15"
  dayOfWeek: string;               // e.g. "Tuesday"
  currentMinutes: number;          // Minutes from midnight in IST (0 - 1439)

  // Operational Shift Context
  shifts: Shift[];
  activeShift: Shift | null;
  nextShift: Shift | null;
  timeToNextShift: string;         // e.g. "45m" or "2h 10m"

  // Helper Methods
  getShiftStatus: (shift: Shift) => {
    status: ShiftOperationalStatus;
    label: string;
    badgeColor: string;
    minutesToDeparture: number;
    minutesToCutoff: number;
    isBookingOpen: boolean;
  };
  getTripStatus: (trip: Trip, shift?: Shift) => {
    status: TripLiveStatus;
    label: string;
    delayMins: number;
    badgeClass: string;
  };
  isCutoffPassed: (trip: Trip, shift?: Shift) => boolean;

  // Demo Simulation Capabilities (for testing any time of day)
  isSimulating: boolean;
  simulatedTimeStr: string | null;
  setSimulatedTime: (timeStr: string | null) => void;
  resetSimulatedTime: () => void;
}

const CampusTimeContext = createContext<CampusTimeContextValue | null>(null);

export function CampusTimeProvider({ children }: { children: React.ReactNode }) {
  const [shifts, setShifts] = useState<Shift[]>(() => store.getShifts());
  const [tick, setTick] = useState(0);
  const [simulatedMinutes, setSimulatedMinutes] = useState<number | null>(null);

  // Synchronize shifts from store
  useEffect(() => {
    const unsub = store.subscribe(() => {
      setShifts(store.getShifts());
    });
    return unsub;
  }, []);

  // Update clock every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => (t + 1) % 10000);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Effective minutes from midnight
  const effectiveMinutes = useMemo(() => {
    if (simulatedMinutes !== null) return simulatedMinutes;
    return getCurrentMinutesIST();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulatedMinutes, tick]);

  const currentDate = useMemo(() => getTodayIST(), [tick]);
  const dayOfWeek = useMemo(() => getDayOfWeekIST(), [tick]);
  const currentTime24 = useMemo(() => minutesToTimeString(effectiveMinutes), [effectiveMinutes]);
  const currentTime = useMemo(() => formatTimeIST(currentTime24), [currentTime24]);

  const activeShift = useMemo(() => {
    return getActiveShift(shifts, effectiveMinutes);
  }, [shifts, effectiveMinutes]);

  const nextShiftData = useMemo(() => {
    return getNextUpcomingShift(shifts, effectiveMinutes);
  }, [shifts, effectiveMinutes]);

  const nextShift = nextShiftData.shift;
  const timeToNextShift = useMemo(() => {
    return formatMinutesCountdown(nextShiftData.minutesToStart);
  }, [nextShiftData.minutesToStart]);

  const getShiftStatus = useCallback(
    (shift: Shift) => {
      return getShiftOperationalStatus(shift, effectiveMinutes);
    },
    [effectiveMinutes]
  );

  const getTripStatus = useCallback(
    (trip: Trip, shift?: Shift) => {
      const resolvedShift = shift || shifts.find((s) => s.id === trip.shiftId);
      return getTripLiveStatus(trip, resolvedShift, effectiveMinutes);
    },
    [shifts, effectiveMinutes]
  );

  const isCutoffPassed = useCallback(
    (trip: Trip, shift?: Shift) => {
      const resolvedShift = shift || shifts.find((s) => s.id === trip.shiftId);
      return isTripCutoffPassed(trip, resolvedShift, effectiveMinutes);
    },
    [shifts, effectiveMinutes]
  );

  const setSimulatedTime = useCallback((timeStr: string | null) => {
    if (!timeStr) {
      setSimulatedMinutes(null);
    } else {
      setSimulatedMinutes(timeStringToMinutes(timeStr));
    }
  }, []);

  const resetSimulatedTime = useCallback(() => {
    setSimulatedMinutes(null);
  }, []);

  const value = useMemo<CampusTimeContextValue>(
    () => ({
      currentTime,
      currentTime24,
      currentDate,
      dayOfWeek,
      currentMinutes: effectiveMinutes,
      shifts,
      activeShift,
      nextShift,
      timeToNextShift,
      getShiftStatus,
      getTripStatus,
      isCutoffPassed,
      isSimulating: simulatedMinutes !== null,
      simulatedTimeStr: simulatedMinutes !== null ? currentTime24 : null,
      setSimulatedTime,
      resetSimulatedTime,
    }),
    [
      currentTime,
      currentTime24,
      currentDate,
      dayOfWeek,
      effectiveMinutes,
      shifts,
      activeShift,
      nextShift,
      timeToNextShift,
      getShiftStatus,
      getTripStatus,
      isCutoffPassed,
      simulatedMinutes,
      setSimulatedTime,
      resetSimulatedTime,
    ]
  );

  return <CampusTimeContext.Provider value={value}>{children}</CampusTimeContext.Provider>;
}

export function useCampusTime(): CampusTimeContextValue {
  const context = useContext(CampusTimeContext);
  if (!context) {
    // Fallback safe dummy context if invoked outside provider
    const nowMins = getCurrentMinutesIST();
    const c24 = minutesToTimeString(nowMins);
    const shifts = store.getShifts();
    return {
      currentTime: formatTimeIST(c24),
      currentTime24: c24,
      currentDate: getTodayIST(),
      dayOfWeek: getDayOfWeekIST(),
      currentMinutes: nowMins,
      shifts,
      activeShift: getActiveShift(shifts, nowMins),
      nextShift: getNextUpcomingShift(shifts, nowMins).shift,
      timeToNextShift: "30m",
      getShiftStatus: (sh) => getShiftOperationalStatus(sh, nowMins),
      getTripStatus: (t, sh) => getTripLiveStatus(t, sh, nowMins),
      isCutoffPassed: (t, sh) => isTripCutoffPassed(t, sh, nowMins),
      isSimulating: false,
      simulatedTimeStr: null,
      setSimulatedTime: () => {},
      resetSimulatedTime: () => {},
    };
  }
  return context;
}
