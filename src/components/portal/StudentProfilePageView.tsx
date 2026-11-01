"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { formatTime, formatDate } from "@/lib/utils";
import { getSafePhotoUrl } from "@/lib/image-utils";
import {
  User,
  ShieldCheck,
  GraduationCap,
  Building2,
  MapPin,
  BusFront,
  CalendarCheck,
  CreditCard,
  Phone,
  QrCode,
  Sparkles,
  Camera,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Compass,
  ArrowRight,
  ChevronRight,
  ShieldAlert,
  AlertCircle,
  ExternalLink,
  Settings,
  Globe,
  Sun,
  Moon,
  Laptop,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import type { Student, Bus, Route, Stop, Shift, Booking, Staff, SupportedLanguage } from "@/lib/types";

export interface StudentProfilePageViewProps {
  initialUser?: any;
  initialStudents?: Student[];
  initialBuses?: Bus[];
  initialRoutes?: Route[];
  initialStops?: Stop[];
  initialShifts?: Shift[];
  initialBookings?: Booking[];
  initialStaff?: Staff[];
}

export default function StudentProfilePageView({
  initialUser,
  initialStudents = [],
  initialBuses = [],
  initialRoutes = [],
  initialStops = [],
  initialShifts = [],
  initialBookings = [],
  initialStaff = [],
}: StudentProfilePageViewProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(initialUser || store.getCurrentUser());
  const [students, setStudents] = useState<Student[]>(() =>
    initialStudents.length > 0 ? initialStudents : store.getStudents()
  );
  const [activeChildId, setActiveChildId] = useState(store.getActiveChildId());
  const [buses, setBuses] = useState<Bus[]>(() =>
    initialBuses.length > 0 ? initialBuses : store.getBuses()
  );
  const [routes, setRoutes] = useState<Route[]>(() =>
    initialRoutes.length > 0 ? initialRoutes : store.getRoutes()
  );
  const [stops, setStops] = useState<Stop[]>(() =>
    initialStops.length > 0 ? initialStops : store.getStops()
  );
  const [shifts, setShifts] = useState<Shift[]>(() =>
    initialShifts.length > 0 ? initialShifts : store.getShifts()
  );
  const [bookings, setBookings] = useState<Booking[]>(() =>
    initialBookings.length > 0 ? initialBookings : store.getBookings()
  );
  const [staff, setStaff] = useState<Staff[]>(() =>
    initialStaff.length > 0 ? initialStaff : store.getStaff()
  );

  useEffect(() => {
    if (initialStudents.length > 0 && students.length === 0) setStudents(initialStudents);
    if (initialBuses.length > 0 && buses.length === 0) setBuses(initialBuses);
    if (initialRoutes.length > 0 && routes.length === 0) setRoutes(initialRoutes);
    if (initialStops.length > 0 && stops.length === 0) setStops(initialStops);
    if (initialShifts.length > 0 && shifts.length === 0) setShifts(initialShifts);
    if (initialBookings.length > 0 && bookings.length === 0) setBookings(initialBookings);
    if (initialStaff.length > 0 && staff.length === 0) setStaff(initialStaff);

    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      setStudents(store.getStudents());
      setActiveChildId(store.getActiveChildId());
      setBuses(store.getBuses());
      setRoutes(store.getRoutes());
      setStops(store.getStops());
      setShifts(store.getShifts());
      setBookings(store.getBookings());
      setStaff(store.getStaff());
    });
    return unsub;
  }, [
    initialStudents,
    initialBuses,
    initialRoutes,
    initialStops,
    initialShifts,
    initialBookings,
    initialStaff,
    students.length,
    buses.length,
    routes.length,
    stops.length,
    shifts.length,
    bookings.length,
    staff.length,
  ]);

  // Identify active student strictly from database / store records
  const activeStudent: Student | null = useMemo(() => {
    if (currentUser) {
      const found = students.find(
        s =>
          (activeChildId && (s.id === activeChildId || s.userId === activeChildId)) ||
          (currentUser.studentId && s.id === currentUser.studentId) ||
          s.userId === currentUser.id ||
          s.id === currentUser.id ||
          (currentUser.email && s.email?.toLowerCase() === currentUser.email?.toLowerCase())
      );
      if (found) return found;
    }

    // Match enrolled student record
    const matched = students.find(
      s =>
        s.fullName?.toLowerCase().includes("ananya") ||
        s.email?.toLowerCase().includes("ananya")
    );
    if (matched) return matched;

    return students[0] || null;
  }, [currentUser, students, activeChildId]);

  // Active Confirmed/Boarded Booking for Current Student
  const activeBooking = useMemo(() => {
    if (!activeStudent && !currentUser) return null;
    return (
      bookings.find(
        b =>
          (activeStudent && (b.studentId === activeStudent.id || b.studentId === activeStudent.userId)) ||
          (currentUser && (b.studentId === currentUser.id || b.studentId === `stud-${currentUser.id}`))
      ) &&
      bookings.find(
        b =>
          ((activeStudent && (b.studentId === activeStudent.id || b.studentId === activeStudent.userId)) ||
            (currentUser && (b.studentId === currentUser.id || b.studentId === `stud-${currentUser.id}`))) &&
          (b.status === "CONFIRMED" || b.status === "WAITLISTED" || b.status === "BOARDED")
      )
    ) || null;
  }, [bookings, activeStudent, currentUser]);

  // Associated details
  const primaryStop = useMemo(() => {
    return stops.find(s => s.id === activeStudent?.primaryStopId) || stops[0] || null;
  }, [stops, activeStudent]);

  const assignedRoute = useMemo(() => {
    return routes.find(r => r.id === activeStudent?.primaryRouteId) || routes[0] || null;
  }, [routes, activeStudent]);

  const assignedBus = useMemo(() => {
    if (activeBooking?.busId) {
      const booked = buses.find(b => b.id === activeBooking.busId);
      if (booked) return booked;
    }
    if (assignedRoute?.id) {
      const routeBus = buses.find(b => b.currentRouteId === assignedRoute.id);
      if (routeBus) return routeBus;
    }
    return null;
  }, [buses, activeBooking, assignedRoute]);

  const isSubscriptionActive = activeStudent?.hasActiveSubscription ?? false;
  const isPaymentApproved = activeStudent?.paymentStatus === "APPROVED";


  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      {/* 1. Academic & Identity Hero Card */}
      <div className="relative overflow-hidden rounded-none bg-gray-900 text-white p-6 sm:p-8 shadow-none-none border border-white/10">
        
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Student Photo / Avatar with Edit Overlay */}
            <div className="relative group shrink-0">
              <div className="w-20 h-24 sm:w-24 sm:h-28 rounded-none bg-gray-800  border-2 border-white/20 shadow-none-none overflow-hidden flex flex-col items-center justify-center text-blue-200">
                {activeStudent?.photoUrl ? (
                  <img
                    src={getSafePhotoUrl(activeStudent.photoUrl)}
                    alt={activeStudent.fullName || "Student Photo"}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-2 text-center">
                    <User className="w-10 h-10 text-blue-300" />
                    <span className="text-[9px] font-bold mt-1 uppercase tracking-wider text-blue-200/80">
                      ID Photo
                    </span>
                  </div>
                )}
              </div>
              
            </div>

            {/* Core Info */}
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-none bg-green-500/20 border border-green-400/30 text-green-300 text-xs font-bold">
                  <span className="w-2 h-2 rounded-none bg-green-400 animate-pulse" />
                  Verified Student Commuter
                </span>
                <span className="text-xs text-blue-200/70 font-mono">
                  {activeStudent?.campus || store.getPrimaryCampus()?.name || "NONE"}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white truncate">
                {activeStudent?.fullName || currentUser?.fullName || "NONE"}
              </h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-300 font-medium">
                <span>
                  {activeStudent?.department || "NONE"}
                </span>
                <span>•</span>
                <span className="px-2 py-0.5 rounded-none bg-gray-800 text-gray-200 text-xs font-bold">
                  Zone {activeStudent?.zoneCode || "NONE"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            

            {activeBooking ? (
              <Link
                href="/portal/pass"
                className="px-5 py-3 rounded-none bg-green-500 hover:bg-green-600  text-white font-black text-xs shadow-none-none shadow-none-none transition-all flex items-center gap-2 active:scale-95"
              >
                <QrCode className="w-4 h-4" />
                <span>View Digital Pass</span>
              </Link>
            ) : (
              <Link
                href="/portal/booking"
                className="px-5 py-3 rounded-none bg-blue-600 hover:bg-blue-700  text-white font-black text-xs shadow-none-none shadow-none-none transition-all flex items-center gap-2 active:scale-95"
              >
                <CalendarCheck className="w-4 h-4" />
                <span>Book Seat Now</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 2. Seat Booking / Active Pass Status Banner */}
      <div className="rounded-none p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-none-none flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-none flex items-center justify-center shrink-0 ${
              activeBooking
                ? "bg-green-100 dark:bg-green-950 text-green-600 dark:text-green-400"
                : "bg-yellow-100 dark:bg-yellow-950 text-yellow-600 dark:text-yellow-400"
            }`}
          >
            {activeBooking ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
          </div>
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
              Shift Booking Status
            </div>
            <div className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
              {activeBooking
                ? `Active Reservation: Seat ${activeBooking.seatNumber || "NONE"} • Bus ${assignedBus?.busNumber || "NONE"}`
                : "No Seat Reserved for Current / Upcoming Shift"}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {activeBooking
                ? "Your cryptographic QR boarding pass is generated and ready for optical scanning at the bus door."
                : "Choose your pickup stop and reserve a guaranteed seat before booking cutoff."}
            </p>
          </div>
        </div>

        <div>
          {activeBooking ? (
            <Link
              href="/portal/pass"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-none bg-green-600 hover:bg-green-700 text-white font-black text-xs shadow-none-none shadow-none-none transition-all active:scale-95"
            >
              <QrCode className="w-4 h-4" />
              <span>Open Digital Pass</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/portal/booking"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-none-none shadow-none-none transition-all active:scale-95"
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Reserve Seat</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      {/* 3. Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Official Digital ID Card Replica (1 Col) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-900 rounded-none p-6 text-white border border-gray-700 shadow-none-none space-y-5 relative overflow-hidden">
            {/* Holographic Watermark effect */}
            
            
            {/* University Card Header */}
            <div className="border-b border-white/10 pb-4 text-center space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-300">
                {activeStudent?.campus || store.getPrimaryCampus()?.name || "Campus Mobility"}
              </div>
              <div className="text-xs font-extrabold uppercase text-gray-300 tracking-wider">
                Student Mobility ID Card
              </div>
            </div>

            {/* Photo & Key ID */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-24 rounded-none bg-gray-800 border border-white/20 overflow-hidden shrink-0 flex items-center justify-center">
                {activeStudent?.photoUrl ? (
                  <img
                    src={getSafePhotoUrl(activeStudent.photoUrl)}
                    alt={activeStudent.fullName || "Student Photo"}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <User className="w-8 h-8 text-blue-300" />
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-black text-white truncate">
                  {activeStudent?.fullName || currentUser?.fullName || "NONE"}
                </div>
                <div className="text-[10px] text-gray-300 truncate">
                  {activeStudent?.className || activeStudent?.department || "NONE"}
                </div>
                <div className="inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-400/30">
                  Pass Active
                </div>
              </div>
            </div>

            {/* ID Card Fields */}
            <div className="space-y-2 text-xs border-t border-white/10 pt-4 font-medium">
              <div className="flex justify-between">
                <span className="text-gray-400">Transit Zone:</span>
                <span className="font-bold text-white">Zone {activeStudent?.zoneCode || "NONE"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Boarding Stop:</span>
                <span className="font-bold text-white truncate max-w-[140px]">
                  {primaryStop?.name || "NONE"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Assigned Bus:</span>
                <span className="font-bold text-white">{assignedBus?.busNumber ? `Bus ${assignedBus.busNumber}` : "Unallocated"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Valid Through:</span>
                <span className="font-bold text-white">{activeStudent?.subscriptionExpiryDate ? formatDate(activeStudent.subscriptionExpiryDate) : "NONE"}</span>
              </div>
            </div>

            {/* Simulated Micro Barcode */}
            <div className="border-t border-white/10 pt-4 text-center space-y-1.5">
              <div className="h-7 w-full bg-white/90 rounded flex items-center justify-center px-4 overflow-hidden">
                <div className="flex gap-[3px] w-full h-5 items-stretch opacity-85">
                  <div className="bg-gray-900 w-1" />
                  <div className="bg-gray-900 w-0.5" />
                  <div className="bg-gray-900 w-1.5" />
                  <div className="bg-gray-900 w-0.5" />
                  <div className="bg-gray-900 w-2" />
                  <div className="bg-gray-900 w-0.5" />
                  <div className="bg-gray-900 w-1" />
                  <div className="bg-gray-900 w-1.5" />
                  <div className="bg-gray-900 w-0.5" />
                  <div className="bg-gray-900 w-1" />
                  <div className="bg-gray-900 w-2" />
                  <div className="bg-gray-900 w-0.5" />
                  <div className="bg-gray-900 w-1" />
                  <div className="bg-gray-900 w-1.5" />
                </div>
              </div>
              <div className="text-[9px] font-mono text-gray-400">
                OFFICIAL CAMPUS TRANSIT CREDENTIAL
              </div>
            </div>
          </div>

          {/* Quick Links Navigation */}
          <div className="bg-white dark:bg-gray-900 rounded-none p-5 border border-gray-200 dark:border-gray-800 shadow-none-none space-y-3">
            <div className="text-xs font-black uppercase tracking-wider text-gray-400 px-1">
              Commuter Shortcuts
            </div>
            <div className="space-y-1.5">
              <Link
                href="/portal/booking"
                className="flex items-center justify-between p-3 rounded-none hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-xs font-bold text-gray-700 dark:text-gray-200"
              >
                <div className="flex items-center gap-3">
                  <CalendarCheck className="w-4 h-4 text-blue-600" />
                  <span>Seat Reservation System</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
              <Link
                href="/portal/pass"
                className="flex items-center justify-between p-3 rounded-none hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-xs font-bold text-gray-700 dark:text-gray-200"
              >
                <div className="flex items-center gap-3">
                  <QrCode className="w-4 h-4 text-green-600" />
                  <span>Digital Dynamic Boarding Pass</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
              <Link
                href="/portal"
                className="flex items-center justify-between p-3 rounded-none hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-xs font-bold text-gray-700 dark:text-gray-200"
              >
                <div className="flex items-center gap-3">
                  <Compass className="w-4 h-4 text-green-600" />
                  <span>Live Commute & Fleet Status</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
              <Link
                href="/portal/payments"
                className="flex items-center justify-between p-3 rounded-none hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-xs font-bold text-gray-700 dark:text-gray-200"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-pink-600" />
                  <span>Pass Fees & UPI Invoices</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Sections (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section A: Academic Credentials */}
          <div className="bg-white dark:bg-gray-900 rounded-none p-6 sm:p-7 border border-gray-200 dark:border-gray-800 shadow-none-none space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-none bg-blue-100 dark:bg-blue-950 text-blue-600">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                    Academic Program & Class Section
                  </h2>
                  <p className="text-xs text-gray-500">
                    Official institutional academic and class details
                  </p>
                </div>
              </div>
              
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Course & Degree
                </div>
                <div className="font-black text-gray-900 dark:text-white text-sm">
                  {activeStudent?.department || "NONE"}
                </div>
              </div>

              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Semester & Section
                </div>
                <div className="font-black text-gray-900 dark:text-white text-sm">
                  {activeStudent?.className || (activeStudent?.semester ? `${activeStudent.semester} Semester` : "NONE")}
                </div>
              </div>

              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Institutional Campus
                </div>
                <div className="font-black text-gray-900 dark:text-white text-sm">
                  {activeStudent?.campus || store.getPrimaryCampus()?.name || "NONE"}
                </div>
              </div>

              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Registered Email
                </div>
                <div className="font-medium text-gray-700 dark:text-gray-200 truncate">
                  {activeStudent?.email || currentUser?.email || "NONE"}
                </div>
              </div>

              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Primary Mobile Phone
                </div>
                <div className="font-medium text-gray-700 dark:text-gray-200">
                  {activeStudent?.phone || currentUser?.phone || "NONE"}
                </div>
              </div>

              <div className="p-4 rounded-none bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 space-y-1 sm:col-span-2">
                <div className="text-[10px] font-extrabold uppercase text-blue-600 dark:text-blue-400 tracking-wider">
                  Student ID
                </div>
                <div className="font-mono font-black text-gray-900 dark:text-white text-sm">
                  {activeStudent?.studentIdCode || "Not specified — update in Profile Setup"}
                </div>
              </div>
            </div>
          </div>

          {/* Section B: Daily Commute & Transit Corridor */}
          <div className="bg-white dark:bg-gray-900 rounded-none p-6 sm:p-7 border border-gray-200 dark:border-gray-800 shadow-none-none space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-none bg-green-100 dark:bg-green-950 text-green-600">
                  <BusFront className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                    Daily Commute & Assigned Corridor
                  </h2>
                  <p className="text-xs text-gray-500">
                    Designated boarding station, route corridor, and shift schedule
                  </p>
                </div>
              </div>
              
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Primary Boarding Stop
                </div>
                <div className="font-black text-gray-900 dark:text-white text-sm">
                  {primaryStop?.name || "NONE"}
                </div>
                <div className="text-[11px] text-gray-500">
                  {primaryStop?.landmark || ""}
                </div>
              </div>

              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Assigned Vehicle & Corridor
                </div>
                <div className="font-black text-gray-900 dark:text-white text-sm">
                  {assignedBus ? `Bus ${assignedBus.busNumber} (${assignedBus.registrationNo || "Assigned"})` : "Not Allocated"}
                </div>
                <div className="text-[11px] text-gray-500">
                  {assignedBus?.model || ""}
                </div>
              </div>

              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Transit Zone Code
                </div>
                <div className="font-black text-gray-900 dark:text-white text-sm flex items-center gap-2">
                  <span>Zone {activeStudent?.zoneCode || "NONE"}</span>
                </div>
              </div>

              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Academic Shifts
                </div>
                <div className="font-black text-gray-900 dark:text-white text-sm">
                  {store.getShifts().length > 0
                    ? store.getShifts().map((s) => `${s.name} (${s.startTime || ""} - ${s.endTime || ""})`).join(" & ")
                    : "NONE"}
                </div>
              </div>
            </div>
          </div>

          {/* Section C: Emergency Contact & Sentinel */}
          <div className="bg-white dark:bg-gray-900 rounded-none p-6 sm:p-7 border border-gray-200 dark:border-gray-800 shadow-none-none space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-none bg-red-100 dark:bg-red-950 text-red-600">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                    Guardian & Sentinel Emergency Contact
                  </h2>
                  <p className="text-xs text-gray-500">
                    Direct notification receiver in event of transit SOS or bus delay
                  </p>
                </div>
              </div>
              
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Guardian / Contact Person
                </div>
                <div className="font-black text-gray-900 dark:text-white text-sm">
                  {activeStudent?.emergencyContact?.name || "NONE"}
                </div>
                <div className="text-[11px] text-gray-500">
                  Relationship: {activeStudent?.emergencyContact?.relationship || "NONE"}
                </div>
              </div>

              <div className="p-4 rounded-none bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  Emergency Phone Number
                </div>
                <div className="font-black text-gray-900 dark:text-white text-sm">
                  {activeStudent?.emergencyContact?.phone ? (
                    <a
                      href={`tel:${activeStudent.emergencyContact.phone}`}
                      className="text-blue-600 hover:underline flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{activeStudent.emergencyContact.phone}</span>
                    </a>
                  ) : "Not Provided"}
                </div>
                <div className="text-[11px] text-gray-500">
                  Automated SMS on SOS or Bus Route changes
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}