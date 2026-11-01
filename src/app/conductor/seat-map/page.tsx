"use client";

import React, { useState } from "react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { SeatMapTab } from "@/components/conductor/tabs/SeatMapTab";
import { SeatInspectorModal } from "@/components/conductor/modals/SeatInspectorModal";
import { store } from "@/lib/store";
import { Student, Booking } from "@/lib/types";

export default function SeatMapPage() {
  const { 
    activeTrip, bus, route, shift, tripBookings, students, bookings,
    boardedCount, pendingCount, showToast, markAttendance
  } = useConductorContext();

  const [selectedSeatForModal, setSelectedSeatForModal] = useState<{
    seatCode: string;
    booking?: Booking;
    student?: Student;
    isBoarded?: boolean;
    isConfirmed?: boolean;
    isWaitlisted?: boolean;
  } | null>(null);

  if (!activeTrip) {
    return (
      <div className="p-8 text-center text-zinc-500 font-mono">
        No active trip selected. Please select a bus from the top bar to inspect seating floorplan.
      </div>
    );
  }

  return (
    <>
      <SeatMapTab
        bus={bus}
        route={route}
        shift={shift}
        tripBookings={tripBookings}
        students={students}
        boardedCount={boardedCount}
        pendingCount={pendingCount}
        onSelectSeat={setSelectedSeatForModal}
      />
      {selectedSeatForModal && (
        <SeatInspectorModal
          seatData={selectedSeatForModal}
          trip={activeTrip}
          bookings={bookings}
          students={students}
          onClose={() => setSelectedSeatForModal(null)}
          onMarkAttendance={(studentId, status) => {
            markAttendance(studentId, status, "SEAT_MAP_SELECT", `Assigned to Seat ${selectedSeatForModal.seatCode}`);
          }}
          onAssignWaitlist={async (bookingId, seatCode) => {
            await store.assignWaitlistSeat(bookingId, seatCode);
          }}
          onToast={showToast}
        />
      )}
    </>
  );
}
