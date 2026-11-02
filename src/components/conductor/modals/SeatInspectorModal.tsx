"use client";

import React, { useState } from "react";
import { CheckCircle2, Sparkles, X, QrCode, Phone, MapPin, AlertTriangle, Clock, UserCheck } from "lucide-react";
import { Booking, Student, Trip } from "@/lib/types";
import { QRPassScanner } from "@/components/scanner/QRPassScanner";
import { getSafePhotoUrl } from "@/lib/image-utils";
import type { EnrichedPassenger } from "../ConductorContext";

interface SeatInspectorModalProps {
  seatData: {
    seatCode: string;
    booking?: Booking;
    student?: Student;
    isBoarded?: boolean;
    isConfirmed?: boolean;
    isWaitlisted?: boolean;
  };
  trip: Trip;
  bookings: Booking[];
  students: Student[];
  onClose: () => void;
  onMarkAttendance: (studentId: string, status: "BOARDED") => void;
  onAssignWaitlist: (bookingId: string, seatCode: string) => Promise<void>;
  onToast: (msg: string) => void;
}

export function SeatInspectorModal({
  seatData,
  trip,
  bookings,
  students,
  onClose,
  onMarkAttendance,
  onAssignWaitlist,
  onToast,
}: SeatInspectorModalProps) {
  const [showScanner, setShowScanner] = useState(false);
  const tripBookings = bookings.filter(b => b.tripId === trip.id);

  const booking = seatData.booking || tripBookings.find(b => b.seatNumber === seatData.seatCode || (b as any).seatCode === seatData.seatCode);
  const student = seatData.student || (booking ? (booking as any).student || students.find(s => s.id === booking.studentId || s.userId === booking.studentId) : undefined);
  const fullName = student?.fullName || (booking as any)?.fullName || (booking as any)?.student?.fullName || "University Passenger";
  const studentCollegeId = student?.studentIdCode || (booking as any)?.studentIdCode || (booking as any)?.student?.studentIdCode || "";
  const photoUrl = student?.photoUrl || (booking as any)?.photoUrl || (booking as any)?.student?.photoUrl || "";
  const phone = student?.phone || (booking as any)?.phone || (booking as any)?.student?.phone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 space-y-5 text-white shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white font-mono font-black text-sm shadow-md shadow-blue-500/20">
              Seat {seatData.seatCode}
            </span>
            <span className="text-xs font-bold text-zinc-400">Inspector</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {booking ? (
          <div className="space-y-4">
            {/* Passenger Identity Card */}
            <div className="flex items-center gap-3.5 bg-zinc-900/80 p-3.5 rounded-2xl border border-zinc-800">
              {photoUrl ? (
                <div className="relative w-14 h-16 rounded-xl overflow-hidden border-2 border-emerald-500/70 bg-black shrink-0 shadow-md">
                  <img
                    src={getSafePhotoUrl(photoUrl)}
                    alt={fullName}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={e => {
                      if (photoUrl && e.currentTarget.src !== photoUrl) {
                        e.currentTarget.src = photoUrl;
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-emerald-600 text-[8px] text-white font-black text-center py-0.2 uppercase tracking-tighter">
                    OK
                  </div>
                </div>
              ) : (
                <div className="w-14 h-16 rounded-xl border border-dashed border-red-500/60 bg-red-950/30 flex flex-col items-center justify-center text-red-400 shrink-0 p-1 text-center">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-[7px] font-black uppercase tracking-tighter text-red-400 mt-1">
                    Check ID
                  </span>
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-bold text-base text-white truncate">{fullName}</div>

                {studentCollegeId && (
                  <div className="inline-block font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                    ID: {studentCollegeId}
                  </div>
                )}

                {student?.department && (
                  <div className="text-[11px] text-zinc-400 truncate">
                    {student.department} {student.semester ? `• Sem ${student.semester}` : ""}
                  </div>
                )}
              </div>
            </div>

            {/* Status & Details Box */}
            <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Boarding Status:</span>
                <span
                  className={`font-black px-2.5 py-1 rounded-lg text-[11px] ${
                    booking.status === "BOARDED"
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                      : "bg-blue-950 text-blue-400 border border-blue-800"
                  }`}
                >
                  {booking.status === "BOARDED" ? "BOARDED ✓" : "CONFIRMED / AWAITING"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Ticket Code:</span>
                <span className="font-mono font-bold text-zinc-300">
                  {booking.bookingCode || `BK-${booking.id.substring(0, 6)}`}
                </span>
              </div>

              {phone && (
                <div className="flex justify-between items-center pt-1 border-t border-zinc-800">
                  <span className="text-zinc-400">Phone Contact:</span>
                  <a
                    href={`tel:${phone}`}
                    className="inline-flex items-center gap-1 text-emerald-400 font-mono font-bold hover:underline"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{phone}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {booking.status !== "BOARDED" ? (
              <button
                onClick={() => {
                  if (booking.studentId) {
                    onMarkAttendance(booking.studentId, "BOARDED");
                  }
                  onClose();
                }}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Confirm Passenger Boarded</span>
              </button>
            ) : (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl text-center text-xs text-emerald-300 font-bold flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Passenger Verified & Onboard</span>
              </div>
            )}
          </div>
        ) : showScanner ? (
          <div className="space-y-4">
            <h4 className="font-black text-sm text-center text-white">
              Scan Student Pass to Assign to Seat {seatData.seatCode}
            </h4>
            <QRPassScanner
              trip={trip}
              bookings={bookings}
              students={students}
              onAttendanceSuccess={(name, method) => {
                onToast(`✓ Assigned & Boarded: ${name} to Seat ${seatData.seatCode} via ${method}!`);
                onClose();
              }}
            />
            <button
              onClick={() => setShowScanner(false)}
              className="w-full py-2.5 bg-zinc-900 text-zinc-300 font-bold text-xs rounded-xl hover:text-white transition-colors cursor-pointer"
            >
              Cancel Scanner
            </button>
          </div>
        ) : (
          <div className="text-center py-4 space-y-4">
            <div className="text-xs text-zinc-400 font-mono bg-zinc-900 p-3.5 rounded-2xl border border-zinc-800">
              Seat {seatData.seatCode} is currently unreserved and available on this trip.
            </div>

            <button
              onClick={() => setShowScanner(true)}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-transform active:scale-95 cursor-pointer"
            >
              <QrCode className="w-5 h-5" />
              <span>Scan Student Pass to Assign</span>
            </button>

            {/* Waitlist Allocation Options */}
            {tripBookings.filter(b => b.status === "WAITLISTED").length > 0 && (
              <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-2xl space-y-3 text-left shadow-sm">
                <div className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Allocate to Waitlisted Passenger:</span>
                </div>
                {tripBookings
                  .filter(b => b.status === "WAITLISTED")
                  .slice(0, 3)
                  .map(wlBooking => {
                    const wlStudent = students.find(s => s.id === wlBooking.studentId || s.userId === wlBooking.studentId);
                    return (
                      <button
                        key={wlBooking.id}
                        onClick={async () => {
                          await onAssignWaitlist(wlBooking.id, seatData.seatCode);
                          onToast(`✓ Allocated Seat ${seatData.seatCode} to ${wlStudent?.fullName || "Student"}`);
                          onClose();
                        }}
                        className="w-full py-2.5 px-3 bg-zinc-900 border border-amber-700/40 hover:border-amber-500 text-white font-bold text-xs rounded-xl flex items-center justify-between transition-colors cursor-pointer active:scale-95"
                      >
                        <span className="truncate max-w-[180px]">
                          {wlStudent?.fullName || "Student"} (WL-{wlBooking.waitlistPosition || 1})
                        </span>
                        <span className="font-mono text-[10px] bg-amber-950 text-amber-300 border border-amber-700 px-2 py-0.5 rounded-md">
                          Assign →
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
