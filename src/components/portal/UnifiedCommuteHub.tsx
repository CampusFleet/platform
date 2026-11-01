"use client";

import React, { useState, useEffect } from "react";
import { store } from "@/lib/store";
import SmartTransitCockpit from "./SmartTransitCockpit";
import type { Student, Bus, Trip, Shift, Stop, Booking, Staff, Route } from "@/lib/types";

interface UnifiedCommuteHubProps {
  initialUser: any;
  initialStudents: Student[];
  initialBuses: Bus[];
  initialTrips: Trip[];
  initialShifts: Shift[];
  initialStops: Stop[];
  initialBookings: Booking[];
  initialStaff: Staff[];
  initialRoutes: Route[];
  initialReservation?: any;
  initialSchedule?: any;
}

export default function UnifiedCommuteHub({
  initialUser,
  initialStudents,
  initialBuses,
  initialTrips,
  initialShifts,
  initialStops,
  initialBookings,
  initialStaff,
  initialRoutes,
  initialReservation,
  initialSchedule,
}: UnifiedCommuteHubProps) {
  const [currentUser, setCurrentUser] = useState(initialUser || store.getCurrentUser());
  const [students, setStudents] = useState<Student[]>(() =>
    initialStudents.length > 0 ? initialStudents : store.getStudents()
  );
  const [bookings, setBookings] = useState<Booking[]>(() =>
    initialBookings.length > 0 ? initialBookings : store.getBookings()
  );

  useEffect(() => {
    store.hydrate({
      user: initialUser,
      students: initialStudents,
      buses: initialBuses,
      trips: initialTrips,
      shifts: initialShifts,
      stops: initialStops,
      bookings: initialBookings,
      staff: initialStaff,
      routes: initialRoutes,
    });
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      setStudents(store.getStudents());
      setBookings(store.getBookings());
    });
    return unsub;
  }, []);

  const userEffectiveId = currentUser?.userId || currentUser?.id;
  const activeStudent = currentUser
    ? students.find(
        (s) =>
          (currentUser.studentId && s.id === currentUser.studentId) ||
          (userEffectiveId && (s.userId === userEffectiveId || s.id === userEffectiveId)) ||
          (currentUser.email && s.email?.toLowerCase() === currentUser.email?.toLowerCase())
      ) || undefined
    : undefined;

  return (
    <div className="space-y-6">
      <SmartTransitCockpit
        student={activeStudent}
        user={currentUser}
        buses={initialBuses}
        stops={initialStops}
        shifts={initialShifts}
        trips={initialTrips}
        bookings={bookings}
        routes={initialRoutes}
        staff={initialStaff}
        students={students}
        initialReservation={initialReservation}
        initialSchedule={initialSchedule}
      />
    </div>
  );
}

