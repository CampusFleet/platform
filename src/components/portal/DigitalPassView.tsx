"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { store } from "@/lib/store";
import { StudentSelfScanner } from "@/components/scanner/StudentSelfScanner";
import { formatTime, formatDate } from "@/lib/utils";
import {
  QrCode,
  ArrowLeft,
  CalendarCheck,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Compass,
  BusFront,
  MapPin,
  Clock,
  Sparkles,
  Phone,
  AlertCircle,
  Download,
  Share2,
  RotateCcw,
  CheckCircle2,
  X,
  RefreshCw,
  Camera,
  User,
  ScanFace,
  Radio,
  ScanLine,
} from "lucide-react";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { AttendanceLockCard } from "@/components/portal/AttendanceLockCard";
import type { Student, Bus, Trip, Shift, Stop, Booking, Staff } from "@/lib/types";
import { useAttendancePolicy } from "@/lib/attendance";

export interface DigitalPassProps {
  initialUser?: any;
  initialStudent?: Student;
  initialStudents?: Student[];
  initialBuses?: Bus[];
  initialTrips?: Trip[];
  initialShifts?: Shift[];
  initialStops?: Stop[];
  initialBookings?: Booking[];
  initialStaff?: Staff[];
  isEmbedded?: boolean;
}

