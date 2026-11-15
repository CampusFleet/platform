"use client";

import React, { useEffect, useState } from "react";
import { store } from "@/lib/client-store";
import { formatDate } from "@/lib/utils";
import { CalendarCheck, Search, Filter, Sparkles, XCircle, ArrowRight, ShieldCheck } from "lucide-react";
import type { Booking, Student, Trip, Bus, Stop } from "@/lib/types";

export interface StaffReservationsProps {
  initialBookings?: Booking[];
  initialStudents?: Student[];
  initialTrips?: Trip[];
  initialBuses?: Bus[];
  initialStops?: Stop[];
}

export default function StaffReservationsView({
  initialBookings = [],
  initialStudents = [],
  initialTrips = [],
  initialBuses = [],
  initialStops = [],
}: StaffReservationsProps = {}) {
  const [bookings, setBookings] = useState<Booking[]>(() => initialBookings.length > 0 ? initialBookings : store.getBookings());
  const [students, setStudents] = useState<Student[]>(() => initialStudents.length > 0 ? initialStudents : store.getStudents());
  const [trips, setTrips] = useState<Trip[]>(() => initialTrips.length > 0 ? initialTrips : store.getTrips());
  const [buses, setBuses] = useState<Bus[]>(() => initialBuses.length > 0 ? initialBuses : store.getBuses());
  const [stops, setStops] = useState<Stop[]>(() => initialStops.length > 0 ? initialStops : store.getStops());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setBookings(store.getBookings());
      setStudents(store.getStudents());
      setTrips(store.getTrips());
      setBuses(store.getBuses());
      setStops(store.getStops());
    });
    return unsub;
  }, []);

  const handleCancelAndPromote = async (bookingId: string) => {
    const res = await store.cancelBooking(bookingId);
    setToastMessage(res.message);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const filteredBookings = bookings.filter(b => {
    const s = students.find(stud => stud.id === b.studentId);
    const matchesSearch =
      s?.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.bookingCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.seatNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
          <CalendarCheck className="w-7 h-7 text-blue-600" />
          Campus Fleet Seat Reservations & Allocations
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Inspect and manage verified student seat bookings, vehicle allocations, and cancellations.
        </p>
      </div>

      {toastMessage && (
        <div className="p-4 bg-green-50 dark:bg-green-950/40 border border-green-300 dark:border-green-800 rounded-2xl text-xs font-bold text-green-900 dark:text-green-200 animate-in fade-in">
          {toastMessage}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search booking code, passenger name..."
            className="w-full text-xs pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {["ALL", "CONFIRMED", "BOARDED", "CANCELLED"].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === st
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-bold text-gray-400 border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="p-3.5">Booking Code</th>
                <th className="p-3.5">Passenger</th>
                <th className="p-3.5">Assigned Bus</th>
                <th className="p-3.5">Boarding Stop</th>
                <th className="p-3.5">Seat</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Booking Date</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredBookings.map(b => {
                const s = students.find(stud => stud.id === b.studentId);
                const stop = stops.find(st => st.id === b.boardingStopId);
                const trip = trips.find(t => t.id === b.tripId);
                const bus = buses.find(busItem => busItem.id === (b.busId || trip?.busId));
                const isConfirmed = b.status === "CONFIRMED";
                const isBoarded = b.status === "BOARDED";
                const isCancelled = b.status === "CANCELLED";

                return (
                  <tr key={b.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="p-3.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {b.bookingCode}
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {s?.fullName}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-gray-800 dark:text-gray-200">
                        {bus?.busNumber || "Assigned Bus"}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400">
                        {bus?.registrationNo || b.busId || "--"}
                      </div>
                    </td>
                    <td className="p-3.5 text-gray-700 dark:text-gray-300">
                      {stop?.name || "Campus Terminal"}
                    </td>
                    <td className="p-3.5 font-mono font-black text-sm">
                      {b.seatNumber || "--"}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isConfirmed
                            ? "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300"
                            : isBoarded
                            ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-gray-500">
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="p-3.5 text-right">
                      {isConfirmed && (
                        <button
                          onClick={() => handleCancelAndPromote(b.id)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 font-bold rounded-xl text-[11px] border border-red-200 dark:border-red-900/60 transition-colors"
                          title="Cancel confirmed seat reservation and release back to fleet"
                        >
                          Cancel Reservation
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
