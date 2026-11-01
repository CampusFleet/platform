"use client";

import React from "react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { ManifestTab } from "@/components/conductor/tabs/ManifestTab";
import { store } from "@/lib/store";

export default function ManifestPage() {
  const { 
    activeTrip, bus, route, shift, tripBookings, students, stops,
    boardedCount, pendingCount, waitlistCount, roamingCount, showToast,
    markAttendance, refreshLiveState, isSyncing
  } = useConductorContext();

  if (!activeTrip) {
    return (
      <div className="p-8 text-center text-zinc-500 font-mono">
        No active trip selected. Please select a bus from the top bar to view manifest.
      </div>
    );
  }

  const handleMarkRoamingHold = async (studentId: string, bookingId: string) => {
    try {
      const res = await fetch("/api/boarding/roaming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CHECK_IN_ROAMING",
          studentId,
          bookingId,
          tripId: activeTrip.id,
          busId: bus?.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const student = students.find(s => s.id === studentId || s.userId === studentId);
        showToast(`🎒 Seat held for ${student?.fullName || "Student"}! Roaming Campus without bag on seat.`);
      }
    } catch {
      showToast("Failed to mark roaming hold.");
    }
  };

  return (
    <ManifestTab
      tripBookings={tripBookings}
      students={students}
      stops={stops}
      bus={bus}
      route={route}
      shift={shift}
      boardedCount={boardedCount}
      pendingCount={pendingCount}
      waitlistCount={waitlistCount}
      roamingCount={roamingCount}
      onMarkAttendance={markAttendance}
      onMarkRoamingHold={handleMarkRoamingHold}
      onRefresh={refreshLiveState}
      isSyncing={isSyncing}
    />
  );
}