export default function DigitalPassView({
  initialUser,
  initialStudent,
  initialStudents = [],
  initialBuses = [],
  initialTrips = [],
  initialShifts = [],
  initialStops = [],
  initialBookings = [],
  initialStaff = [],
  isEmbedded = false,
}: DigitalPassProps = {}) {
  const [currentUser, setCurrentUser] = useState(initialUser || store.getCurrentUser());
  const [students, setStudents] = useState<Student[]>(() => {
    if (initialStudent) {
      const exists = initialStudents.some(s => s.id === initialStudent.id);
      return exists ? initialStudents : [initialStudent, ...initialStudents];
    }
    return initialStudents.length > 0 ? initialStudents : store.getStudents();
  });
  const [activeChildId, setActiveChildId] = useState(store.getActiveChildId());
  const [buses, setBuses] = useState<Bus[]>(() => initialBuses.length > 0 ? initialBuses : store.getBuses());
  const [trips, setTrips] = useState<Trip[]>(() => initialTrips.length > 0 ? initialTrips : store.getTrips());
  const [shifts, setShifts] = useState<Shift[]>(() => initialShifts.length > 0 ? initialShifts : store.getShifts());
  const [stops, setStops] = useState<Stop[]>(() => initialStops.length > 0 ? initialStops : store.getStops());
  const [bookings, setBookings] = useState<Booking[]>(() => initialBookings.length > 0 ? initialBookings : store.getBookings());
  const [staff, setStaff] = useState<Staff[]>(() => initialStaff.length > 0 ? initialStaff : store.getStaff());

  // Full-screen presentation mode for fast scanner reads
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showBackupQr, setShowBackupQr] = useState(false);
  const [securityPing, setSecurityPing] = useState(0);
  const [isBookingShiftId, setIsBookingShiftId] = useState<string | null>(null);
  const [quickBookingError, setQuickBookingError] = useState<string | null>(null);
  const { mode: attendancePolicyMode, rules: attendanceRules } = useAttendancePolicy();

  useEffect(() => {
    if (initialStudent) {
      const existing = store.getStudents();
      if (!existing.some(s => s.id === initialStudent.id)) {
        store.setStudents([initialStudent, ...existing]);
      }
    }
  }, [initialStudent]);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      setStudents(store.getStudents());
      setActiveChildId(store.getActiveChildId());
      setBuses(store.getBuses());
      setTrips(store.getTrips());
      setShifts(store.getShifts());
      setStops(store.getStops());
      setBookings(store.getBookings());
      setStaff(store.getStaff());
    });
    return unsub;
  }, []);

  // Pulse security watermark every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      setSecurityPing(p => (p + 1) % 1000);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeStudent = currentUser
    ? students.find(
        s =>
          (activeChildId && (s.id === activeChildId || s.userId === activeChildId)) ||
          (currentUser.studentId && s.id === currentUser.studentId) ||
          s.userId === currentUser.id ||
          s.userId === currentUser.userId ||
          s.id === currentUser.id ||
          s.email?.toLowerCase() === currentUser.email?.toLowerCase()
      ) || initialStudent || null
    : initialStudent || null;

  const userBookings = currentUser && activeStudent
    ? bookings.filter(
        b =>
          b.studentId === activeStudent.id ||
          b.studentId === activeStudent.userId ||
          b.studentId === currentUser.id ||
          b.studentId === currentUser.studentId ||
          b.studentId === `stud-${currentUser.id}`
      )
    : [];

  const activeBooking = userBookings.find(
    b => b.status === "CONFIRMED" || b.status === "WAITLISTED" || b.status === "BOARDED"
  ) || null;

  const trip = trips.find(t => t.id === activeBooking?.tripId) || trips[0];
  const bus = buses.find(b => b.id === trip?.busId) || buses[0];
  const shift = shifts.find(sh => sh.id === trip?.shiftId) || shifts[0];
  const stop = stops.find(st => st.id === (activeBooking?.boardingStopId || activeStudent?.primaryStopId)) || stops[0];
  const driver = staff.find(s => s.id === trip?.driverId);

  // Special shifts are strictly restricted to allocated students
  const visibleShifts = useMemo(() => {
    return shifts.filter(sh => {
      if (!sh.isSpecial) return true;
      return store.isStudentAllocatedForShift(activeStudent?.id || "", sh.id);
    });
  }, [shifts, activeStudent?.id]);
  const conductor = staff.find(s => s.id === trip?.conductorId);

  const isConfirmed = activeBooking?.status === "CONFIRMED";
  const isWaitlisted = activeBooking?.status === "WAITLISTED";
  const isBoarded = activeBooking?.status === "BOARDED";
  const isStandingPassenger = activeBooking?.passengerType === "STANDING_TILL_MERGE";

  // Server-signed rotating pass token (HMAC, 60 s window) — refreshed before each window ends
  const [signedPass, setSignedPass] = useState<{ studentId: string; window: number; sig: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      let nextInMs = 15000;
      try {
        const res = await fetch("/api/students/pass-token", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data?.success && data.pass) {
          setSignedPass({ studentId: data.pass.studentId, window: data.pass.window, sig: data.pass.sig });
          nextInMs = Math.min(Number(data.pass.refreshInMs) || 15000, 60000);
        }
      } catch {
        // Network hiccup: retry shortly
      }
      if (!cancelled) timer = setTimeout(refresh, nextInMs);
    };
    refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Dynamic QR Token Payload for Conductor Scanner
  const qrPayload = useMemo(() => {
    if (!activeBooking) return "";
    return JSON.stringify({
      type: "DYNAMIC_PASS",
      window: signedPass?.window,
      sig: signedPass?.sig,
      bookingId: activeBooking.id,
      bookingCode: activeBooking.bookingCode,
      studentId: signedPass?.studentId || activeStudent?.id || "st-student",
      studentName: activeStudent?.fullName || currentUser?.fullName || "Student Passenger",
      tripId: activeBooking.tripId,
      seatNumber: activeBooking.seatNumber || (isStandingPassenger ? "STAND" : "1A"),
      passengerType: activeBooking.passengerType || "SEATED",
      mergeStopId: activeBooking.mergeStopId,
      mergeStopName: activeBooking.mergeStopName,
      status: activeBooking.status,
      issuedAt: activeBooking.createdAt,
      hash: `SEC-${(activeBooking.id || "pass").slice(0, 8)}-${(activeBooking.bookingCode || "gehu").toLowerCase()}`,
    });
  }, [activeBooking, activeStudent, currentUser, isStandingPassenger, signedPass]);

  const identityQrPayload = useMemo(() => {
    return JSON.stringify({
      studentId: activeStudent?.id || currentUser?.id || "st-student",
      studentName: activeStudent?.fullName || currentUser?.fullName || "Student",
      type: "STUDENT_IDENTITY"
    });
  }, [activeStudent, currentUser]);

  const handleCancelSeat = async () => {
    if (!activeBooking) return;
    if (
      confirm(
        "Are you sure you want to cancel your reserved seat? The seat will be immediately allocated to the next waitlisted passenger."
      )
    ) {
      const res = await store.cancelBooking(activeBooking.id);
      alert(res.message);
    }
  };

  const handleQuickBookShift = async (shiftId: string) => {
    if (!currentUser || !activeStudent) {
      setQuickBookingError("Please sign in to generate a boarding pass.");
      return;
    }

    setQuickBookingError(null);
    setIsBookingShiftId(shiftId);

    try {
      const shiftObj = shifts.find(s => s.id === shiftId);
      if (shiftObj && shiftObj.isSpecial && !store.isStudentAllocatedForShift(activeStudent.id, shiftId)) {
        setQuickBookingError("This special run is restricted exclusively to allocated students.");
        setIsBookingShiftId(null);
        return;
      }

      let targetTrip = trips.find(
        t => t.shiftId === shiftId && (
          (activeStudent.primaryRouteId && t.routeId === activeStudent.primaryRouteId) ||
          (t.busId && buses.find(b => b.id === t.busId)?.currentRouteId === activeStudent.primaryRouteId)
        )
      );
      if (!targetTrip) {
        targetTrip = trips.find(t => t.shiftId === shiftId);
      }
      if (!targetTrip) {
        setQuickBookingError("No scheduled bus trip found for this shift. Please contact transport admin.");
        return;
      }

      if (store.isTripSpecial(targetTrip) && !store.isTripVisibleToUser(targetTrip, currentUser, activeStudent.id)) {
        setQuickBookingError("This special trip is restricted exclusively to allocated students.");
        setIsBookingShiftId(null);
        return;
      }

      const boardingStopId = activeStudent.primaryStopId || stops[0]?.id || "stop-1";

      const res = await store.bookShift(
        activeStudent.id,
        targetTrip.id,
        boardingStopId
      );

      if (!res.success) {
        setQuickBookingError(res.message || "Failed to reserve pass.");
      }
    } catch (err: any) {
      setQuickBookingError(err?.message || "An unexpected error occurred while booking.");
    } finally {
      setIsBookingShiftId(null);
    }
  };

  const handleShareOrPrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className={`${isEmbedded ? "space-y-4" : "max-w-4xl mx-auto space-y-6 pb-12"} animate-in fade-in`}>
      {!isEmbedded && (
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/portal"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to My Commute Cockpit
          </Link>
        </div>
      )}

      {/* When Signed Out */}
      {!currentUser ? (
        <div className="text-center py-12 p-6 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/80 rounded-2xl flex items-center justify-center mx-auto text-blue-600 dark:text-blue-400">
            <QrCode className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black text-gray-900 dark:text-white">Sign In Required</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
              Please sign in with your university account to display your live cryptographic digital boarding pass.
            </p>
          </div>
          <Link
            href="/login?redirect=/portal/pass"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
          >
            Sign In to View Pass →
          </Link>
        </div>
      ) : activeBooking && activeStudent ? (
        /* ========================================================================= */
        /* ACTIVE BOARDING PASS (AIRLINE / WALLET GRADE DIGITAL CARD)                */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Main Wallet Card */}
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {/* Top Color Header Strip */}
            <div
              className={`p-5 text-white flex items-center justify-between ${
                isBoarded
                  ? "bg-green-600"
                  : isStandingPassenger
                  ? "bg-pink-700"
                  : isWaitlisted
                  ? "bg-yellow-600"
                  : "bg-blue-600"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/15 backdrop-blur rounded-2xl">
                  <BusFront className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-white/80">
                    {activeStudent?.campus || store.getPrimaryCampus()?.name || "NONE"}
                  </div>
                  <div className="text-base font-black truncate tracking-tight">
                    {bus?.busNumber || "NONE"}{bus?.registrationNo ? ` • ${bus.registrationNo}` : ""}
                  </div>
                </div>
              </div>

              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-black/25 backdrop-blur font-extrabold uppercase border border-white/20 tracking-wider">
                {isStandingPassenger
                  ? "STANDING"
                  : isWaitlisted
                  ? `WL-${String(activeBooking.waitlistPosition || 1).padStart(2, "0")}`
                  : activeBooking.status}
              </span>
            </div>

            {/* Middle Section: Route & Huge Seat Callout */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                    Boarding Stop
                  </span>
                  <div className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span>{stop?.name || "NONE"}</span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">
                    Shift: {shift?.name || "NONE"} {shift?.startTime ? `(${formatTime(shift.startTime)})` : ""}
                  </div>
                </div>

                {/* Big Seat Badge */}
                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                    {isStandingPassenger ? "Pass Type" : "Assigned Seat"}
                  </span>
                  <div
                    className={`text-3xl font-black font-mono tracking-tight mt-0.5 ${
                      isStandingPassenger
                        ? "text-pink-600 dark:text-pink-400"
                        : "text-blue-600 dark:text-blue-400"
                    }`}
                  >
                    {isStandingPassenger ? "STAND" : activeBooking.seatNumber || "NONE"}
                  </div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase">
                    {isStandingPassenger ? "Till Merge Hub" : "Reserved Chassis"}
                  </div>
                </div>
              </div>
            </div>

            {/* ZERO-TOUCH FACE ID BADGE OR QR SCANNER */}
            <div className="p-6 bg-gray-50/50 dark:bg-gray-950/40 text-center space-y-4">
              {isBoarded ? (
                <div className="py-2 space-y-3">
                  <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/80 rounded-full flex items-center justify-center mx-auto ring-[8px] ring-emerald-50 dark:ring-emerald-900/20 mb-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                      Boarded & Verified ✓
                    </h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">
                      Seat Reserved • Autonomous Gate Verified
                    </p>
                  </div>
                </div>
              ) : attendancePolicyMode === "DYNAMIC_QR" ? (
                /* Dynamic Rotating QR Mode */
                <div className="py-2 space-y-4">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    <QrCode className="w-3.5 h-3.5" />
                    <span>DYNAMIC ROTATING QR ACTIVE</span>
                  </div>
                  <div className="p-4 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-md inline-block animate-in fade-in duration-200 space-y-3">
                    <QRCodeSVG
                      value={qrPayload}
                      size={180}
                      level="H"
                      includeMargin={false}
                      imageSettings={{
                        src: "/favicon.ico",
                        x: undefined,
                        y: undefined,
                        height: 24,
                        width: 24,
                        excavate: true,
                      }}
                    />
                    <div className="space-y-0.5">
                      <div className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">
                        {activeBooking.bookingCode || "PASS"}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        Present to Conductor at Bus Door
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFullScreen(true)}
                      className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-950 text-[11px] font-black shadow-md flex items-center gap-1.5 mx-auto transition-transform active:scale-95 cursor-pointer"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Fullscreen QR</span>
                    </button>
                  </div>
                </div>
              ) : attendancePolicyMode === "RFID" ? (
                /* Physical RFID Smart Card Mode */
                <div className="py-2 space-y-4">
                  <div className="relative inline-block mx-auto">
                    <div className="w-20 h-20 rounded-3xl bg-indigo-500/15 border-2 border-indigo-500/40 flex items-center justify-center shadow-lg">
                      <Radio className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-pulse" />
                    </div>
                    <span className="absolute -bottom-1 -right-1 p-1 bg-indigo-600 text-white rounded-full shadow-md">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      <Radio className="w-3.5 h-3.5" />
                      <span>RFID SMART CARD BOARDING ACTIVE</span>
                    </div>
                    <h3 className="text-base font-black text-gray-900 dark:text-white pt-1">
                      Tap Your Card on Bus Door Reader
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                      Hold your physical campus card against the sensor to unlock your seat and mark attendance.
                    </p>
                    <div className="pt-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      Card UID: <strong className="text-indigo-600 dark:text-indigo-400">{activeStudent.rfidCardId || "Registered on file"}</strong>
                    </div>
                  </div>
                </div>
              ) : attendancePolicyMode === "STATIC_QR" ? (
                /* Static Bus Door QR Scanning Mode */
                <div className="py-2 space-y-4">
                  <div className="relative inline-block mx-auto">
                    <div className="w-20 h-20 rounded-3xl bg-amber-500/15 border-2 border-amber-500/40 flex items-center justify-center shadow-lg">
                      <ScanLine className="w-10 h-10 text-amber-600 dark:text-amber-400 animate-pulse" />
                    </div>
                    <span className="absolute -bottom-1 -right-1 p-1 bg-amber-600 text-white rounded-full shadow-md">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <ScanLine className="w-3.5 h-3.5" />
                      <span>BUS DOOR QR SELF-SCAN ACTIVE</span>
                    </div>
                    <h3 className="text-base font-black text-gray-900 dark:text-white pt-1">
                      Scan the Physical QR on Bus Door
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                      Point your phone camera at the QR code on the bus entrance to confirm your seat within 150m.
                    </p>
                    <div className="pt-2">
                      <Link
                        href="/portal/qr/scan"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-black text-xs shadow-md transition-all cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Open Bus Door Scanner</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                /* Primary Face ID Zero-Touch Mode (Default & ALL) */
                <div className="py-2 space-y-4">
                  {/* Face ID Green Security Badge */}
                  <div className="relative inline-block mx-auto">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-500/15 via-blue-500/15 to-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center shadow-lg">
                      <ScanFace className="w-10 h-10 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                    </div>
                    <span className="absolute -bottom-1 -right-1 p-1 bg-emerald-600 text-white rounded-full shadow-md">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>FACE ID ZERO-TOUCH BOARDING ACTIVE</span>
                    </div>
                    <h3 className="text-base font-black text-gray-900 dark:text-white pt-1">
                      Walk Directly Onto Bus {bus?.busNumber || "Assigned"}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                      The dual-gate door camera will recognize your face, bind your GPS stop, and confirm your boarding automatically.
                    </p>
                  </div>

                  {/* Expandable Fallback QR Accordion */}
                  <div className="pt-2 border-t border-gray-200/60 dark:border-gray-800/60">
                    <button
                      type="button"
                      onClick={() => setShowBackupQr(!showBackupQr)}
                      className="text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 underline decoration-dotted inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>{showBackupQr ? "Hide Backup QR Pass" : "Need backup QR pass? Click to show"}</span>
                    </button>

                    {showBackupQr && (
                      <div className="mt-4 p-4 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-md inline-block animate-in fade-in duration-200 space-y-3">
                        <QRCodeSVG
                          value={qrPayload}
                          size={160}
                          level="H"
                          includeMargin={false}
                          imageSettings={{
                            src: "/favicon.ico",
                            x: undefined,
                            y: undefined,
                            height: 24,
                            width: 24,
                            excavate: true,
                          }}
                        />
                        <div className="space-y-0.5">
                          <div className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">
                            {activeBooking.bookingCode || "NONE"}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            Dynamic Cryptographic Token • Verified Conductor Scan
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsFullScreen(true)}
                          className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-950 text-[11px] font-black shadow-md flex items-center gap-1.5 mx-auto transition-transform active:scale-95 cursor-pointer"
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>Fullscreen QR</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Perforated Divider Strip with Side Cutout Circles */}
            <div className="relative py-2 border-t border-dashed border-gray-200 dark:border-gray-800 flex items-center justify-center">
              <div className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-gray-50 dark:bg-gray-950 rounded-full border border-gray-200 dark:border-gray-800 shadow-inner" />
              <div className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-gray-50 dark:bg-gray-950 rounded-full border border-gray-200 dark:border-gray-800 shadow-inner" />
            </div>

            {/* Bottom Passenger Meta Strip */}
            <div className="p-5 flex items-center justify-between gap-3 text-xs bg-white dark:bg-gray-900">
              <div className="flex items-center gap-3">
                {activeStudent.photoUrl ? (
                  <img
                    src={getSafePhotoUrl(activeStudent.photoUrl)}
                    alt={activeStudent.fullName}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (activeStudent.photoUrl && e.currentTarget.src !== activeStudent.photoUrl) {
                        e.currentTarget.src = activeStudent.photoUrl;
                      }
                    }}
                    className="w-10 h-12 rounded-xl object-cover border border-gray-200 dark:border-gray-700 shadow-xs flex-shrink-0 bg-gray-100 dark:bg-gray-800"
                  />
                ) : (
                  <div className="w-10 h-12 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-gray-900 dark:text-white">
                    {activeStudent.fullName}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono">
                    Zone {activeStudent.zoneCode || "NONE"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleShareOrPrint}
                  className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors cursor-pointer"
                  title="Print / Save Pass"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancelSeat}
                  className="px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-bold text-[11px] transition-colors cursor-pointer"
                >
                  Cancel Seat
                </button>
              </div>
            </div>
          </div>

          {/* Attendance Proximity Security Lock & Distance/RFID Unlock Card */}
          <AttendanceLockCard
            busId={bus?.id}
            studentId={activeStudent?.id}
            onUnlocked={() => {
              store.notify();
            }}
          />

          {/* Quick Bridge to Live Radar Tracker */}
          <div className="p-4 rounded-3xl bg-blue-900 text-white shadow-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/10 rounded-2xl">
                <Compass className="w-5 h-5 text-green-300" />
              </div>
              <div>
                <div className="text-xs font-bold">Want to see where your bus is right now?</div>
                <div className="text-[11px] text-blue-200">
                  Real-time GPS radar and live countdown ETA to your stop.
                </div>
              </div>
            </div>

            <Link
              href="/portal"
              className="px-4 py-2 bg-green-400 hover:bg-green-300 text-gray-950 font-black text-xs rounded-xl shadow transition-transform active:scale-95 shrink-0"
            >
              Open Live Radar →
            </Link>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* SHIFT CARDS: INSTANT QR PASS GENERATION ("SHIFT CARD -> QR")              */
        /* ========================================================================= */
        <div className="space-y-6">
          <div className="text-center sm:text-left space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[11px] font-black uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5" /> Instant Pass Generator
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              Select Shift to Generate Pass
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 max-w-lg">
              Choose your commute shift below. Your dynamic QR boarding pass will be issued immediately.
            </p>
          </div>

          {/* Student Identity QR for Conductor Manual Override */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-center space-y-4">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Your Digital ID (For Conductor Scan)</div>
            <div className="p-3 bg-white rounded-2xl shadow-inner border border-gray-100">
              <QRCodeSVG
                value={identityQrPayload}
                size={160}
                level="M"
                includeMargin={false}
                imageSettings={{
                  src: "/favicon.ico",
                  x: undefined,
                  y: undefined,
                  height: 24,
                  width: 24,
                  excavate: true,
                }}
              />
            </div>
            <div className="text-sm font-black text-gray-900 dark:text-white">
              {activeStudent?.fullName || currentUser?.fullName || "Student"}
            </div>
            <div className="text-[11px] text-gray-400">
              If your GPS fails, the conductor can scan this QR code to assign you a seat manually.
            </div>
          </div>

          {/* Attendance Proximity Security Lock & Distance/RFID Unlock Card */}
          <AttendanceLockCard
            studentId={activeStudent?.id}
            onUnlocked={() => {
              store.notify();
            }}
          />

          {quickBookingError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-xs flex items-center gap-2 font-semibold animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{quickBookingError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleShifts.map((shiftItem) => {
              const isBookingThis = isBookingShiftId === shiftItem.id;
              return (
                <div
                  key={shiftItem.id}
                  onClick={() => !isBookingThis && handleQuickBookShift(shiftItem.id)}
                  className={`group relative overflow-hidden p-6 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-blue-500 dark:hover:border-blue-500 ${
                    isBookingThis ? "opacity-75 pointer-events-none ring-2 ring-blue-500" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      {isBookingThis ? (
                        <RefreshCw className="w-6 h-6 animate-spin" />
                      ) : (
                        <Clock className="w-6 h-6" />
                      )}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800">
                      {shiftItem.shiftType}
                    </span>
                  </div>

                  <h3 className="text-lg font-black text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {shiftItem.name}
                  </h3>

                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5 font-semibold">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span>{formatTime(shiftItem.startTime)} - {formatTime(shiftItem.endTime)}</span>
                  </p>

                  <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-green-500" /> Instant Pass
                    </span>
                    <span className="text-xs font-black text-blue-600 dark:text-blue-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      {isBookingThis ? "Issuing..." : "Generate QR →"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 text-center">
            <Link
              href="/portal/booking"
              className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Need to pick a specific seat chassis or stop? Open Seat Booking →</span>
            </Link>
          </div>
        </div>
      )}

      {/* Self-Boarding Scanner Toggle */}
      {activeBooking && activeStudent && (
        <div className="pt-2 flex flex-col items-center justify-center space-y-4">
          <button
            onClick={() => setIsScannerOpen(!isScannerOpen)}
            className="w-full max-w-sm flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-2xl transition-colors"
          >
            <Camera className="w-4 h-4" />
            {isScannerOpen ? "Close Scanner" : "Scan Bus QR to Board"}
          </button>
          
          {isScannerOpen && (
            <div className="max-w-sm w-full mx-auto animate-in fade-in zoom-in duration-300">
              <StudentSelfScanner onSuccess={() => window.location.reload()} />
            </div>
          )}
        </div>
      )}

      {/* Fullscreen High-Contrast Presentation Modal for Conductor Scanner */}
      {isFullScreen && activeBooking && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 animate-in fade-in">
          <button
            onClick={() => setIsFullScreen(false)}
            className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="max-w-xs w-full bg-white p-6 rounded-3xl text-center space-y-4 shadow-2xl">
            <div className="text-gray-900 space-y-1">
              <div className="text-xs font-black uppercase text-blue-600 tracking-wider">
                {bus?.busNumber || "NONE"}
              </div>
              <div className="flex items-center justify-center gap-3 py-1">
                {activeStudent?.photoUrl ? (
                  <img
                    src={getSafePhotoUrl(activeStudent.photoUrl)}
                    alt={activeStudent.fullName}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (activeStudent.photoUrl && e.currentTarget.src !== activeStudent.photoUrl) {
                        e.currentTarget.src = activeStudent.photoUrl;
                      }
                    }}
                    className="w-12 h-14 object-cover rounded-xl border border-gray-300 shadow-sm"
                  />
                ) : null}
                <div className="text-left">
                  <div className="text-2xl font-black font-mono leading-none">
                    {isStandingPassenger ? "STAND" : `SEAT ${activeBooking.seatNumber || "NONE"}`}
                  </div>
                  <div className="text-xs font-bold text-gray-800 mt-1">
                    {activeStudent?.fullName}
                  </div>
                  <div className="text-[10px] text-gray-500 font-medium">
                    {stop?.name}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-2 bg-white rounded-2xl flex items-center justify-center">
              <QRCodeSVG
                value={qrPayload}
                size={230}
                level="H"
                includeMargin={false}
              />
            </div>

            <div className="text-[11px] font-mono text-gray-400 font-bold">
              Hold screen steady in front of conductor scanner
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
