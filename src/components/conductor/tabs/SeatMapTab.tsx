"use client";

import React, { useMemo } from "react";
import { LayoutGrid, GraduationCap, CheckCircle2, User, Users, Compass } from "lucide-react";
import { Booking, Student, Bus, Route, Shift } from "@/lib/types";
import { generateSeatLayout, parseSeatLayout, getTeacherStartingSeats } from "@/lib/utils";
import type { EnrichedPassenger } from "../ConductorContext";

interface SeatMapTabProps {
  bus?: Bus;
  route?: Route;
  shift?: Shift;
  tripBookings: (EnrichedPassenger | Booking)[];
  students: Student[];
  boardedCount: number;
  pendingCount: number;
  onSelectSeat: (seatData: any) => void;
}

export function SeatMapTab({
  bus,
  route,
  shift,
  tripBookings,
  students,
  boardedCount,
  pendingCount,
  onSelectSeat,
}: SeatMapTabProps) {
  const capacity = Number(bus?.capacity || 40);
  const layout = bus?.seatLayout || "TWO_BY_TWO";
  const customRows = (bus as any)?.totalRows;
  const { left: leftCount, right: rightCount } = parseSeatLayout(layout);
  const leftCols = Array.from({ length: leftCount }, (_, i) => String.fromCharCode(65 + i));
  const rightCols = Array.from({ length: rightCount }, (_, i) => String.fromCharCode(65 + leftCount + i));
  const totalGridCols = leftCount > 0 && rightCount > 0 ? leftCount + 1 + rightCount : 4;

  const effectiveTeacherCount =
    typeof (bus as any)?.teacher_seats_count === "number"
      ? (bus as any).teacher_seats_count
      : typeof (bus as any)?.teacherSeatsCount === "number"
      ? (bus as any).teacherSeatsCount
      : 2;

  const allGeneratedSeats = useMemo(() => {
    if (!capacity || capacity <= 0 || !layout || layout === "NONE" || leftCount <= 0 || rightCount <= 0) {
      return generateSeatLayout(capacity || 40, "TWO_BY_TWO", customRows);
    }
    return generateSeatLayout(capacity, layout, customRows);
  }, [capacity, layout, customRows, leftCount, rightCount]);

  const teacherReservedSet = useMemo(() => {
    return new Set(getTeacherStartingSeats(allGeneratedSeats, effectiveTeacherCount));
  }, [allGeneratedSeats, effectiveTeacherCount]);

  // Fast student index map
  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach(s => {
      if (s.id) map.set(s.id, s);
      if (s.userId) map.set(s.userId, s);
    });
    return map;
  }, [students]);

  const rows = useMemo(() => {
    if (allGeneratedSeats.length === 0) return [];
    const seatSet = new Set(allGeneratedSeats);

    let maxRow = 0;
    allGeneratedSeats.forEach((s: string) => {
      const match = s.match(/^(\d+)/);
      if (match) {
        const r = parseInt(match[1], 10);
        if (r > maxRow) maxRow = r;
      }
    });

    const getSeatInfo = (seatCode: string) => {
      const booking = tripBookings.find(
        b => b.seatNumber === seatCode || (b as any).seatCode === seatCode
      );
      const student = booking ? (booking as EnrichedPassenger).student || studentMap.get(booking.studentId) : undefined;
      const isBoarded = booking?.status === "BOARDED" || (booking as any)?.isBoarded;
      return {
        seatCode,
        booking,
        student,
        isBoarded,
        isConfirmed: booking?.status === "CONFIRMED" || (booking?.status as any) === "ASSIGNED",
        isWaitlisted: booking?.status === "WAITLISTED",
      };
    };

    return Array.from({ length: maxRow }, (_, rowIndex) => {
      const rowNum = rowIndex + 1;
      const isLastRow = rowNum === maxRow && maxRow > 1;

      const left = leftCols.map(col => {
        const code = `${rowNum}${col}`;
        return seatSet.has(code) ? getSeatInfo(code) : null;
      });

      const middle = isLastRow && seatSet.has(`${rowNum}M`) ? getSeatInfo(`${rowNum}M`) : null;

      const right = rightCols.map(col => {
        const code = `${rowNum}${col}`;
        return seatSet.has(code) ? getSeatInfo(code) : null;
      });

      return {
        rowNum,
        isLastRow,
        left,
        middle,
        right,
      };
    });
  }, [allGeneratedSeats, leftCols, rightCols, tripBookings, studentMap]);

  const renderSeatButton = (seatData: {
    seatCode: string;
    booking?: Booking;
    student?: Student;
    isBoarded?: boolean;
    isConfirmed?: boolean;
    isWaitlisted?: boolean;
  }) => {
    const isTeacherReserved = teacherReservedSet.has(seatData.seatCode);
    const passengerName = seatData.student?.fullName || (seatData.booking as any)?.fullName;
    const initials = passengerName
      ? passengerName
          .split(" ")
          .map((n: string) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "";

    return (
      <button
        key={seatData.seatCode}
        onClick={() => onSelectSeat(seatData)}
        className={`min-h-[48px] p-2 rounded-2xl font-mono text-xs font-black flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm border ${
          seatData.isBoarded
            ? "bg-emerald-600 border-emerald-500 text-white shadow-emerald-600/30 ring-2 ring-emerald-500/30"
            : seatData.isConfirmed
            ? "bg-blue-600 border-blue-500 text-white shadow-blue-600/30"
            : isTeacherReserved
            ? "bg-purple-950/40 border-purple-800 text-purple-300"
            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"
        }`}
        title={
          seatData.isBoarded
            ? `Seat ${seatData.seatCode}: Boarded by ${passengerName || "Passenger"}`
            : seatData.isConfirmed
            ? `Seat ${seatData.seatCode}: Reserved for ${passengerName || "Passenger"}`
            : isTeacherReserved
            ? `Seat ${seatData.seatCode}: Teacher / Faculty Starting Seat`
            : `Seat ${seatData.seatCode}: Available`
        }
      >
        <div className="flex items-center gap-1 leading-none">
          {seatData.isBoarded ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
          ) : isTeacherReserved && !seatData.isConfirmed ? (
            <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
          ) : null}
          <span className="text-[11px] font-black">{seatData.seatCode}</span>
        </div>

        {initials && (
          <span className="text-[8px] font-sans truncate max-w-[42px] opacity-90 mt-0.5 tracking-tighter">
            {initials}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ── TOP HEADER & LEGEND ── */}
      <div className="bg-zinc-950 dark:bg-black border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-lg text-white flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-blue-400" />
              <span>Interactive Visual Cabin Floorplan</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Top-down spatial view of {bus?.busNumber || "vehicle"}. Tap any seat to inspect passenger credentials or assign walk-ups.
            </p>
          </div>

          {/* Real-time Legend */}
          <div className="flex items-center gap-2.5 text-xs flex-wrap font-bold bg-zinc-900/90 p-3 rounded-2xl border border-zinc-800">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-md bg-emerald-600 shadow-sm shadow-emerald-500/40" />
              <span className="text-zinc-200">Boarded ({boardedCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-md bg-blue-600 shadow-sm shadow-blue-500/40" />
              <span className="text-zinc-200">Awaiting ({pendingCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-md bg-purple-900 border border-purple-500" />
              <span className="text-zinc-200">Faculty ({effectiveTeacherCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-md bg-zinc-800 border border-zinc-700" />
              <span className="text-zinc-400">Available</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BUS CHASSIS COCKPIT MOCKUP ── */}
      <div className="max-w-md mx-auto bg-black p-6 sm:p-7 rounded-[2.5rem] border-2 border-zinc-800 shadow-2xl space-y-6">
        {/* Front Windshield & Driver Cab */}
        <div className="relative rounded-2xl bg-zinc-900/90 border border-zinc-800 p-3.5 text-xs font-bold text-zinc-400 flex items-center justify-between shadow-inner">
          <div className="flex items-center gap-2 text-emerald-400">
            <span>🚪 Front Entry Door</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-300">
            <span>👨‍✈️ Driver Cockpit</span>
          </div>
        </div>

        {/* Center Aisle Seat Grid */}
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 font-mono">
              Generating seat matrix for this vehicle...
            </div>
          ) : (
            rows.map(row => (
              <div
                key={row.rowNum}
                className="grid gap-2.5 items-center"
                style={{ gridTemplateColumns: `repeat(${totalGridCols}, minmax(0, 1fr))` }}
              >
                {/* Left seats */}
                {row.left.map((item, idx) =>
                  item ? (
                    renderSeatButton(item)
                  ) : (
                    <div key={`empty-left-${idx}`} className="w-full h-12" />
                  )
                )}

                {/* Center Aisle Walkway OR Rear Bench Middle Seat */}
                {row.isLastRow && row.middle ? (
                  renderSeatButton(row.middle)
                ) : (
                  <div className="text-center text-[10px] text-zinc-700 font-mono select-none tracking-widest">
                    ││
                  </div>
                )}

                {/* Right seats */}
                {row.right.map((item, idx) =>
                  item ? (
                    renderSeatButton(item)
                  ) : (
                    <div key={`empty-right-${idx}`} className="w-full h-12" />
                  )
                )}
              </div>
            ))
          )}
        </div>

        {/* Rear Exit / Bench Indicator */}
        <div className="text-center text-[10px] font-mono uppercase tracking-widest text-zinc-600 pt-2 border-t border-zinc-900">
          ── Rear Passenger Cabin ──
        </div>
      </div>
    </div>
  );
}
