"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { store } from "@/lib/store";
import { formatTime, formatDate } from "@/lib/utils";
import { getTodayIST, isTripCutoffPassed } from "@/lib/time-manager";
import {
  Navigation,
  CheckCircle2,
  Users,
  Clock,
  Radio,
  Plus,
  X,
  Home,
  Building2,
  ArrowRight,
  CalendarDays,
  Search,
  Sparkles,
  BusFront,
  Check,
  Trash2,
  Shuffle,
  GraduationCap,
  UserPlus,
  LayoutGrid,
  ListFilter,
  Table as TableIcon,
  Layers,
  Activity,
  Calendar,
  AlertCircle,
  ExternalLink,
  Shield,
  User,
  Info,
  Lock,
} from "lucide-react";
import type {
  Trip,
  Bus,
  Route,
  Shift,
  Staff,
  Booking,
  TripDirection,
  Student,
  SpecialShiftAllocation,
} from "@/lib/types";
import { CustomDropdown } from "@/components/common/CustomDropdown";

export interface TransportAdminTripsProps {
  initialTrips?: Trip[];
  initialBuses?: Bus[];
  initialRoutes?: Route[];
  initialShifts?: Shift[];
  initialStaff?: Staff[];
  initialBookings?: Booking[];
}

export type TripsViewMode = "FEED" | "BUS_EXPLORER";
export type FeedLayout = "CARDS" | "TABLE";

