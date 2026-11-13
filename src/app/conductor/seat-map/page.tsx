"use client";

import React, { useMemo, useState } from "react";
import { useConductorContext, type EnrichedPassenger } from "@/components/conductor/ConductorContext";
import { SeatMapTab } from "@/components/conductor/tabs/SeatMapTab";
import { SeatInspectorModal } from "@/components/conductor/modals/SeatInspectorModal";
import type { Student, Booking } from "@/lib/types";

type SeatSelection = {
  seatCode: string;
  booking?: Booking;
  student?: Student;
  isBoarded?: boolean;
  isConfirmed?: boolean;
  isWaitlisted?: boolean;
};

export default function SeatMapPage() {
  const { activeTrip, bus, route, shift, tripBookings, students, boardedCount, pendingCount, showToast, markAttendance } = useConductorContext();
  const [selected, setSelected] = useState<SeatSelection | null>(null);
  const [picked, setPicked] = useState<EnrichedPassenger | null>(null);

  const waiting = useMemo(() => tripBookings.filter((b) => b.isUnseated && !b.isBoarded), [tripBookings]);

  if (!activeTrip) return null;

  const onSelectSeat = async (seat: SeatSelection) => {
    // Student picked from the "no seat yet" list + free seat tapped → board them on that seat.
    if (picked && !seat.booking) {
      const ok = await markAttendance(picked.studentId, "BOARDED", "SEAT_MAP_SELECT", undefined, seat.seatCode);
      if (ok) setPicked(null);
      return;
    }
    setSelected(seat);
  };

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
        onSelectSeat={onSelectSeat}
        waiting={waiting}
        pickedStudentId={picked?.studentId || null}
        onPickPassenger={setPicked}
      />
      {selected && (
        <SeatInspectorModal
          seatData={selected}
          trip={activeTrip}
          bookings={tripBookings}
          students={students}
          onClose={() => setSelected(null)}
          onMarkAttendance={(studentId, status) => {
            void markAttendance(studentId, status, "SEAT_MAP_SELECT", undefined, selected.booking ? undefined : selected.seatCode);
          }}
          onAssignWaitlist={async (bookingId, seatCode) => {
            const p = tripBookings.find((b) => b.id === bookingId);
            if (p) await markAttendance(p.studentId, "BOARDED", "SEAT_MAP_SELECT", undefined, seatCode);
          }}
          onToast={showToast}
        />
      )}
    </>
  );
}
