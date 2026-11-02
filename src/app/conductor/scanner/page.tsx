"use client";

import React, { useState } from "react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { QRPassScanner } from "@/components/scanner/QRPassScanner";
import { Volume2, VolumeX, BellRing, RefreshCw } from "lucide-react";

export default function ScannerPage() {
  const { 
    activeTrip, bus, tripBookings, students, 
    pendingCount, outsideCount, onboardConfirmedCount, runningCount,
    activeDepartureAlert, triggerDepartureAlert, dismissDepartureAlert,
    showToast 
  } = useConductorContext();

  const [isAlertSubmitting, setIsAlertSubmitting] = useState(false);

  if (!activeTrip) {
    return (
      <div className="p-8 text-center text-gray-500 font-mono">
        No active trip selected. Please select a trip from the header.
      </div>
    );
  }

  const unboardedStudents = outsideCount !== undefined ? outsideCount : pendingCount;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Floating Departure Recall Action Bar for Bus Door Conductor */}
      <div className="absolute top-14 inset-x-0 mx-auto w-max max-w-[92vw] z-[120] pointer-events-auto animate-in slide-in-from-top-3">
        {activeDepartureAlert ? (
          <div className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-red-950/90 via-black to-red-950/90 border border-red-500/60 shadow-2xl backdrop-blur-md flex items-center gap-3 text-white text-xs">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-black text-red-300 uppercase tracking-wider text-[11px]">
                Recall Alarm Active
              </span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">
                ✓ {onboardConfirmedCount} in bus
              </span>
              {runningCount > 0 && (
                <span className="text-[10px] text-amber-400 font-mono font-bold animate-pulse">
                  🏃 {runningCount} sprinting
                </span>
              )}
            </div>
            <button
              onClick={async () => {
                setIsAlertSubmitting(true);
                await dismissDepartureAlert();
                setIsAlertSubmitting(false);
              }}
              disabled={isAlertSubmitting}
              className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-[10px] border border-zinc-600 transition-all cursor-pointer flex items-center gap-1"
            >
              <VolumeX className="w-3 h-3" />
              <span>Dismiss</span>
            </button>
          </div>
        ) : (
          <button
            onClick={async () => {
              setIsAlertSubmitting(true);
              await triggerDepartureAlert(
                `🚨 Bus ${bus?.busNumber || "Campus Bus"} is departing immediately! Please board now.`
              );
              setIsAlertSubmitting(false);
            }}
            disabled={isAlertSubmitting}
            className="px-3.5 py-2 rounded-2xl bg-zinc-950/90 hover:bg-red-950/80 border border-amber-500/40 text-white shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-black transition-all cursor-pointer active:scale-95"
            title="Broadcast audible buzzer to unboarded students"
          >
            {isAlertSubmitting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <BellRing className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            )}
            <span>Sound Departure Alarm</span>
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono text-[10px] border border-amber-500/30">
              {unboardedStudents} outside
            </span>
          </button>
        )}
      </div>

      <QRPassScanner
        trip={activeTrip}
        bookings={tripBookings}
        students={students}
        fullScreenMode={true}
        backHref="/conductor"
        onAttendanceSuccess={(name, method) => {
          showToast(`✓ Verified & Marked Present: ${name} via ${method}!`);
        }}
      />
    </div>
  );
}
