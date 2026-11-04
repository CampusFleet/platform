"use client";

import React from "react";
import {
  BusFront,
  MapPin,
  Clock,
  UserCheck,
  Users,
  CheckCircle2,
  Lock,
  Unlock,
  Radio,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import type { Bus, Stop, Booking } from "@/lib/types";
import { InteractiveBusSeatGrid } from "@/components/booking/InteractiveBusSeatGrid";
import { AttendanceLockCard } from "@/components/portal/AttendanceLockCard";

interface CommuteSeatSelectionStageProps {
  assignedBus: Bus;
  assignedStop: Stop | null;
  assignedShiftName: string;
  assignedShiftStartTime: string;
  studentId?: string;
  activeBookings: Booking[];
  selectedSeat: string | null;
  occupiedSeats: string[];
  isLockCleared: boolean;
  isSavingSeat: boolean;
  isChangingSeat: boolean;
  isTeacher: boolean;
  userRole?: string;
  seatPartnerData: {
    partnerSeat: string | null;
    partnerName: string | null;
    incomingRequests: any[];
  };
  onSelectSeat: (seatNumber: string) => void;
  onConfirmSeat: (seatNumber: string) => void;
  onOpenSeatPartnerModal: () => void;
  onCancelSeatChange?: () => void;
  onAttendanceUnlocked?: () => void;
  formatShiftTime: (time?: string) => string;
}

export function CommuteSeatSelectionStage({
  assignedBus,
  assignedStop,
  assignedShiftName,
  assignedShiftStartTime,
  studentId,
  activeBookings,
  selectedSeat,
  occupiedSeats,
  isLockCleared,
  isSavingSeat,
  isChangingSeat,
  isTeacher,
  userRole,
  seatPartnerData,
  onSelectSeat,
  onConfirmSeat,
  onOpenSeatPartnerModal,
  onCancelSeatChange,
  onAttendanceUnlocked,
  formatShiftTime,
}: CommuteSeatSelectionStageProps) {
  const displayBusNumber = assignedBus.busNumber ? `Bus ${assignedBus.busNumber}` : `Bus #${assignedBus.id}`;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6 animate-in fade-in duration-300">
      {/* Assigned Bus Info Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner shrink-0">
            <BusFront className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">
              Assigned Bus Vehicle
            </span>
            <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white">
              {displayBusNumber}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-pink-500" />
            <span className="font-semibold text-zinc-900 dark:text-white">
              {assignedStop ? assignedStop.name : "Assigned Pick-Up Stop"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>
              {assignedShiftStartTime
                ? `${formatShiftTime(assignedShiftStartTime)} Departure`
                : "Scheduled Departure"}
            </span>
          </div>
        </div>
      </div>

      {/* Attendance Security Card (Anti-Proxy Protection) */}
      {!isLockCleared && (
        <div className="space-y-2">
          <AttendanceLockCard
            busId={assignedBus.id}
            studentId={studentId}
            busNumber={assignedBus.busNumber}
            gpsDeviceId={assignedBus.gpsDeviceId}
            onUnlocked={onAttendanceUnlocked}
          />
        </div>
      )}

      {/* Seat Selection Header & Controls */}
      <div className="pt-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>{isChangingSeat ? "Switch to a Different Seat" : "Choose Your Seat & Verify Attendance"}</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isLockCleared
                ? "Proximity verified! Tap an available seat on the interactive 2D layout to confirm."
                : "Attendance is locked. Clear anti-proxy verification above before claiming your seat."}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onOpenSeatPartnerModal}
              className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
            >
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Seat Partner & Preferences</span>
              {seatPartnerData.incomingRequests.length > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-500/20 animate-pulse" />
              )}
            </button>

            {isChangingSeat && onCancelSeatChange && (
              <button
                type="button"
                onClick={onCancelSeatChange}
                className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition-all cursor-pointer"
              >
                Keep Current Seat
              </button>
            )}
          </div>
        </div>

        {/* Interactive 2D Seat Grid */}
        <div className="p-4 sm:p-6 rounded-2xl bg-zinc-50/60 dark:bg-zinc-950/40 border border-zinc-200/80 dark:border-zinc-800">
          <InteractiveBusSeatGrid
            bus={assignedBus}
            activeBookings={activeBookings}
            selectedSeat={selectedSeat}
            onSelectSeat={onSelectSeat}
            disabled={!isLockCleared || isSavingSeat}
            isTeacher={isTeacher}
            userRole={userRole}
            teacherCount={(assignedBus as any)?.teacherSeatsCount || (assignedBus as any)?.teacher_seats_count}
            occupiedSeats={occupiedSeats}
            partnerSeat={seatPartnerData.partnerSeat}
            partnerName={seatPartnerData.partnerName}
          />
        </div>

        {/* Confirm Seat CTA Bar */}
        {selectedSeat && (
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                {selectedSeat}
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-900 dark:text-white">
                  Seat {selectedSeat} Selected
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Ready to confirm attendance on {displayBusNumber}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onConfirmSeat(selectedSeat)}
              disabled={isSavingSeat || !isLockCleared}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSavingSeat ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Confirming Attendance...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Seat {selectedSeat} & Mark Attendance</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

