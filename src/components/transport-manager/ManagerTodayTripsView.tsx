"use client";

import React, { useState, useEffect, useMemo } from "react";
import { store } from "@/lib/store";
import { getTodayIST } from "@/lib/time-manager";
import {
  Navigation,
  BusFront,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  X,
  Trash2,
  Sun,
  Moon,
  ChevronDown,
  Layers,
  MapPin,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Calendar,
} from "lucide-react";
import type { Trip, Bus, Route, Shift, Staff, Booking } from "@/lib/types";
import { CustomDropdown } from "@/components/common/CustomDropdown";

interface ManagerTodayTripsViewProps {
  initialTrips?: Trip[];
  initialBuses?: Bus[];
  initialRoutes?: Route[];
  initialShifts?: Shift[];
  initialStaff?: Staff[];
  initialBookings?: Booking[];
}

interface ReassignmentPending {
  bus: Bus;
  oldTrip: Trip;
  oldStopName: string;
  oldRouteName: string;
  newRoute: Route;
  newStopIndex: number;
  newStopName: string;
}

export default function ManagerTodayTripsView({
  initialTrips = [],
  initialBuses = [],
  initialRoutes = [],
  initialShifts = [],
  initialStaff = [],
}: ManagerTodayTripsViewProps) {
  // 1. Reactive state initialized with server data and store
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

  // Subscribe to store updates
  useEffect(() => {
    const unsub = store.subscribe(() => {
      setTrips([...store.getTrips()]);
      setBuses([...store.getBuses()]);
      setRoutes([...store.getRoutes()]);
      setShifts([...store.getShifts()]);
      setStaff([...store.getStaff()]);
    });
    return unsub;
  }, []);

  const todayDate = useMemo(() => getTodayIST(), []);

  // Format today's human-readable date: e.g. "Thursday, Oct 15"
  const formattedTodayDate = useMemo(() => {
    try {
      const [year, month, day] = todayDate.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    } catch {
      return todayDate;
    }
  }, [todayDate]);

  // Dynamic shift selection (supports arbitrary N shifts defined in database)
  const [selectedShiftId, setSelectedShiftId] = useState<string>(() => shifts[0]?.id || "ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>("ALL");

  // Reassignment Confirmation Modal State
  const [pendingReassignment, setPendingReassignment] = useState<ReassignmentPending | null>(null);

  // Delete Bus Confirmation Modal State
  const [pendingDelete, setPendingDelete] = useState<{
    tripId: string;
    busNumber: string;
    stopName: string;
    routeName: string;
  } | null>(null);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Active shift record
  const activeShift = useMemo(() => {
    if (selectedShiftId === "ALL") return null;
    return shifts.find((s) => s.id === selectedShiftId) || null;
  }, [selectedShiftId, shifts]);

  // Filter Trips for today & active shift (or all shifts if ALL selected)
  const todayShiftTrips = useMemo(() => {
    return trips.filter((t) => {
      if (t.tripDate !== todayDate) return false;
      if (selectedShiftId !== "ALL" && t.shiftId !== selectedShiftId) return false;
      return true;
    });
  }, [trips, todayDate, selectedShiftId]);

  // Lookup maps
  const busMap = useMemo(() => new Map(buses.map((b) => [b.id, b])), [buses]);
  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // Map of routeId -> Trip[] for active shift
  const routeTripsMap = useMemo(() => {
    const map = new Map<string, Trip[]>();
    for (const t of todayShiftTrips) {
      const list = map.get(t.routeId) || [];
      list.push(t);
      map.set(t.routeId, list);
    }
    return map;
  }, [todayShiftTrips]);

  // Global Bus Allocation Map: busId -> { trip, route, stopName, stopIndex }
  const busAllocationMap = useMemo(() => {
    const map = new Map<
      number,
      { trip: Trip; route: Route; stopName: string; stopIndex: number }
    >();

    for (const t of todayShiftTrips) {
      if (!t.busId) continue;
      const r = routes.find((route) => route.id === t.routeId);
      if (!r) continue;

      const stopIdx = t.currentStopIndex ?? 0;
      const stopObj = r.stops?.[stopIdx]?.stop;
      const stopName = stopObj?.name || r.stops?.[0]?.stop?.name || "Origin Stop";

      map.set(t.busId, {
        trip: t,
        route: r,
        stopName,
        stopIndex: stopIdx,
      });
    }

    return map;
  }, [todayShiftTrips, routes]);

  // Operational buses counts
  const assignedBusIds = useMemo(() => {
    const ids = new Set<number>();
    for (const t of todayShiftTrips) {
      if (t.busId) ids.add(t.busId);
    }
    return ids;
  }, [todayShiftTrips]);

  const availableBuses = useMemo(() => {
    return buses.filter((b) => !assignedBusIds.has(b.id) && b.status !== "MAINTENANCE");
  }, [buses, assignedBusIds]);

  // Filtered corridors list
  const filteredRoutes = useMemo(() => {
    let result = routes;

    if (selectedRouteFilter !== "ALL") {
      result = result.filter((r) => r.id === selectedRouteFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((r) => {
        const matchesName = r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
        const matchesStop = (r.stops || []).some(
          (rs) => rs.stop?.name?.toLowerCase().includes(q) || rs.stop?.code?.toLowerCase().includes(q)
        );
        const assignedBuses = (routeTripsMap.get(r.id) || [])
          .map((t) => (t.busId ? busMap.get(t.busId) : null))
          .filter(Boolean);
        const matchesBus = assignedBuses.some(
          (b) =>
            String(b?.busNumber).includes(q) || b?.registrationNo.toLowerCase().includes(q)
        );
        return matchesName || matchesStop || matchesBus;
      });
    }

    return result;
  }, [routes, selectedRouteFilter, searchQuery, routeTripsMap, busMap]);

  // ── Handler: Directly Assign an Available Bus to a Stop ───────────────────
  const executeAssignBusToStop = async (route: Route, stopIndex: number, bus: Bus) => {
    const targetShiftId = activeShift?.id || shifts[0]?.id || "shift-1";
    const targetShift = shifts.find(s => s.id === targetShiftId);
    const shiftCode = (targetShift?.startTime || "00:00").replace(":", "");
    const busSuffix = String(bus.busNumber);
    const tripCode = `TRIP-${route.code.replace(/[^A-Za-z0-9]/g, "")}-${shiftCode}-${busSuffix}-${todayDate.replace(/-/g, "").slice(4)}`;

    await store.createTrip({
      tripCode,
      routeId: route.id,
      busId: bus.id,
      shiftId: targetShiftId,
      driverId: staff.find((s) => s.role === "driver")?.id || "",
      conductorId: staff.find((s) => s.role === "conductor")?.id || "",
      tripDate: todayDate,
      status: "SCHEDULED",
      delayMinutes: 0,
      manifestLocked: false,
      currentStopIndex: stopIndex,
    });

    await store.allocateBusToRoute(bus.id, route.id);

    const stopName = route.stops?.[stopIndex]?.stop?.name || `Stop #${stopIndex + 1}`;
    showToast(`✓ Bus ${bus.busNumber} assigned to start at ${stopName}!`);
  };

  // ── Handler: When Manager Selects a Bus from the Dropdown ─────────────────
  const handleSelectBusForStop = (
    route: Route,
    stopIndex: number,
    stopName: string,
    selectedBusId: string | number
  ) => {
    if (!selectedBusId) return;

    const bus = busMap.get(Number(selectedBusId));
    if (!bus) return;

    const existingAllocation = busAllocationMap.get(Number(selectedBusId));

    if (existingAllocation) {
      if (existingAllocation.route?.id === route.id && existingAllocation.stopIndex === stopIndex) {
        // Already at this exact stop, no action needed
        return;
      }

      // Already allocated elsewhere -> Show Reassignment Confirmation Modal
      setPendingReassignment({
        bus,
        oldTrip: existingAllocation.trip,
        oldStopName: existingAllocation.stopName,
        oldRouteName: existingAllocation.route?.name || "Another Corridor",
        newRoute: route,
        newStopIndex: stopIndex,
        newStopName: stopName,
      });
    } else {
      // Unassigned available bus -> Directly allocate
      executeAssignBusToStop(route, stopIndex, bus);
    }
  };

  // ── Handler: Confirm Reassignment from Old Stop to New Stop ───────────────
  const handleConfirmReassignment = async () => {
    if (!pendingReassignment) return;

    const { bus, oldTrip, oldStopName, newRoute, newStopIndex, newStopName } = pendingReassignment;

    try {
      // 1. Delete old trip allocation
      await store.deleteTrip(oldTrip.id);

      // 2. Create new trip starting from the new stop
      await executeAssignBusToStop(newRoute, newStopIndex, bus);

      showToast(`✓ Bus ${bus.busNumber} moved from ${oldStopName} to ${newStopName}!`);
    } catch (err: any) {
      console.error("Reassignment error:", err);
      showToast(`✕ Reassignment failed: ${err.message}`);
    } finally {
      setPendingReassignment(null);
    }
  };

  // ── Handler: Confirm Deleting / Unassigning Bus from Stop ──────────────────
  const handleConfirmDeleteBus = async () => {
    if (!pendingDelete) return;

    const { tripId, busNumber, stopName } = pendingDelete;

    try {
      await store.deleteTrip(tripId);
      showToast(`✓ Bus ${busNumber} removed from ${stopName} and returned to yard.`);
    } catch (err: any) {
      console.error("Delete error:", err);
      showToast(`✕ Failed to remove bus: ${err.message}`);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* ── Toast Notification Banner ─────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-semibold">{toastMessage}</p>
        </div>
      )}

      {/* ── Shift & Operational Header ────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Fleet Dispatch
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>{formattedTodayDate}</span>
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mt-1">
            Today&apos;s Corridor & Stop Bus Allocation
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Assign multiple buses per corridor starting from any intermediate sub-stop.
          </p>
        </div>

        {/* Dynamic Shift Switcher Pills (N Shifts) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            onClick={() => setSelectedShiftId("ALL")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
              selectedShiftId === "ALL"
                ? "bg-slate-900 dark:bg-white text-white dark:text-gray-900 shadow-md"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <span>All Shifts</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 dark:bg-black/20 font-mono">
              {trips.filter((t) => t.tripDate === todayDate).length}
            </span>
          </button>

          {shifts.map((s) => {
            const count = trips.filter((t) => t.tripDate === todayDate && t.shiftId === s.id).length;
            const isSelected = selectedShiftId === s.id;
            const isOutbound = s.direction === "CAMPUS_TO_HOME";

            return (
              <button
                key={s.id}
                onClick={() => setSelectedShiftId(s.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                  isSelected
                    ? isOutbound
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-transparent hover:border-gray-300 dark:hover:border-gray-700"
                }`}
              >
                <span>{s.name}</span>
                {s.startTime && (
                  <span className="opacity-75 font-mono text-[11px] font-normal">
                    ({s.startTime})
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 dark:bg-black/20 font-mono">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Fleet KPI Summary Strip ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Corridors</div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{routes.length}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Active routes in transit</div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Buses Allocated
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {assignedBusIds.size}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Operating on today&apos;s shift</div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            Available in Yard
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {availableBuses.length}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Ready for deployment</div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
            Active Trips
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
            {todayShiftTrips.length}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Scheduled services</div>
        </div>
      </div>

      {/* ── Search & Corridor Selection Bar ───────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-4 shadow-sm space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search corridor name, code, stop, or bus number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 rounded-2xl text-sm font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Corridor Quick Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedRouteFilter("ALL")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedRouteFilter === "ALL"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            All Corridors ({routes.length})
          </button>
          {routes.map((r) => {
            const corridorTrips = routeTripsMap.get(r.id) || [];
            const isSelected = selectedRouteFilter === r.id;

            return (
              <button
                key={r.id}
                onClick={() => setSelectedRouteFilter(r.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                <span>{r.code}</span>
                {corridorTrips.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected
                        ? "bg-blue-700 text-white"
                        : "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {corridorTrips.length} bus
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Vertical Corridor & Stop-by-Stop List ────────────────── */}
      <div className="space-y-6">
        {filteredRoutes.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-12 text-center text-gray-400">
            <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
            <p className="font-semibold text-sm">No corridors match your search.</p>
          </div>
        ) : (
          filteredRoutes.map((route) => {
            const corridorTrips = routeTripsMap.get(route.id) || [];
            const stops = route.stops || [];

            return (
              <div
                key={route.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden"
              >
                {/* Corridor Top Color Bar */}
                <div
                  className="absolute top-0 left-0 right-0 h-1.5 w-full"
                  style={{ backgroundColor: route.color || "#3b82f6" }}
                />

                {/* 1. Corridor Header Name & Summary */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-gray-100 dark:border-gray-800">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-2.5 py-0.5 rounded-lg text-xs font-black text-white"
                        style={{ backgroundColor: route.color || "#3b82f6" }}
                      >
                        {route.code}
                      </span>
                      <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                        {route.name}
                      </h2>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                      <span>{stops.length} Sequential Stops</span>
                      <span>•</span>
                      <span>{route.totalDistanceKm || 25} km corridor</span>
                      <span>•</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {activeShift ? activeShift.name : "All Daily Shifts"}
                      </span>
                    </div>
                  </div>

                  {/* Summary of Allocated Buses */}
                  <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                    {corridorTrips.length === 0 ? (
                      <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        0 Buses Allocated (Select a bus below)
                      </span>
                    ) : (
                      <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                        <BusFront className="w-3.5 h-3.5" />
                        <span>
                          {corridorTrips.length} Bus{corridorTrips.length > 1 ? "es" : ""} Assigned to this corridor
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Vertical Stops Sequence Flowchart */}
                <div className="pt-6">
                  {stops.length === 0 ? (
                    <div className="text-xs text-gray-400 italic py-4">
                      No stops configured for this corridor.
                    </div>
                  ) : (
                    <div className="relative pl-6 sm:pl-8 space-y-6">
                      {/* Vertical Connecting Timeline Bar */}
                      <div className="absolute left-2.5 sm:left-3.5 top-4 bottom-6 w-0.5 bg-blue-300 dark:bg-blue-800" />

                      {stops.map((rs, stopIndex) => {
                        const stopId = rs.stopId || rs.stop?.id || `stop-${stopIndex}`;
                        const stopName = rs.stop?.name || `Stop #${stopIndex + 1}`;
                        const isFirstStop = stopIndex === 0;
                        const isLastStop = stopIndex === stops.length - 1;

                        // Identify all trips/buses starting from this exact stop
                        const allocatedStopTrips = corridorTrips.filter(
                          (t) => (t.currentStopIndex ?? 0) === stopIndex && t.busId
                        );

                        return (
                          <div key={stopId} className="relative group">
                            {/* Stop Node Icon / Number Pin */}
                            <div
                              className={`absolute -left-6 sm:-left-8 top-1 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-mono font-black text-xs text-white shadow-md z-10 transition-transform ${
                                isFirstStop
                                  ? "bg-green-600 ring-4 ring-green-100 dark:ring-green-950"
                                  : isLastStop
                                  ? "bg-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-950"
                                  : "bg-blue-600 ring-4 ring-blue-100 dark:ring-blue-950"
                              }`}
                            >
                              {stopIndex + 1}
                            </div>

                            {/* Stop Card */}
                            <div className="bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80 rounded-2xl p-4 sm:p-5 transition-all hover:border-blue-400 dark:hover:border-blue-600 space-y-3">
                              {/* Stop Title & Meta */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-black text-sm sm:text-base text-gray-900 dark:text-white">
                                      {stopName}
                                    </h3>
                                    {isFirstStop && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300">
                                        Route Origin
                                      </span>
                                    )}
                                    {isLastStop && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
                                        Campus Terminus
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                                    <span>
                                      Stop #{stopIndex + 1} of {stops.length}
                                    </span>
                                    <span>•</span>
                                    <span>+{rs.arrivalOffsetMinutes || stopIndex * 8}m offset</span>
                                    {rs.stop?.landmark && (
                                      <>
                                        <span>•</span>
                                        <span>{rs.stop.landmark}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Allocated Buses with Delete Button */}
                              {allocatedStopTrips.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700/60">
                                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <BusFront className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                    <span>Buses Starting from this stop ({allocatedStopTrips.length}):</span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {allocatedStopTrips.map((t) => {
                                      const bus = busMap.get(t.busId);
                                      if (!bus) return null;
                                      const driver = t.driverId ? staffMap.get(t.driverId) : null;

                                      return (
                                        <div
                                          key={t.id}
                                          className="flex items-center justify-between gap-3 bg-white dark:bg-gray-850 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 shadow-sm"
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-black text-xs flex-shrink-0">
                                              {String(bus.busNumber)}
                                            </div>
                                            <div className="min-w-0">
                                              <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                                Bus {bus.busNumber}
                                              </div>
                                              <div className="text-[10px] text-gray-500 font-mono truncate">
                                                {bus.registrationNo} • {bus.capacity} Seats
                                                {driver ? ` • Driver: ${driver.fullName}` : ""}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Delete / Remove Button */}
                                          <button
                                            onClick={() =>
                                              setPendingDelete({
                                                tripId: t.id,
                                                busNumber: String(bus.busNumber),
                                                stopName,
                                                routeName: route.name,
                                              })
                                            }
                                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/60 transition-colors flex-shrink-0"
                                            title="Remove bus from this stop"
                                            aria-label="Remove bus from this stop"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Searchable Bus Assignment Dropdown */}
                              <div className="pt-2">
                                <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">
                                  + Assign / Allocate Bus to this Stop:
                                </label>
                                <CustomDropdown
                                  value=""
                                  onChange={(val) => {
                                    if (val) {
                                      handleSelectBusForStop(route, stopIndex, stopName, val);
                                    }
                                  }}
                                  placeholder={`Select an existing fleet bus to assign to ${stopName}...`}
                                  options={buses
                                    .filter((b) => b.status !== "MAINTENANCE")
                                    .map((b) => {
                                      const alloc = busAllocationMap.get(b.id);
                                      const isAssignedHere =
                                        alloc &&
                                        alloc.route?.id === route.id &&
                                        alloc.stopIndex === stopIndex;

                                      return {
                                        value: String(b.id),
                                        label: `Bus ${b.busNumber} (${b.registrationNo}) ${
                                          isAssignedHere
                                            ? "— [✓ Already assigned here]"
                                            : alloc
                                            ? `— [Assigned to ${alloc.stopName} (${alloc.route?.code || "Other"})]`
                                            : `— [${b.capacity} Seats • Available in Yard]`
                                        }`,
                                        disabled: Boolean(isAssignedHere),
                                      };
                                    })}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Confirmation Modal: Reassign Bus to Different Stop ────────── */}
      {pendingReassignment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 max-w-md w-full rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  Confirm Bus Reassignment
                </h3>
                <p className="text-xs text-gray-500">
                  {pendingReassignment.bus.busNumber} ({pendingReassignment.bus.registrationNo})
                </p>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-xs space-y-2 text-amber-900 dark:text-amber-200">
              <p>
                <strong>{pendingReassignment.bus.busNumber}</strong> is currently assigned to start at:
              </p>
              <div className="flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100 bg-white/70 dark:bg-gray-900/60 p-2 rounded-xl border border-amber-300 dark:border-amber-800">
                <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{pendingReassignment.oldStopName} ({pendingReassignment.oldRouteName})</span>
              </div>
              <p className="pt-1">
                Do you want to <strong>remove</strong> it from {pendingReassignment.oldStopName} and <strong>reassign</strong> it to start at:
              </p>
              <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 p-2 rounded-xl border border-emerald-300 dark:border-emerald-800">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{pendingReassignment.newStopName} ({pendingReassignment.newRoute.name})</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setPendingReassignment(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReassignment}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all"
              >
                Confirm & Reassign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal: Delete / Remove Bus from Stop ──────────── */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 max-w-sm w-full rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  Remove Bus from Stop?
                </h3>
                <p className="text-xs text-gray-500">Return to fleet yard</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300">
              Are you sure you want to remove <strong>{pendingDelete.busNumber}</strong> from{" "}
              <strong>{pendingDelete.stopName}</strong>? The bus will become available in the yard.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Keep Bus
              </button>
              <button
                onClick={handleConfirmDeleteBus}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-500/20 transition-all"
              >
                Yes, Remove Bus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
