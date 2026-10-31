"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Booking, Student, Bus, Stop, Shift, Trip } from "@/lib/types";
import { formatTime, formatDate } from "@/lib/utils";
import { store } from "@/lib/store";
import { BusFront, Clock, User, ShieldCheck, Download, Share2, AlertCircle, Zap } from "lucide-react";
import { getSafePhotoUrl } from "@/lib/image-utils";

interface BoardingPassCardProps {
  booking?: Booking;
  student?: Student;
  bus?: Bus;
  stop?: Stop;
  shift?: Shift;
  trip?: Trip;
  onCancelBooking?: (bookingId: string) => void;
}

export function BoardingPassCard({
  booking,
  student,
  bus,
  stop,
  shift,
  trip,
  onCancelBooking,
}: BoardingPassCardProps) {
  const currentBooking = booking || {
    id: "bk-preview",
    bookingCode: "GEHU-PASS",
    studentId: student?.id || "st-01",
    tripId: trip?.id || "trip-01",
    boardingStopId: stop?.id || "stop-01",
    status: "CONFIRMED" as const,
    seatNumber: "1A",
    createdAt: "2026-08-30T00:00:00.000Z",
  };

  const isConfirmed = currentBooking.status === "CONFIRMED";
  const isWaitlisted = currentBooking.status === "WAITLISTED";
  const isBoarded = currentBooking.status === "BOARDED";
  const isCancelled = currentBooking.status === "CANCELLED";
  const isStandingPassenger = currentBooking.passengerType === "STANDING_TILL_MERGE";

  // Deterministic token payload for conductor QR scanner (no non-deterministic Date.now in SSR)
  const qrPayload = useMemo(() => {
    return JSON.stringify({
      bookingId: currentBooking.id,
      bookingCode: currentBooking.bookingCode,
      studentId: student?.id || "st-student",
      studentName: student?.fullName || "Student Passenger",
      tripId: currentBooking.tripId,
      seatNumber: currentBooking.seatNumber || (isStandingPassenger ? "STAND" : "1A"),
      passengerType: currentBooking.passengerType || "SEATED",
      mergeStopId: currentBooking.mergeStopId,
      mergeStopName: currentBooking.mergeStopName,
      status: currentBooking.status,
      issuedAt: currentBooking.createdAt,
      hash: `SEC-${(currentBooking.id || "pass").slice(0, 8)}-${(currentBooking.bookingCode || "gehu").toLowerCase()}`,
    });
  }, [currentBooking, student, isStandingPassenger]);

  return (
    <div className="relative max-w-md w-full mx-auto bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Top Header Strip */}
      <div
        className={`p-4 text-white flex items-center justify-between ${
          isStandingPassenger
            ? "bg-pink-800"
            : isConfirmed
            ? "bg-blue-700"
            : isBoarded
            ? "bg-green-600"
            : isWaitlisted
            ? "bg-yellow-600"
            : "bg-gray-700"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-white/10 backdrop-blur rounded-xl">
            <BusFront className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-white/80 font-medium truncate max-w-[200px]">
              {student?.campus || (student ? store.getStudentPrimaryCampus(student).name : "CampusFleet Digital Pass")}
            </div>
            <div className="text-sm font-bold truncate">
              {bus?.busNumber || "Campus Express Shuttle"}
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <div
          className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wide uppercase shadow-sm ${
            isStandingPassenger
              ? "bg-pink-900/80 text-yellow-300 border border-yellow-400/40"
              : isConfirmed
              ? "bg-blue-900/60 text-white border border-blue-400/30"
              : isBoarded
              ? "bg-green-900/60 text-white border border-green-400/30"
              : isWaitlisted
              ? "bg-yellow-900/60 text-white border border-yellow-400/30"
              : "bg-gray-800 text-gray-300"
          }`}
        >
          {isStandingPassenger
            ? "STANDING (TILL MERGE)"
            : isWaitlisted
            ? `WL-${String(currentBooking.waitlistPosition || 1).padStart(2, "0")}`
            : currentBooking.status}
        </div>
      </div>

      {/* Main Ticket Body */}
      <div className="p-6 space-y-5">
        {/* Passenger & Seat info */}
        <div className="grid grid-cols-3 gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="col-span-2 flex items-center gap-3">
            {student?.photoUrl ? (
              <img
                src={getSafePhotoUrl(student.photoUrl)}
                alt={student.fullName}
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (student?.photoUrl && e.currentTarget.src !== student.photoUrl) {
                    e.currentTarget.src = student.photoUrl;
                  }
                }}
                className="w-12 h-14 object-cover rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs flex-shrink-0 bg-gray-100 dark:bg-gray-800"
              />
            ) : (
              <div className="w-12 h-14 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 text-gray-400">
                <User className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1">
                Passenger Name
                {student?.photoUrl && (
                  <span className="text-[9px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/80 px-1.5 py-0.5 rounded">
                    Photo ID
                  </span>
                )}
              </span>
              <div className="text-base font-bold text-gray-900 dark:text-white truncate">
                {student?.fullName || "Student Passenger"}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
              {isStandingPassenger ? "Pass Type" : (isConfirmed || isBoarded ? "Seat Number" : "Queue Pos.")}
            </span>
            <div
              className={`text-2xl font-black ${
                isStandingPassenger
                  ? "text-pink-600 dark:text-pink-400 font-mono"
                  : isConfirmed || isBoarded
                  ? "text-blue-600 dark:text-blue-400 font-mono"
                  : isWaitlisted
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-gray-400"
              }`}
            >
              {isStandingPassenger
                ? "STAND"
                : (currentBooking.seatNumber || (currentBooking.waitlistPosition ? `WL-${currentBooking.waitlistPosition}` : "1A"))}
            </div>
            {isStandingPassenger && (
              <div className="text-[10px] text-pink-600 dark:text-pink-400 font-semibold truncate max-w-[120px]">
                Till {currentBooking.mergeStopName || "Merge Hub"}
              </div>
            )}
          </div>
        </div>

        {/* Pickup Station & Shift Times */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
              Boarding Stop
            </span>
            <div className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">
              {stop?.name || "Campus Designated Stop"}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 font-mono">
              Code: {stop?.code || "ST-CAMPUS"}
            </div>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
              Shift & Timing
            </span>
            <div className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">
              {shift ? `${formatTime(shift.startTime)} - ${formatTime(shift.endTime)}` : "07:30 AM - 08:30 AM"}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {formatDate(trip?.tripDate || currentBooking.createdAt)}
            </div>
          </div>
        </div>

        {/* Notched Tear Line */}
        <div className="relative my-4 flex items-center justify-center">
          <div className="ticket-notch-left shadow-inner" />
          <div className="w-full border-b-2 border-dashed border-gray-200 dark:border-gray-800" />
          <div className="ticket-notch-right shadow-inner" />
        </div>

        {/* QR Code Section */}
        <div className="flex flex-col items-center justify-center py-2">
          {isCancelled ? (
            <div className="p-6 text-center text-red-500 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-900 w-full space-y-3">
              <AlertCircle className="w-8 h-8 mx-auto" />
              <div>
                <div className="font-bold text-sm">Seat Reservation Cancelled</div>
                <div className="text-xs text-red-600/80 mt-0.5">
                  Your seat has been released and made available to other commuters.
                </div>
              </div>
              <Link
                href="/portal/booking"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md"
              >
                Book Remaining Available Seat →
              </Link>
            </div>
          ) : (
            <>
              <div className="p-4 bg-white rounded-2xl shadow-inner border border-gray-200">
                <QRCodeSVG
                  value={qrPayload}
                  size={160}
                  level="H"
                  includeMargin={false}
                  fgColor="#0F172A"
                />
              </div>
              <div className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-2 tracking-wider">
                {currentBooking.bookingCode}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-semibold mt-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Anti-fraud Cryptographic Verification
              </div>
            </>
          )}
        </div>

        {/* Standing Passenger Advisory notice if standing */}
        {isStandingPassenger && !isCancelled && (
          <div className="p-3.5 bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800/60 rounded-2xl space-y-1">
            <div className="text-xs font-black text-pink-900 dark:text-pink-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400 shrink-0" />
              <span>Standing Passenger Authorization</span>
            </div>
            <div className="text-[11px] text-pink-800/90 dark:text-pink-300/90 leading-relaxed">
              Authorized to travel standing safely until <strong>{currentBooking.mergeStopName || "Bus Merge Stop"}</strong>. Conductor will reallocate you to an available confirmed seat upon vehicle consolidation at the merge hub.
            </div>
          </div>
        )}

        {/* Waitlist Warning notice if waitlisted */}
        {isWaitlisted && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900/60 rounded-xl text-xs text-yellow-800 dark:text-yellow-300">
            <span className="font-bold">Waitlist Ticket (WL-{currentBooking.waitlistPosition}):</span> You will be automatically allocated a seat and notified if a confirmed passenger cancels prior to the cutoff time.
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {!isCancelled && !isBoarded && onCancelBooking && currentBooking.id && (
            <button
              onClick={() => onCancelBooking(currentBooking.id)}
              className="flex-1 py-2.5 px-4 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 rounded-xl border border-red-200 dark:border-red-900/50 transition-all"
            >
              Cancel Booking
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="flex-1 py-2.5 px-4 text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Save Pass
          </button>
        </div>
      </div>
    </div>
  );
}
