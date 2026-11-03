"use client";

import React, { useMemo } from "react";
import { Bus, Booking } from "@/lib/types";
import { generateSeatLayout, parseSeatLayout, isStartingSeat, getTeacherStartingSeats } from "@/lib/utils";
import { Check, User, Info, Disc, GraduationCap, Users, Sparkles } from "lucide-react";

interface InteractiveBusSeatGridProps {
  bus: Bus;
  activeBookings: Booking[];
  selectedSeat: string | null;
  onSelectSeat: (seatNumber: string) => void;
  disabled?: boolean;
  isTeacher?: boolean;
  userRole?: string;
  teacherCount?: number;
  occupiedSeats?: string[];
  partnerSeat?: string | null;
  partnerName?: string | null;
  autoAssignedSeat?: string | null;
}

export function InteractiveBusSeatGrid({
  bus,
  activeBookings,
  selectedSeat,
  onSelectSeat,
  disabled = false,
  isTeacher = false,
  userRole,
  teacherCount,
  occupiedSeats: externalOccupiedSeats = [],
  partnerSeat,
  partnerName,
  autoAssignedSeat,
}: InteractiveBusSeatGridProps) {
  if (!bus) {
    return (
      <div className="p-12 text-center text-xs text-gray-400 font-mono bg-gray-50 dark:bg-gray-800/40 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
        No bus vehicle allocated to this schedule yet.
      </div>
    );
  }

  const isFacultyUser = Boolean(
    isTeacher ||
    userRole === "teacher" ||
    userRole === "faculty" ||
    userRole === "staff" ||
    userRole === "admin" ||
    userRole === "TEACHER" ||
    userRole === "FACULTY" ||
    userRole === "STAFF" ||
    userRole === "ADMIN"
  );

  const occupiedSeats = useMemo(() => {
    const fromBookings = (activeBookings || [])
      .filter((b) => {
        // Must belong to this bus if booking has busId
        if (b.busId && bus?.id && b.busId !== bus.id) return false;
        return b.status === "CONFIRMED" || b.status === "BOARDED";
      })
      .map((b) => b.seatNumber)
      .filter(Boolean) as string[];

    const fromExternal = (externalOccupiedSeats || []).filter(Boolean);
    return Array.from(new Set([...fromBookings, ...fromExternal]));
  }, [activeBookings, bus?.id, externalOccupiedSeats]);

  const layout = bus.seatLayout || "NONE";
  const capacity = Number(bus.capacity || 0);
  const customRows = bus.totalRows;
  const { left: leftCount, right: rightCount } = parseSeatLayout(layout);
  const leftCols = Array.from({ length: leftCount }, (_, i) => String.fromCharCode(65 + i));
  const rightCols = Array.from({ length: rightCount }, (_, i) => String.fromCharCode(65 + leftCount + i));

  const allGeneratedSeats = useMemo(
    () => generateSeatLayout(capacity, layout, customRows),
    [capacity, layout, customRows]
  );

  // Generate matrix of rows based on allGeneratedSeats
  const rows = useMemo(() => {
    if (!capacity || capacity <= 0) return [];
    const seatSet = new Set(allGeneratedSeats);

    let maxRow = 0;
    allGeneratedSeats.forEach((s: string) => {
      const match = s.match(/^(\d+)/);
      if (match) {
        const r = parseInt(match[1], 10);
        if (r > maxRow) maxRow = r;
      }
    });

    const result: {
      rowNumber: number;
      isLastRow: boolean;
      leftSeats: string[];
      middleSeat: string | null;
      rightSeats: string[];
    }[] = [];

    for (let r = 1; r <= maxRow; r++) {
      const isLastRow = r === maxRow && maxRow > 1;
      const left = leftCols.map((c) => `${r}${c}`).filter((s) => seatSet.has(s));
      const right = rightCols.map((c) => `${r}${c}`).filter((s) => seatSet.has(s));
      const middle = isLastRow && seatSet.has(`${r}M`) ? `${r}M` : null;

      result.push({
        rowNumber: r,
        isLastRow,
        leftSeats: left,
        middleSeat: middle,
        rightSeats: right,
      });
    }

    return result;
  }, [allGeneratedSeats, capacity, leftCols, rightCols]);

  const effectiveTeacherCount = useMemo(() => {
    if (typeof teacherCount === "number" && teacherCount >= 0) {
      return teacherCount;
    }
    if (typeof (bus as any)?.teacherSeatsCount === "number") {
      return (bus as any).teacherSeatsCount;
    }
    if (typeof (bus as any)?.teacher_seats_count === "number") {
      return (bus as any).teacher_seats_count;
    }
    return 0;
  }, [teacherCount, bus]);

  const teacherReservedSeatSet = useMemo(() => {
    if (effectiveTeacherCount <= 0) return new Set<string>();
    return new Set(getTeacherStartingSeats(allGeneratedSeats, effectiveTeacherCount));
  }, [allGeneratedSeats, effectiveTeacherCount]);

  const renderSeatButton = (seatNum: string, seatTypeDescription: string) => {
    const isSelected = selectedSeat === seatNum;
    const isOccupied = !isSelected && occupiedSeats.includes(seatNum);
    const isFrontStartingSeat = teacherReservedSeatSet.has(seatNum);
    const isRestrictedFacultySeat = isFrontStartingSeat && !isFacultyUser;
    const isPartnerSeat = partnerSeat && partnerSeat.toUpperCase() === seatNum.toUpperCase();
    const isAutoAssigned = autoAssignedSeat && autoAssignedSeat.toUpperCase() === seatNum.toUpperCase();

    return (
      <button
        key={seatNum}
        type="button"
        disabled={isOccupied || disabled || isRestrictedFacultySeat}
        onClick={() => onSelectSeat(seatNum)}
        title={
          isPartnerSeat
            ? `Seat ${seatNum} is occupied by your Seat Partner (${partnerName || "Companion"})`
            : isOccupied
            ? `Seat ${seatNum} is already occupied`
            : isRestrictedFacultySeat
            ? `Seat ${seatNum} is one of ${effectiveTeacherCount} starting seats reserved exclusively for Faculty & Teachers`
            : isFrontStartingSeat
            ? `Seat ${seatNum} (Faculty Priority Starting Seat)`
            : isAutoAssigned
            ? `Seat ${seatNum} (Auto-Assigned based on your preference & partner)`
            : `Select Seat ${seatNum} (${seatTypeDescription})`
        }
        className={`relative w-10 h-11 sm:w-11 sm:h-12 rounded-xl flex flex-col items-center justify-center font-mono font-bold text-xs transition-all ${
          isPartnerSeat
            ? "bg-pink-100 dark:bg-pink-950/60 border-2 border-pink-500 text-pink-700 dark:text-pink-300 font-black shadow-md cursor-not-allowed"
            : isOccupied
            ? "bg-gray-200 dark:bg-gray-800/60 border border-gray-300 dark:border-gray-700/40 text-gray-400 dark:text-gray-600 cursor-not-allowed"
            : isRestrictedFacultySeat
            ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-2 border-indigo-300/80 dark:border-indigo-700/60 text-indigo-700 dark:text-indigo-300 cursor-not-allowed shadow-none"
            : isSelected
            ? isFrontStartingSeat
              ? "bg-indigo-600 text-white font-black shadow-lg shadow-indigo-600/30 scale-105 ring-2 ring-indigo-400"
              : "bg-green-500 text-gray-950 font-black shadow-lg shadow-green-500/30 scale-105 ring-2 ring-green-400"
            : isAutoAssigned
            ? "bg-emerald-50 dark:bg-emerald-950/50 border-2 border-dashed border-emerald-500 text-emerald-800 dark:text-emerald-200 hover:scale-105 active:scale-95 shadow-sm ring-1 ring-emerald-400"
            : isFrontStartingSeat
            ? "bg-white dark:bg-gray-800 border-2 border-indigo-500/80 text-indigo-700 dark:text-indigo-300 hover:border-indigo-600 hover:scale-105 active:scale-95 shadow-sm"
            : "bg-white dark:bg-gray-800 border-2 border-green-500/70 text-gray-900 dark:text-gray-100 hover:border-blue-500 hover:scale-105 active:scale-95 shadow-sm"
        }`}
      >
        {/* Seat Top Notch Cushion Effect */}
        <span
          className={`absolute top-1 inset-x-1.5 sm:inset-x-2 h-1 rounded-full ${
            isSelected
              ? "bg-gray-950/20"
              : isPartnerSeat
              ? "bg-pink-400"
              : isOccupied
              ? "bg-gray-300 dark:bg-gray-700"
              : isFrontStartingSeat
              ? "bg-indigo-300 dark:bg-indigo-700"
              : "bg-green-200 dark:bg-green-800"
          }`}
        />

        {isRestrictedFacultySeat ? (
          <div className="flex flex-col items-center justify-center mt-1">
            <GraduationCap className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 mb-0.5" />
            <span className="text-[9px] font-black leading-none">{seatNum}</span>
          </div>
        ) : isPartnerSeat ? (
          <div className="flex flex-col items-center justify-center mt-1">
            <Users className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400 mb-0.5" />
            <span className="text-[9px] font-black leading-none">{seatNum}</span>
          </div>
        ) : (
          <span className="mt-1 text-[11px] font-bold flex items-center gap-0.5">
            {isFrontStartingSeat && <GraduationCap className="w-2.5 h-2.5 text-indigo-500 dark:text-indigo-400" />}
            {isAutoAssigned && !isSelected && <Sparkles className="w-2.5 h-2.5 text-emerald-600" />}
            {seatNum}
          </span>
        )}

        {isSelected && (
          <Check className="w-3 h-3 text-current font-black stroke-[3]" />
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center select-none w-full">
      {/* Bus Vehicle Outer Chassis */}
      <div className="relative w-full max-w-[340px] sm:max-w-sm bg-gray-50 dark:bg-gray-900/90 rounded-[2rem] sm:rounded-[2.5rem] p-3.5 sm:p-6 border-2 border-gray-300 dark:border-gray-700 shadow-xl">
        {/* Bus Front Windshield & Driver Cabin */}
        <div className="relative flex items-center justify-between pb-5 mb-4 border-b-2 border-dashed border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping" />
            <div className="text-[11px] font-black uppercase tracking-wider text-gray-400">
              Front / Entry Gate
            </div>
          </div>

          {/* Steering Wheel Indicator (redBus inspired) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
            <svg
              className="w-5 h-5 fill-current rotate-90"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-1.77.58-3.41 1.56-4.74L8.71 10.4c-.45.47-.71 1.1-.71 1.6 0 1.66 1.34 3 3 3s3-1.34 3-3c0-.5-.26-1.13-.71-1.6l3.15-3.14C19.42 8.59 20 10.23 20 12c0 4.41-3.59 8-8 8zm0-10c-.55 0-1-.45-1-1 0-.32.16-.6.4-.77L12 6.07l.6.16c.24.17.4.45.4.77 0 .55-.45 1-1 1z" />
            </svg>
            <span className="text-[10px] font-black uppercase">Driver</span>
          </div>
        </div>

        {/* Faculty Row Banner */}
        {effectiveTeacherCount > 0 ? (
          <div className="mb-4 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 text-[10px] sm:text-[11px] font-semibold text-indigo-800 dark:text-indigo-200 flex flex-wrap items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
              <span>Starting Seats: {effectiveTeacherCount} Teacher{effectiveTeacherCount !== 1 ? "s" : ""}</span>
            </span>
            {isFacultyUser ? (
              <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-indigo-600 text-white shadow-xs">
                Teacher Access ({effectiveTeacherCount})
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                Restricted ({effectiveTeacherCount} Seats)
              </span>
            )}
          </div>
        ) : (
          <div className="mb-4 px-3.5 py-2 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span>Open Seating: All seats open for commuters</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
              No Reserved Seats
            </span>
          </div>
        )}

        {/* Seats Cabin Rows */}
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.rowNumber} className="flex items-center justify-between gap-1.5 sm:gap-3">
              {/* Left Column Seats */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {row.leftSeats.map((seatNum, sIdx) =>
                  renderSeatButton(seatNum, sIdx === 0 ? "Window" : "Aisle")
                )}
              </div>

              {/* Central Aisle Space OR Rear Bench Middle Seat */}
              {row.isLastRow && row.middleSeat ? (
                <div className="flex-1 flex items-center justify-center">
                  {renderSeatButton(row.middleSeat, "Rear Center / Middle")}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-[9px] font-mono uppercase text-gray-300 dark:text-gray-700 tracking-widest">
                    Aisle
                  </span>
                </div>
              )}

              {/* Right Column Seats */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {row.rightSeats.map((seatNum, sIdx) =>
                  renderSeatButton(
                    seatNum,
                    sIdx === row.rightSeats.length - 1 ? "Window" : "Aisle"
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* redBus-inspired Seat State Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-5 text-xs text-gray-600 dark:text-gray-300 font-semibold">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-lg bg-white dark:bg-gray-800 border-2 border-green-500" />
          <span>Available Seat</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-lg bg-green-500 text-gray-950 font-bold flex items-center justify-center text-[10px]">
            ✓
          </div>
          <span>Your Selected Seat</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border-2 border-indigo-400 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-[10px]">
            <GraduationCap className="w-2.5 h-2.5" />
          </div>
          <span>Reserved for Teachers (First {effectiveTeacherCount} Seats)</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-lg bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700" />
          <span>Occupied / Sold</span>
        </div>
      </div>
    </div>
  );
}