export default function TransportAdminTripsView({
  initialTrips = [],
  initialBuses = [],
  initialRoutes = [],
  initialShifts = [],
  initialStaff = [],
  initialBookings = [],
}: TransportAdminTripsProps = {}) {
  const searchParams = useSearchParams();
  const queryShiftId = searchParams?.get("shiftId");

  const [trips, setTrips] = useState<Trip[]>(() =>
    initialTrips.length > 0 ? initialTrips : store.getTrips()
  );
  const [buses, setBuses] = useState<Bus[]>(() =>
    initialBuses.length > 0 ? initialBuses : store.getBuses()
  );
  const [routes, setRoutes] = useState<Route[]>(() =>
    initialRoutes.length > 0 ? initialRoutes : store.getRoutes()
  );
  const [shifts, setShifts] = useState<Shift[]>(() =>
    initialShifts.length > 0 ? initialShifts : store.getShifts()
  );
  const [staff, setStaff] = useState<Staff[]>(() =>
    initialStaff.length > 0 ? initialStaff : store.getStaff()
  );
  const [bookings, setBookings] = useState<Booking[]>(() =>
    initialBookings.length > 0 ? initialBookings : store.getBookings()
  );
  const [students, setStudents] = useState<Student[]>(() => store.getStudents());
  const [allocations, setAllocations] = useState<SpecialShiftAllocation[]>(() =>
    store.getSpecialShiftAllocations()
  );

  // View Modes: Dispatches Feed (Cards/Table) vs. Bus Fleet Explorer
  const [viewMode, setViewMode] = useState<TripsViewMode>("FEED");
  const [feedLayout, setFeedLayout] = useState<FeedLayout>("CARDS");

  // Filters
  const [selectedDirection, setSelectedDirection] = useState<"ALL" | TripDirection>("ALL");
  const [selectedShiftId, setSelectedShiftId] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Feedback
  const [isAddTripOpen, setIsAddTripOpen] = useState(false);
  const [allocatingTrip, setAllocatingTrip] = useState<Trip | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const [newTrip, setNewTrip] = useState<{
    tripDate: string;
    routeId: string;
    busId: number;
    shiftId: string;
    driverId: string;
    conductorId: string;
    isSpecial: boolean;
    facilityType: "REGULAR" | "PLACEMENT_DRIVE" | "EVENT";
  }>({
    tripDate: getTodayIST(),
    routeId: "",
    busId: -1,
    shiftId: queryShiftId || "",
    driverId: "",
    conductorId: "",
    isSpecial: false,
    facilityType: "REGULAR",
  });

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setTrips(store.getTrips());
      setBuses(store.getBuses());
      setRoutes(store.getRoutes());
      setShifts(store.getShifts());
      setStaff(store.getStaff());
      setBookings(store.getBookings());
      setStudents(store.getStudents());
      setAllocations(store.getSpecialShiftAllocations());
    });
    return unsub;
  }, []);

  // Pre-fill route, bus, shift if modal opens
  useEffect(() => {
    if (routes.length > 0 && !newTrip.routeId) {
      const activeBus = buses.find((b) => b.status === "ACTIVE") || buses[0];
      setNewTrip((prev) => ({
        ...prev,
        routeId: routes[0]?.id || "",
        busId: prev.busId > 0 ? prev.busId : (activeBus?.id || -1),
        shiftId: prev.shiftId || shifts[0]?.id || "",
        driverId: staff.find((s) => s.role === "driver")?.id || "",
        conductorId: staff.find((s) => s.role === "conductor")?.id || "",
      }));
    }
  }, [routes, buses, shifts, staff, newTrip.routeId]);

  // If redirected with ?shiftId=..., open modal with prefilled shift
  useEffect(() => {
    if (queryShiftId && shifts.some((s) => s.id === queryShiftId)) {
      setNewTrip((prev) => ({ ...prev, shiftId: queryShiftId }));
      setIsAddTripOpen(true);
    }
  }, [queryShiftId, shifts]);

  const todayDate = useMemo(() => getTodayIST(), []);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = getTodayIST();
    const sourceTrips = initialTrips.length > 0 ? initialTrips : store.getTrips();
    const hasToday = sourceTrips.some((t) => t.tripDate === today);
    if (hasToday) return today;
    const dates = sourceTrips.map((t) => t.tripDate).filter(Boolean).sort();
    return dates.length > 0 ? dates[dates.length - 1] : today;
  });

  const availableDates = useMemo(() => {
    return Array.from(new Set(trips.map((t) => t.tripDate).filter(Boolean))).sort().reverse();
  }, [trips]);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  // Helper: Trip direction resolution
  const getTripDirection = (trip: Trip): TripDirection => {
    const tripCode = (trip.tripCode || "").toUpperCase();
    const sh = shifts.find((s) => s.id === trip.shiftId);
    const shiftType = (sh?.shiftType || "").toUpperCase();

    if (
      tripCode.includes("C2C") ||
      tripCode.includes("BUS21") ||
      tripCode.includes("DDN") ||
      trip.isSpecial ||
      sh?.direction === "CAMPUS_TO_CAMPUS"
    ) {
      return "CAMPUS_TO_CAMPUS";
    }
    if (sh?.direction === "CAMPUS_TO_HOME" || shiftType === "EVENING" || tripCode.endsWith("-E") || tripCode.includes("-E-")) {
      return "CAMPUS_TO_HOME";
    }
    if (sh?.direction) return sh.direction;
    return "HOME_TO_CAMPUS";
  };

  const getCleanBusNumber = (busNumber: number): string => {
    return `Bus ${busNumber}`;
  };

  // Resolve Human-friendly Origin and Destination for a Trip
  const getCorridorEndpoints = (
    routeName: string,
    dir: TripDirection,
    routeObj?: Route
  ): { origin: string; destination: string } => {
    const campusName =
      store.getCampuses().find((c) => c.id === routeObj?.destinationCampusId || c.id === routeObj?.campusId)?.name ||
      store.getPrimaryCampus()?.name ||
      "GEHU Campus";

    let cityStop = "City Corridor";
    if (routeName.includes(" to ")) {
      const parts = routeName.split(" to ");
      const rawOrigin = parts[0].replace(/^[A-Za-z0-9\s]+:\s*/, "").trim();
      const rawDest = parts[1].trim();
      cityStop = rawOrigin.toLowerCase().includes("gehu") || rawOrigin.toLowerCase().includes("campus")
        ? rawDest
        : rawOrigin;
    }

    if (dir === "HOME_TO_CAMPUS") {
      return { origin: cityStop, destination: campusName };
    }
    if (dir === "CAMPUS_TO_HOME") {
      return { origin: campusName, destination: cityStop };
    }
    return { origin: "Bhimtal Campus", destination: "Dehradun Campus" };
  };

  // Scoped Trips for active selected date
  const dateScopedTrips = useMemo(() => {
    if (selectedDate === "ALL") return trips;
    return trips.filter((t) => t.tripDate === selectedDate);
  }, [trips, selectedDate]);

  // KPI Computations for the active date
  const stats = useMemo(() => {
    const total = dateScopedTrips.length;
    const homeToCampus = dateScopedTrips.filter((t) => getTripDirection(t) === "HOME_TO_CAMPUS").length;
    const campusToHome = dateScopedTrips.filter((t) => getTripDirection(t) === "CAMPUS_TO_HOME").length;
    const campusToCampus = dateScopedTrips.filter((t) => getTripDirection(t) === "CAMPUS_TO_CAMPUS").length;
    const confirmedPassengers = bookings.filter((b) => b.status === "CONFIRMED" || b.status === "BOARDED").length;
    const totalCapacity = dateScopedTrips.reduce((acc, t) => {
      const b = buses.find((bus) => bus.id === t.busId);
      return acc + (b?.capacity || 40);
    }, 0);

    const activeBusIds = new Set(dateScopedTrips.map((t) => t.busId));
    const activeBusesCount = activeBusIds.size;
    const inProgressTripsCount = dateScopedTrips.filter((t) => t.status === "IN_PROGRESS").length;

    return {
      total,
      homeToCampus,
      campusToHome,
      campusToCampus,
      confirmedPassengers,
      totalCapacity,
      activeBusesCount,
      totalBusesCount: buses.length,
      inProgressTripsCount,
      utilizationRate: totalCapacity > 0 ? Math.round((confirmedPassengers / totalCapacity) * 100) : 0,
    };
  }, [dateScopedTrips, bookings, buses]);

  // Filtered trips for active feed view
  const filteredTrips = useMemo(() => {
    return dateScopedTrips.filter((trip) => {
      if (selectedShiftId !== "ALL" && trip.shiftId !== selectedShiftId) return false;
      const dir = getTripDirection(trip);
      if (selectedDirection !== "ALL" && dir !== selectedDirection) return false;
      if (selectedStatus !== "ALL" && trip.status !== selectedStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const route = routes.find((r) => r.id === trip.routeId);
        const bus = buses.find((b) => b.id === trip.busId);
        const driver = staff.find((s) => s.id === trip.driverId);
        const conductor = staff.find((s) => s.id === trip.conductorId);

        const matches =
          trip.tripCode.toLowerCase().includes(q) ||
          (route?.name && route.name.toLowerCase().includes(q)) ||
          (route?.code && route.code.toLowerCase().includes(q)) ||
          (bus?.busNumber !== undefined && String(bus.busNumber).includes(q)) ||
          (bus?.registrationNo && bus.registrationNo.toLowerCase().includes(q)) ||
          (driver?.fullName && driver.fullName.toLowerCase().includes(q)) ||
          (conductor?.fullName && conductor.fullName.toLowerCase().includes(q));

        if (!matches) return false;
      }

      return true;
    });
  }, [dateScopedTrips, selectedShiftId, selectedDirection, selectedStatus, searchQuery, routes, buses, staff]);

  // Group Trips by Bus for Bus Explorer Mode
  const busExplorerData = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return buses
      .filter((bus) => {
        if (!query) return true;
        const matchesBus =
          String(bus.busNumber).includes(query) ||
          bus.registrationNo.toLowerCase().includes(query);
        const hasMatchingTrip = dateScopedTrips.some(
          (t) =>
            t.busId === bus.id &&
            (t.tripCode.toLowerCase().includes(query) ||
              routes.find((r) => r.id === t.routeId)?.name.toLowerCase().includes(query))
        );
        return matchesBus || hasMatchingTrip;
      })
      .map((bus) => {
        const busTrips = dateScopedTrips.filter((t) => t.busId === bus.id);
        const matchingTrips = busTrips.filter((t) => {
          if (selectedShiftId !== "ALL" && t.shiftId !== selectedShiftId) return false;
          if (selectedDirection === "ALL") return true;
          return getTripDirection(t) === selectedDirection;
        });

        const busBookings = bookings.filter((b) => busTrips.some((t) => t.id === b.tripId));
        const confirmedBookings = busBookings.filter(
          (b) => b.status === "CONFIRMED" || b.status === "BOARDED"
        ).length;

        const primaryDriver = busTrips[0]
          ? staff.find((s) => s.id === busTrips[0].driverId)
          : null;

        return {
          bus,
          trips: matchingTrips,
          allDateTrips: busTrips,
          confirmedBookings,
          primaryDriver,
        };
      })
      .sort((a, b) => {
        if (a.trips.length > 0 && b.trips.length === 0) return -1;
        if (a.trips.length === 0 && b.trips.length > 0) return 1;
        return a.bus.busNumber - b.bus.busNumber;
      });
  }, [buses, dateScopedTrips, selectedDirection, searchQuery, routes, bookings, staff]);

  // Delete Trip Handler
  const handleDeleteTrip = async (tripId: string, tripCode: string) => {
    if (!confirm(`Are you sure you want to cancel and remove trip schedule ${tripCode}?`)) return;
    try {
      await store.deleteTrip(tripId);
      setTrips(store.getTrips());
      showToast(`✓ Trip ${tripCode} removed successfully.`);
    } catch (e: any) {
      alert("Failed to delete trip: " + (e.message || "Unknown error"));
    }
  };

  // Quick Open Modal with pre-selected Bus
  const handleAddTripForBus = (busId: number) => {
    setNewTrip((prev) => ({
      ...prev,
      busId,
      tripDate: selectedDate === "ALL" ? todayDate : selectedDate,
    }));
    setIsAddTripOpen(true);
  };

  // Create Trip Handler
  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrip.routeId || newTrip.busId <= 0) {
      alert("Please select a Corridor Route and allocate an operational Bus.");
      return;
    }
    setIsSubmitting(true);
    try {
      const busObj = buses.find((b) => b.id === newTrip.busId);
      const routeObj = routes.find((r) => r.id === newTrip.routeId);
      const shiftObj = shifts.find((s) => s.id === newTrip.shiftId) || shifts[0];

      const busLabel = busObj ? `BUS${busObj.busNumber}` : "BUS";
      const cleanTime = (shiftObj?.startTime || "07:30").replace(":", "");
      const prefix =
        shiftObj?.direction === "HOME_TO_CAMPUS"
          ? "H2C"
          : shiftObj?.direction === "CAMPUS_TO_HOME"
          ? "C2H"
          : "C2C";

      const tripCode = `${prefix}-${routeObj?.code || "R"}-${busLabel}-${cleanTime}-${Math.floor(100 + Math.random() * 900)}`;

      await store.createTrip({
        tripCode,
        routeId: newTrip.routeId,
        busId: newTrip.busId,
        shiftId: newTrip.shiftId || shiftObj?.id || "",
        driverId: newTrip.driverId || "",
        conductorId: newTrip.conductorId || "",
        tripDate: newTrip.tripDate,
        status: "SCHEDULED",
        delayMinutes: 0,
        manifestLocked: false,
        currentStopIndex: 0,
        isSpecial: newTrip.isSpecial,
        facilityType: newTrip.facilityType,
      });

      setTrips(store.getTrips());
      setIsAddTripOpen(false);
      showToast(`✓ Trip scheduled at ${shiftObj?.startTime || "departure time"}!`);
    } catch (err: any) {
      alert("Error scheduling trip: " + (err.message || "Unknown error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in pb-16">
      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700 flex items-center gap-2.5 text-xs font-bold animate-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Top Bar: Title & High-level actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  Trip Schedules & Dispatch Hub
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  {dateScopedTrips.length} Dispatched
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Live run timetable, automated conductor telemetry, and vehicle route dispatches.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Shift Master Link */}
          <Link
            href="/transport-admin/shifts"
            className="px-3.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-2xl flex items-center gap-2 shadow-xs transition-all"
            title="Manage temporal shift schedules, cutoff times, and direction policies"
          >
            <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Shift Master ({shifts.length})</span>
          </Link>

          {/* Schedule New Trip Button */}
          <button
            onClick={() => setIsAddTripOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-2xl flex items-center gap-2 shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Schedule New Trip</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <BusFront className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Active Fleet</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
              {stats.activeBusesCount} <span className="text-xs text-gray-400 font-bold">/ {stats.totalBusesCount} Buses</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Runs Scheduled</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
              {stats.total} Trips
            </div>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Passengers Booked</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
              {stats.confirmedPassengers} <span className="text-xs text-emerald-600 font-bold">({stats.utilizationRate}% Load)</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Live Conductor Sync</div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-tight">
              100% Live <span className="text-xs text-gray-400 font-bold font-mono">({stats.activeBusesCount} Consoles)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Date Selector & Search Toolbar */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 sm:p-5 border border-gray-200/80 dark:border-gray-800 shadow-xs space-y-4">
        {/* Date Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-black text-gray-700 dark:text-gray-300 mr-1">
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <span>Shift Date:</span>
            </div>

            {/* Today Pill */}
            <button
              onClick={() => setSelectedDate(todayDate)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedDate === todayDate
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25 ring-2 ring-blue-400/40"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Today ({todayDate})</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-md text-[10px] bg-white/20">
                {trips.filter((t) => t.tripDate === todayDate).length}
              </span>
            </button>

            {/* Recent Dates */}
            {availableDates
              .filter((d) => d !== todayDate)
              .slice(0, 3)
              .map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedDate === d
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  <span>{d}</span>
                  <span className="ml-1 text-[10px] text-gray-400">
                    ({trips.filter((t) => t.tripDate === d).length})
                  </span>
                </button>
              ))}

            {/* All Dates Toggle */}
            <button
              onClick={() => setSelectedDate("ALL")}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedDate === "ALL"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <span>All Dates Archive ({trips.length})</span>
            </button>
          </div>

          {/* Date Picker Input */}
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
            <span>Pick Date:</span>
            <input
              type="date"
              value={selectedDate === "ALL" ? "" : selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="px-2.5 py-1 text-xs rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono font-bold text-gray-800 dark:text-gray-200 outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Dynamic Shift Filter Row (N Shifts from DB) */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 text-xs font-black text-gray-700 dark:text-gray-300 mr-1">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>Shift Slot:</span>
          </div>

          <button
            onClick={() => setSelectedShiftId("ALL")}
            className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
              selectedShiftId === "ALL"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            All Shifts ({dateScopedTrips.length})
          </button>

          {shifts.map((s) => {
            const shiftCount = dateScopedTrips.filter((t) => t.shiftId === s.id).length;
            const isSelected = selectedShiftId === s.id;
            const isOutbound = s.direction === "CAMPUS_TO_HOME";

            return (
              <button
                key={s.id}
                onClick={() => setSelectedShiftId(s.id)}
                className={`px-3 py-1.5 text-xs font-black rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? isOutbound
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-blue-600 text-white shadow-xs"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <span>{s.name}</span>
                {s.startTime && (
                  <span className="opacity-75 font-mono text-[10px] font-normal">
                    ({s.startTime})
                  </span>
                )}
                <span className="px-1.5 py-0.2 rounded-md text-[10px] bg-white/20 dark:bg-black/20 font-mono">
                  {shiftCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Direction Tabs & View Mode Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Direction Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedDirection("ALL")}
              className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                selectedDirection === "ALL"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              All Directions ({stats.total})
            </button>

            <button
              onClick={() => setSelectedDirection("HOME_TO_CAMPUS")}
              className={`px-3 py-1.5 text-xs font-black rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedDirection === "HOME_TO_CAMPUS"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900"
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Inbound ({stats.homeToCampus})</span>
            </button>

            <button
              onClick={() => setSelectedDirection("CAMPUS_TO_HOME")}
              className={`px-3 py-1.5 text-xs font-black rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedDirection === "CAMPUS_TO_HOME"
                  ? "bg-pink-600 text-white shadow-sm"
                  : "bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Outbound ({stats.campusToHome})</span>
            </button>

            <button
              onClick={() => setSelectedDirection("CAMPUS_TO_CAMPUS")}
              className={`px-3 py-1.5 text-xs font-black rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedDirection === "CAMPUS_TO_CAMPUS"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900"
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Campus ⇄ Campus ({stats.campusToCampus})</span>
            </button>
          </div>

          {/* View Mode & Layout Switcher */}
          <div className="flex items-center gap-2">
            {/* Feed vs Bus Explorer View Mode Switcher */}
            <div className="p-1 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center">
              <button
                type="button"
                onClick={() => setViewMode("FEED")}
                className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "FEED"
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <ListFilter className="w-3.5 h-3.5 text-blue-600" />
                <span>Dispatches Feed</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("BUS_EXPLORER")}
                className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "BUS_EXPLORER"
                    ? "bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 shadow-xs"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Bus Fleet Explorer</span>
              </button>
            </div>

            {/* If in FEED mode: Sub-toggle for Cards vs Table */}
            {viewMode === "FEED" && (
              <div className="p-1 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center">
                <button
                  type="button"
                  onClick={() => setFeedLayout("CARDS")}
                  className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                    feedLayout === "CARDS"
                      ? "bg-white dark:bg-gray-900 text-blue-600 shadow-xs"
                      : "text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                  title="Card View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setFeedLayout("TABLE")}
                  className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                    feedLayout === "TABLE"
                      ? "bg-white dark:bg-gray-900 text-blue-600 shadow-xs"
                      : "text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                  title="Compact Table View"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by bus number, plate, corridor, driver, conductor, or trip code..."
            className="w-full pl-10 pr-4 py-2.5 text-xs rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-blue-500 font-bold"
          />
        </div>
      </div>

      {/* VIEW MODE 1: STREAMLINED DISPATCHES FEED */}
      {viewMode === "FEED" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-gray-400">
            <span>
              Showing {filteredTrips.length} of {dateScopedTrips.length} scheduled services{" "}
              {selectedDate !== "ALL" && `for ${selectedDate}`}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Conductor consoles automatically stream real-time updates</span>
            </span>
          </div>

          {filteredTrips.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-12 text-center border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 mx-auto flex items-center justify-center font-bold">
                <Navigation className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                No Trip Schedules Found
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                No departures match your current direction or search filter. Schedule a new trip to deploy service.
              </p>
              <button
                onClick={() => setIsAddTripOpen(true)}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-2xl shadow-md transition-all cursor-pointer"
              >
                + Schedule New Trip
              </button>
            </div>
          ) : feedLayout === "CARDS" ? (
            /* CLEAN SENIOR DESIGN DISPATCH CARDS (No Nested Boxes) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTrips.map((trip) => {
                const bus =
                  buses.find((b) => b.id === trip.busId) ||
                  buses[0] || { busNumber: "Campus Bus", capacity: 40, registrationNo: "" };
                const route =
                  routes.find((r) => r.id === trip.routeId) ||
                  routes[0] || { name: "University Corridor", code: "R1" };
                const shift =
                  shifts.find((sh) => sh.id === trip.shiftId) ||
                  shifts[0] || { name: "Regular Shift", startTime: "07:30", bookingCutoffMins: 30 };
                const driver = staff.find((st) => st.id === trip.driverId);
                const conductor = staff.find((st) => st.id === trip.conductorId);
                const tripBookings = bookings.filter((b) => b.tripId === trip.id);
                const confirmedCount = tripBookings.filter(
                  (b) => b.status === "CONFIRMED" || b.status === "BOARDED"
                ).length;
                const waitlistCount = tripBookings.filter((b) => b.status === "WAITLISTED").length;

                const dir = getTripDirection(trip);
                const departureTime = shift?.startTime || "07:30";
                const displayBusNumber = getCleanBusNumber(bus.busNumber);
                const endpoints = getCorridorEndpoints(route.name, dir, route);
                const isCutoff = isTripCutoffPassed(trip, shift);

                return (
                  <div
                    key={trip.id}
                    className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-200/90 dark:border-gray-800 shadow-sm hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all duration-200 flex flex-col justify-between group"
                  >
                    <div className="space-y-3.5">
                      {/* Top Row: Time, Shift, Direction & Actions */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-black text-gray-900 dark:text-white font-mono leading-tight">
                              {formatTime(departureTime)}
                            </div>
                            <div className="text-[11px] font-bold text-gray-400 truncate max-w-[140px]">
                              {shift?.name || "Shift Departure"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              dir === "HOME_TO_CAMPUS"
                                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                : dir === "CAMPUS_TO_HOME"
                                ? "bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800"
                                : "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                            }`}
                          >
                            {dir === "HOME_TO_CAMPUS"
                              ? "Inbound"
                              : dir === "CAMPUS_TO_HOME"
                              ? "Outbound"
                              : "Inter-Campus"}
                          </span>

                          {trip.isSpecial && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                              Special
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteTrip(trip.id, trip.tripCode)}
                            className="text-gray-300 hover:text-red-600 dark:text-gray-600 dark:hover:text-red-400 transition-colors p-1"
                            title="Cancel Trip"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Route Corridor Flow Line (Clean, No Nested Boxes) */}
                      <div className="pt-1">
                        <div className="flex items-center gap-2 text-sm font-black text-gray-900 dark:text-white leading-snug">
                          <span className="truncate">{endpoints.origin}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{endpoints.destination}</span>
                        </div>
                        <div className="text-[10px] font-mono font-bold text-gray-400 mt-0.5">
                          Ref: {trip.tripCode}
                        </div>
                      </div>

                      {/* Vehicle & Crew Metadata Badges */}
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 pt-0.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold">
                          <BusFront className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span>{displayBusNumber}</span>
                          {bus.registrationNo && (
                            <span className="text-[10px] text-gray-400 font-mono">
                              ({bus.registrationNo})
                            </span>
                          )}
                        </span>

                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300">
                          <span className="text-gray-400 text-[10px] uppercase font-bold">Driver:</span>
                          <span className="font-bold truncate max-w-[90px]">
                            {driver?.fullName ? driver.fullName.split(" ")[0] : "Pool"}
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300">
                          <span className="text-gray-400 text-[10px] uppercase font-bold">Conductor:</span>
                          <span className="font-bold truncate max-w-[90px]">
                            {conductor?.fullName ? conductor.fullName.split(" ")[0] : "Pool"}
                          </span>
                        </span>
                      </div>

                      {/* Live Passenger Load Bar */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-gray-600 dark:text-gray-300">
                            Bookings: <strong className="text-gray-900 dark:text-white">{confirmedCount}</strong> / {bus.capacity} seats
                          </span>
                          <span className="text-gray-500 font-mono text-[11px]">
                            {Math.round((confirmedCount / (bus.capacity || 40)) * 100)}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              confirmedCount >= (bus.capacity || 40) ? "bg-amber-500" : "bg-blue-600"
                            }`}
                            style={{
                              width: `${Math.min(100, (confirmedCount / (bus.capacity || 40)) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Automated Real-time Status */}
                    <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="text-emerald-700 dark:text-emerald-400">Live Sync</span>
                        <span className="text-gray-300 dark:text-gray-700">•</span>
                        <span>
                          {isCutoff
                            ? "Booking Closed (Past Cutoff)"
                            : `Auto-Closes ${shift?.bookingCutoffMins ?? 30}m prior`}
                        </span>
                      </div>

                      {(trip.isSpecial || shift?.isSpecial) && (
                        <button
                          type="button"
                          onClick={() => setAllocatingTrip(trip)}
                          className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-700 dark:text-amber-300 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                        >
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span>Allocate ({allocations.filter((a) => a.shiftId === trip.shiftId).length})</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* COMPACT TABLE VIEW (Senior Transit Dispatch Table) */
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-800 text-[10px] font-black uppercase tracking-wider text-gray-400">
                    <tr>
                      <th className="py-3 px-4">Departure & Shift</th>
                      <th className="py-3 px-4">Direction</th>
                      <th className="py-3 px-4">Route Corridor</th>
                      <th className="py-3 px-4">Vehicle</th>
                      <th className="py-3 px-4">Crew</th>
                      <th className="py-3 px-4">Bookings</th>
                      <th className="py-3 px-4">Automated Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 font-semibold text-gray-700 dark:text-gray-300">
                    {filteredTrips.map((trip) => {
                      const bus =
                        buses.find((b) => b.id === trip.busId) ||
                        buses[0] || { busNumber: "Campus Bus", capacity: 40, registrationNo: "" };
                      const route =
                        routes.find((r) => r.id === trip.routeId) ||
                        routes[0] || { name: "University Corridor", code: "R1" };
                      const shift =
                        shifts.find((sh) => sh.id === trip.shiftId) ||
                        shifts[0] || { name: "Regular Shift", startTime: "07:30", bookingCutoffMins: 30 };
                      const driver = staff.find((st) => st.id === trip.driverId);
                      const conductor = staff.find((st) => st.id === trip.conductorId);
                      const tripBookings = bookings.filter((b) => b.tripId === trip.id);
                      const confirmedCount = tripBookings.filter(
                        (b) => b.status === "CONFIRMED" || b.status === "BOARDED"
                      ).length;

                      const dir = getTripDirection(trip);
                      const departureTime = shift?.startTime || "07:30";
                      const displayBusNumber = getCleanBusNumber(bus.busNumber);
                      const endpoints = getCorridorEndpoints(route.name, dir, route);
                      const isCutoff = isTripCutoffPassed(trip, shift);

                      return (
                        <tr
                          key={trip.id}
                          className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors"
                        >
                          {/* Departure & Shift */}
                          <td className="py-3.5 px-4 font-mono">
                            <div className="font-black text-sm text-gray-900 dark:text-white">
                              {formatTime(departureTime)}
                            </div>
                            <div className="text-[10px] text-gray-400 font-sans">{shift?.name}</div>
                          </td>

                          {/* Direction */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                dir === "HOME_TO_CAMPUS"
                                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                                  : dir === "CAMPUS_TO_HOME"
                                  ? "bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300"
                                  : "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300"
                              }`}
                            >
                              {dir === "HOME_TO_CAMPUS" ? "Inbound" : dir === "CAMPUS_TO_HOME" ? "Outbound" : "Inter-Campus"}
                            </span>
                          </td>

                          {/* Corridor */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                              <span>{endpoints.origin}</span>
                              <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                              <span>{endpoints.destination}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">{trip.tripCode}</div>
                          </td>

                          {/* Vehicle */}
                          <td className="py-3.5 px-4">
                            <div className="font-black text-gray-900 dark:text-white flex items-center gap-1">
                              <BusFront className="w-3.5 h-3.5 text-purple-600" />
                              <span>{displayBusNumber}</span>
                            </div>
                            {bus.registrationNo && (
                              <div className="text-[10px] font-mono text-gray-400">{bus.registrationNo}</div>
                            )}
                          </td>

                          {/* Crew */}
                          <td className="py-3.5 px-4 text-[11px]">
                            <div>
                              <span className="text-gray-400">Dr:</span>{" "}
                              <span className="font-bold">{driver?.fullName ? driver.fullName.split(" ")[0] : "Pool"}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Cd:</span>{" "}
                              <span className="font-bold">{conductor?.fullName ? conductor.fullName.split(" ")[0] : "Pool"}</span>
                            </div>
                          </td>

                          {/* Bookings */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-gray-900 dark:text-white">
                              {confirmedCount} / {bus.capacity}
                            </div>
                            <div className="w-16 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mt-1">
                              <div
                                className="h-full bg-blue-600 rounded-full"
                                style={{
                                  width: `${Math.min(100, (confirmedCount / (bus.capacity || 40)) * 100)}%`,
                                }}
                              />
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Live Sync</span>
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {isCutoff ? "Booking Closed" : `Auto ${shift?.bookingCutoffMins ?? 30}m cutoff`}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {(trip.isSpecial || shift?.isSpecial) && (
                                <button
                                  type="button"
                                  onClick={() => setAllocatingTrip(trip)}
                                  className="px-2 py-1 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-700 dark:text-amber-300 text-[10px] font-bold rounded-lg transition-all"
                                >
                                  Allocate
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteTrip(trip.id, trip.tripCode)}
                                className="p-1.5 text-gray-300 hover:text-red-600 dark:text-gray-600 dark:hover:text-red-400 transition-colors rounded-lg"
                                title="Cancel Trip"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: BUS FLEET EXPLORER */}
      {viewMode === "BUS_EXPLORER" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                <BusFront className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span>Fleet Vehicle Explorer</span>
              </h2>
              <p className="text-xs text-gray-500">
                Explore every vehicle in the fleet and inspect all assigned trip departures for{" "}
                {selectedDate === "ALL" ? "all dates" : selectedDate}.
              </p>
            </div>
            <span className="text-xs font-bold text-gray-400">
              Showing {busExplorerData.length} Vehicles
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {busExplorerData.map(({ bus, trips: busTrips, allDateTrips, confirmedBookings, primaryDriver }) => {
              const isBusActive = bus.status === "ACTIVE";

              return (
                <div
                  key={bus.id}
                  className="relative overflow-hidden p-6 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-purple-400 dark:hover:border-purple-500 transition-all duration-300 flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    {/* Top Bus Badge & Capacity Strip */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 group-hover:scale-105 transition-transform">
                          <BusFront className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                              {bus.busNumber}
                            </h3>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isBusActive ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                              }`}
                            />
                          </div>
                          <p className="text-xs font-mono font-bold text-gray-400 mt-0.5">
                            {bus.registrationNo || "Registration Pending"}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-full">
                          {bus.capacity} Seats
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold mt-1">
                          {bus.status || "ACTIVE"}
                        </span>
                      </div>
                    </div>

                    {/* Driver & IoT GPS Info Strip */}
                    <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-gray-400">Assigned Driver</span>
                        <div className="font-bold text-gray-800 dark:text-gray-200 truncate mt-0.5">
                          {primaryDriver?.fullName || "Pool Driver"}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-gray-400">IoT Telematics</span>
                        <div className="font-mono text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>{bus.gpsDeviceId ? `GPS #${bus.gpsDeviceId}` : "Standard GPS"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Today's Runs / Schedule Timeline for this Bus */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>Scheduled Departures ({busTrips.length})</span>
                        </span>
                        {busTrips.length > 0 && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {confirmedBookings} Bookings
                          </span>
                        )}
                      </div>

                      {busTrips.length === 0 ? (
                        <div className="p-4 rounded-2xl bg-gray-50/70 dark:bg-gray-800/30 border border-dashed border-gray-200 dark:border-gray-700 text-center space-y-2">
                          <p className="text-xs text-gray-400 font-semibold">
                            No departures scheduled for this vehicle on {selectedDate === "ALL" ? "today" : selectedDate}.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleAddTripForBus(bus.id)}
                            className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                          >
                            + Assign Run to {bus.busNumber}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                          {busTrips.map((trip) => {
                            const route = routes.find((r) => r.id === trip.routeId);
                            const shift = shifts.find((sh) => sh.id === trip.shiftId);
                            const dir = getTripDirection(trip);
                            const tripBookings = bookings.filter((b) => b.tripId === trip.id);
                            const confirmedCount = tripBookings.filter(
                              (b) => b.status === "CONFIRMED" || b.status === "BOARDED"
                            ).length;
                            const departureTime = shift?.startTime || "07:30";
                            const endpoints = getCorridorEndpoints(route?.name || "University Corridor", dir, route);
                            const isCutoff = isTripCutoffPassed(trip, shift);

                            return (
                              <div
                                key={trip.id}
                                className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 space-y-2 hover:border-blue-400 transition-all"
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                      dir === "HOME_TO_CAMPUS"
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                        : dir === "CAMPUS_TO_HOME"
                                        ? "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300"
                                        : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                    }`}
                                  >
                                    {dir === "HOME_TO_CAMPUS" ? "Inbound" : dir === "CAMPUS_TO_HOME" ? "Outbound" : "Special"}
                                  </span>

                                  <span className="font-mono text-xs font-black text-blue-600 dark:text-blue-400">
                                    {formatTime(departureTime)}
                                  </span>
                                </div>

                                <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                  {endpoints.origin} → {endpoints.destination}
                                </div>

                                {/* Mini occupancy bar */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                                    <span>Load: {confirmedCount} / {bus.capacity}</span>
                                    <span>{Math.round((confirmedCount / (bus.capacity || 40)) * 100)}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-blue-600 rounded-full transition-all"
                                      style={{
                                        width: `${Math.min(100, (confirmedCount / (bus.capacity || 40)) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Live Sync Status & Delete */}
                                <div className="flex items-center justify-between pt-1 border-t border-gray-200/60 dark:border-gray-700/60 text-xs">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">Live Sync</span>
                                    <span className="text-gray-400">•</span>
                                    <span className="text-gray-500">
                                      {isCutoff
                                        ? "Cutoff Passed"
                                        : `Auto ${shift?.bookingCutoffMins ?? 30}m cutoff`}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTrip(trip.id, trip.tripCode)}
                                    className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                    title="Cancel Run"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom Quick Action */}
                  <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => handleAddTripForBus(bus.id)}
                      className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-800 dark:text-gray-200 text-xs font-black rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Schedule Trip for {bus.busNumber}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SCHEDULE NEW TRIP MODAL */}
      {isAddTripOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <form
            onSubmit={handleCreateTrip}
            className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 space-y-5 text-gray-900 dark:text-white shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-black text-lg flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-600" />
                  <span>Schedule Departure Trip</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Deploy a transit run instance for your selected vehicle, shift window, and corridor route.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddTripOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STEP 1: Special Facility Classification */}
            <div className="p-3.5 bg-yellow-50/80 dark:bg-yellow-950/30 rounded-2xl border border-yellow-200 dark:border-yellow-800/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-yellow-100 dark:yellow-900 text-yellow-700 dark:text-yellow-300 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-gray-900 dark:text-white">
                      Special Facility / Exclusive Allocation
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">
                      Restricts booking visibility to only admin-allocated students
                    </div>
                  </div>
                </div>

                <input
                  type="checkbox"
                  id="isSpecialToggle"
                  checked={newTrip.isSpecial}
                  onChange={(e) =>
                    setNewTrip((prev) => ({
                      ...prev,
                      isSpecial: e.target.checked,
                      facilityType: e.target.checked
                        ? prev.facilityType === "REGULAR"
                          ? "PLACEMENT_DRIVE"
                          : prev.facilityType
                        : "REGULAR",
                    }))
                  }
                  className="w-4 h-4 text-yellow-600 rounded border-gray-300 focus:ring-yellow-500"
                />
              </div>

              {newTrip.isSpecial && (
                <div className="pt-2 border-t border-yellow-200/60 dark:border-yellow-800/40 flex items-center gap-4 text-xs font-bold">
                  <label className="flex items-center gap-1.5 cursor-pointer text-gray-800 dark:text-gray-200">
                    <input
                      type="radio"
                      name="facilityType"
                      value="PLACEMENT_DRIVE"
                      checked={newTrip.facilityType === "PLACEMENT_DRIVE"}
                      onChange={() => setNewTrip((prev) => ({ ...prev, facilityType: "PLACEMENT_DRIVE" }))}
                      className="text-yellow-600"
                    />
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
                      Placement Drive
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-gray-800 dark:text-gray-200">
                    <input
                      type="radio"
                      name="facilityType"
                      value="EVENT"
                      checked={newTrip.facilityType === "EVENT"}
                      onChange={() => setNewTrip((prev) => ({ ...prev, facilityType: "EVENT" }))}
                      className="text-yellow-600"
                    />
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                      Campus Event / Conclave
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* STEP 2: Service Date */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                1. Specify Departure Service Date *
              </label>
              <input
                type="date"
                required
                value={newTrip.tripDate}
                onChange={(e) => setNewTrip((prev) => ({ ...prev, tripDate: e.target.value }))}
                className="w-full p-2.5 text-xs font-bold rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 outline-none focus:border-blue-500"
              />
            </div>

            {/* STEP 3: Corridor Route, Shift & Bus Allocation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  2. Corridor Route *
                </label>
                <CustomDropdown
                  value={newTrip.routeId}
                  onChange={(val) => setNewTrip((prev) => ({ ...prev, routeId: val }))}
                  placeholder="-- Choose Corridor --"
                  options={[
                    { value: "", label: "-- Choose Corridor --" },
                    ...routes.map((r) => ({
                      value: r.id,
                      label: r.name,
                    })),
                  ]}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  3. Assign to Shift *
                </label>
                <CustomDropdown
                  value={newTrip.shiftId || shifts[0]?.id || ""}
                  onChange={(val) => {
                    setNewTrip((prev) => ({
                      ...prev,
                      shiftId: val,
                    }));
                  }}
                  options={shifts.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.startTime} - ${s.endTime}) [${s.shiftType}]`,
                  }))}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  4. Allocate Fleet Bus *
                </label>
                <CustomDropdown
                  value={newTrip.busId > 0 ? String(newTrip.busId) : ""}
                  onChange={(val) => setNewTrip((prev) => ({ ...prev, busId: val ? Number(val) : -1 }))}
                  placeholder="-- Choose Vehicle --"
                  options={[
                    { value: "", label: "-- Choose Vehicle --" },
                    ...buses.map((b) => ({
                      value: String(b.id),
                      label: `Bus ${b.busNumber} • ${b.capacity} Seats (${b.registrationNo}) [${b.status}]`,
                    })),
                  ]}
                />
              </div>
            </div>

            {/* STEP 4: Crew Assignment (Optional) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Assign Driver (Optional)
                </label>
                <CustomDropdown
                  value={newTrip.driverId}
                  onChange={(val) => setNewTrip((prev) => ({ ...prev, driverId: val }))}
                  placeholder="-- Select Driver --"
                  options={[
                    { value: "", label: "-- Select Driver --" },
                    ...staff
                      .filter((s) => s.role === "driver")
                      .map((d) => ({
                        value: d.id,
                        label: `${d.fullName} (${d.phone})`,
                      })),
                  ]}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Assign Conductor (Optional)
                </label>
                <CustomDropdown
                  value={newTrip.conductorId}
                  onChange={(val) => setNewTrip((prev) => ({ ...prev, conductorId: val }))}
                  placeholder="-- Select Conductor --"
                  options={[
                    { value: "", label: "-- Select Conductor --" },
                    ...staff
                      .filter((s) => s.role === "conductor" || s.role === "driver")
                      .map((c) => ({
                        value: c.id,
                        label: `${c.fullName} (${c.phone})`,
                      })),
                  ]}
                />
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setIsAddTripOpen(false)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 rounded-2xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !newTrip.routeId || !newTrip.busId}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Deploying Schedule...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Deploy Trip Schedule</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SPECIAL FACILITY STUDENT ALLOCATION MODAL */}
      {allocatingTrip && (() => {
        const tripShift = shifts.find((s) => s.id === allocatingTrip.shiftId);
        const tripRoute = routes.find((r) => r.id === allocatingTrip.routeId);
        const tripBus = buses.find((b) => b.id === allocatingTrip.busId);
        const shiftAllocations = allocations.filter((a) => a.shiftId === allocatingTrip.shiftId);
        const allocatedStudentIds = new Set(shiftAllocations.map((a) => a.studentId));

        const filteredStudents = students.filter((s) => {
          const query = studentSearch.toLowerCase();
          return (
            s.fullName?.toLowerCase().includes(query) ||
            s.email?.toLowerCase().includes(query) ||
            s.studentIdCode?.toLowerCase().includes(query) ||
            s.department?.toLowerCase().includes(query) ||
            s.className?.toLowerCase().includes(query) ||
            s.courseName?.toLowerCase().includes(query)
          );
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
            <div className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 space-y-5 text-gray-900 dark:text-white shadow-2xl my-8 max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                      <GraduationCap className="w-5 h-5" />
                    </span>
                    <h3 className="font-black text-lg">
                      Allocate Commuters to Special Facility
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    <strong>{tripShift?.name || "Special Placement Shift"}</strong> • Route: {tripRoute?.name || "Campus Express"}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-yellow-50 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">
                      <Lock className="w-2.5 h-2.5 text-yellow-700 dark:text-yellow-400 shrink-0" />
                      <span>Access Controlled: Only allocated students will see this shift on their portal.</span>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAllocatingTrip(null);
                    setStudentSearch("");
                  }}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <div className="text-[10px] uppercase font-bold text-gray-400">Total Allocated</div>
                  <div className="text-lg font-black text-gray-900 dark:text-white">
                    {shiftAllocations.length} Students
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <div className="text-[10px] uppercase font-bold text-gray-400">Bus Capacity</div>
                  <div className="text-lg font-black text-gray-900 dark:text-white">
                    {tripBus?.capacity || 40} Seats ({tripBus?.busNumber || "Bus"})
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 col-span-2 sm:col-span-1">
                  <div className="text-[10px] uppercase font-bold text-gray-400">Shift Code</div>
                  <div className="text-sm font-mono font-bold text-gray-900 dark:text-white truncate">
                    {allocatingTrip.tripCode}
                  </div>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search student by name, email, student ID, or course..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              {/* Students List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[360px]">
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400 font-bold">
                    No matching students found.
                  </div>
                ) : (
                  filteredStudents.map((student) => {
                    const isAllocated = allocatedStudentIds.has(student.id);
                    return (
                      <div
                        key={student.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                          isAllocated
                            ? "bg-yellow-50/70 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-800"
                            : "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/60"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isAllocated
                                ? "bg-yellow-500 text-white"
                                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {student.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs text-gray-900 dark:text-white truncate flex items-center gap-2">
                              <span>{student.fullName}</span>
                              {isAllocated && (
                                <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-200">
                                  Allocated ✓
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono truncate">
                              ID: {student.studentIdCode || "Pending"}
                              {student.email ? ` • ${student.email}` : ""} •{" "}
                              {student.department || student.courseName} (Sem {student.semester})
                            </div>
                          </div>
                        </div>

                        {/* Action Button */}
                        {isAllocated ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await store.removeStudentFromSpecialShift(allocatingTrip.shiftId, student.id);
                              setAllocations([...store.getSpecialShiftAllocations()]);
                              showToast(`Removed ${student.fullName} from facility allocation.`);
                            }}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 text-xs font-bold rounded-xl border border-red-200 dark:border-red-900 transition-all shrink-0 cursor-pointer"
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              await store.allocateStudentToSpecialShift(
                                allocatingTrip.shiftId,
                                student.id,
                                allocatingTrip.id
                              );
                              setAllocations([...store.getSpecialShiftAllocations()]);
                              showToast(`Allocated ${student.fullName} to ${tripShift?.name || "facility"}.`);
                            }}
                            className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Allocate +</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setAllocatingTrip(null);
                    setStudentSearch("");
                  }}
                  className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-xs rounded-2xl shadow-xs transition-all cursor-pointer"
                >
                  Done & Save Allocations
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
