"use client";

import React, { useState, useEffect, useMemo } from "react";
import { store } from "@/lib/store";
import { telematicsService } from "@/lib/telematicsService";
import CampusFleetMap from "@/components/maps/CampusFleetMap";
import ConductorLiveRadarView from "@/components/conductor/ConductorLiveRadarView";
import {
  BusFront,
  Radio,
  Users,
  Compass,
  Navigation,
  Gauge,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Eye,
  Layers,
  Sparkles,
  MapPin,
  ExternalLink,
  ChevronRight,
  Shield,
  ArrowLeft,
  UserCheck,
  Building2,
  Maximize2,
  RefreshCw,
  ScanFace,
} from "lucide-react";
import type { Bus, Trip, Route, Shift, Staff, Booking, Student, Stop } from "@/lib/types";

interface LiveFleetTelematicsViewProps {
  initialBuses?: Bus[];
  initialTrips?: Trip[];
  initialRoutes?: Route[];
  initialShifts?: Shift[];
  initialStaff?: Staff[];
  initialBookings?: Booking[];
  initialStudents?: Student[];
  initialStops?: Stop[];
}

export default function LiveFleetTelematicsView({
  initialBuses = [],
  initialTrips = [],
  initialRoutes = [],
  initialShifts = [],
  initialStaff = [],
  initialBookings = [],
  initialStudents = [],
  initialStops = [],
}: LiveFleetTelematicsViewProps) {
  // ── 1. Reactive Store & Data Binding ──────────────────────────────────────
  const [buses, setBuses] = useState<Bus[]>(() =>
    initialBuses.length > 0 ? initialBuses : store.getBuses()
  );
  const [trips, setTrips] = useState<Trip[]>(() =>
    initialTrips.length > 0 ? initialTrips : store.getTrips()
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
  const [students, setStudents] = useState<Student[]>(() =>
    initialStudents.length > 0 ? initialStudents : store.getStudents()
  );
  const [stops, setStops] = useState<Stop[]>(() =>
    initialStops.length > 0 ? initialStops : store.getStops()
  );

  // Subscribe to store reactive updates
  useEffect(() => {
    const unsub = store.subscribe(() => {
      setBuses([...store.getBuses()]);
      setTrips([...store.getTrips()]);
      setRoutes([...store.getRoutes()]);
      setShifts([...store.getShifts()]);
      setStaff([...store.getStaff()]);
      setBookings([...store.getBookings()]);
      setStudents([...store.getStudents()]);
      setStops([...store.getStops()]);
    });
    return unsub;
  }, []);

  // ── 2. Local State for Fleet God-View & Shadow Conductor Mirror ────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "IN_TRANSIT" | "STANDBY" | "PARKED">("ALL");
  const [mapTheme, setMapTheme] = useState<"GOOGLE_STREETS" | "GOOGLE_HYBRID" | "CARTO_DARK">("GOOGLE_STREETS");
  const [selectedBusIdForConductorView, setSelectedBusIdForConductorView] = useState<number | null>(null);
  const [highlightedBusId, setHighlightedBusId] = useState<number | null>(null);

  // Live telematics dictionary: Map<busId, { lat, lng, speed, heading, pingAt }>
  const [liveLocations, setLiveLocations] = useState<Map<number, any>>(new Map());

  // Listen to live telematics events from driver broadcasts / GPS pings
  useEffect(() => {
    let isMounted = true;

    const handleTelematics = (incoming: any) => {
      if (!isMounted || !incoming || !incoming.busId) return;
      const busIdNum = Number(incoming.busId);
      if (!isNaN(busIdNum)) {
        setLiveLocations((prev) => {
          const next = new Map(prev);
          next.set(busIdNum, {
            latitude: Number(incoming.latitude),
            longitude: Number(incoming.longitude),
            speedKmh: Number(incoming.speedKmh || 0),
            headingDeg: Number(incoming.headingDeg || 0),
            lastPingAt: incoming.lastPingAt || new Date().toISOString(),
          });
          return next;
        });
      }
    };

    const unsub = telematicsService.subscribe(handleTelematics);

    // Initial check from store cached live location
    const cached = store.getLiveLocation();
    if (cached && cached.busId) {
      handleTelematics(cached);
    }

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // ── 3. Fleet Vehicle Roster & State Resolution ─────────────────────────────
  const fleetCardsData = useMemo(() => {
    const routeMap = new Map<string, Route>();
    routes.forEach((r) => routeMap.set(r.id, r));

    const shiftMap = new Map<string, Shift>();
    shifts.forEach((s) => shiftMap.set(s.id, s));

    const driverMap = new Map<string, Staff>();
    const conductorMap = new Map<string, Staff>();
    staff.forEach((st) => {
      if (st.role === "driver") driverMap.set(st.id, st);
      if (st.role === "conductor") conductorMap.set(st.id, st);
    });

    const activeTripsByBusId = new Map<number, Trip>();
    trips.forEach((t) => {
      if (t.status === "IN_PROGRESS" || t.status === "SCHEDULED") {
        activeTripsByBusId.set(t.busId, t);
      }
    });

    return buses.map((bus) => {
      const activeTrip = activeTripsByBusId.get(bus.id) || trips.find((t) => t.busId === bus.id) || null;
      const assignedRoute = (activeTrip?.routeId && routeMap.get(activeTrip.routeId)) || routes[0] || null;
      const assignedShift = (activeTrip?.shiftId && shiftMap.get(activeTrip.shiftId)) || shifts[0] || null;

      // Staff assignments
      const assignedDriver = activeTrip?.driverId ? driverMap.get(activeTrip.driverId) : staff.find((s) => s.role === "driver");
      const assignedConductor = activeTrip?.conductorId ? conductorMap.get(activeTrip.conductorId) : staff.find((s) => s.role === "conductor");

      // Commuter / Passenger Demand for this bus
      const busBookings = bookings.filter((b) => b.tripId === activeTrip?.id || b.busId === bus.id);
      const studentCount = busBookings.filter((b) => (b as any).passengerRole !== "teacher").length;
      const facultyCount = busBookings.filter((b) => (b as any).passengerRole === "teacher").length;
      const totalBooked = busBookings.length;
      const capacity = bus.capacity || 45;
      const occupancyPercent = Math.min(100, Math.round((totalBooked / capacity) * 100));

      // Resolve live GPS position
      const liveData = liveLocations.get(bus.id);
      const defaultOriginStop = assignedRoute?.stops?.[0]?.stop || stops[0] || null;

      // Default lat/lng coordinates fallback near origin or campus if no GPS lock yet
      const latitude = liveData?.latitude ?? (defaultOriginStop?.latitude || 29.3750 + (bus.id % 5) * 0.005);
      const longitude = liveData?.longitude ?? (defaultOriginStop?.longitude || 79.5295 + (bus.id % 5) * 0.004);
      const speedKmh = liveData?.speedKmh ?? (activeTrip?.status === "IN_PROGRESS" ? 28 : 0);
      const headingDeg = liveData?.headingDeg ?? 45;

      // Operational state
      let state: "STANDBY_STARTING_POINT" | "IN_TRANSIT" | "CAMPUS_PARKED" = "STANDBY_STARTING_POINT";
      let statusLabel = "STANDBY AT ORIGIN";
      let statusDotClass = "bg-amber-500 animate-pulse";

      if (activeTrip?.status === "IN_PROGRESS" || speedKmh > 0) {
        state = "IN_TRANSIT";
        statusLabel = "EN ROUTE • LIVE GPS";
        statusDotClass = "bg-emerald-500 animate-ping";
      } else if (activeTrip?.status === "COMPLETED") {
        state = "CAMPUS_PARKED";
        statusLabel = "TRIP COMPLETED • PARKED";
        statusDotClass = "bg-blue-500";
      }

      return {
        bus,
        activeTrip,
        assignedRoute,
        assignedShift,
        assignedDriver,
        assignedConductor,
        totalBooked,
        studentCount,
        facultyCount,
        capacity,
        occupancyPercent,
        latitude,
        longitude,
        speedKmh,
        headingDeg,
        state,
        statusLabel,
        statusDotClass,
        hasLiveGps: Boolean(liveData),
        lastPingAt: liveData?.lastPingAt || null,
      };
    });
  }, [buses, trips, routes, shifts, staff, bookings, stops, liveLocations]);

  // ── 4. Telematics Summary Metrics ─────────────────────────────────────────
  const metrics = useMemo(() => {
    const total = fleetCardsData.length;
    const inTransit = fleetCardsData.filter((f) => f.state === "IN_TRANSIT").length;
    const standby = fleetCardsData.filter((f) => f.state === "STANDBY_STARTING_POINT").length;
    const completed = fleetCardsData.filter((f) => f.state === "CAMPUS_PARKED").length;
    const totalPassengers = fleetCardsData.reduce((acc, f) => acc + f.totalBooked, 0);

    return { total, inTransit, standby, completed, totalPassengers };
  }, [fleetCardsData]);

  // Filtered bus cards
  const filteredBuses = useMemo(() => {
    return fleetCardsData.filter((item) => {
      // Status filter
      if (statusFilter === "IN_TRANSIT" && item.state !== "IN_TRANSIT") return false;
      if (statusFilter === "STANDBY" && item.state !== "STANDBY_STARTING_POINT") return false;
      if (statusFilter === "PARKED" && item.state !== "CAMPUS_PARKED") return false;

      // Text search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const busNum = String(item.bus.busNumber).toLowerCase();
      const reg = String(item.bus.registrationNo || "").toLowerCase();
      const routeName = String(item.assignedRoute?.name || "").toLowerCase();
      const driver = String(item.assignedDriver?.fullName || "").toLowerCase();
      const conductor = String(item.assignedConductor?.fullName || "").toLowerCase();

      return (
        busNum.includes(q) ||
        reg.includes(q) ||
        routeName.includes(q) ||
        driver.includes(q) ||
        conductor.includes(q)
      );
    });
  }, [fleetCardsData, statusFilter, searchQuery]);

  // ── 5. Clean Fleet Multi-Bus Map Payload (Strictly NO route paths) ────────
  const fleetMapBuses = useMemo(() => {
    return fleetCardsData.map((f) => ({
      busId: f.bus.id,
      busNumber: Number(f.bus.busNumber) || f.bus.id,
      registrationNo: f.bus.registrationNo || "UK-TRANSIT",
      shortLabel: `${f.bus.busNumber}`,
      latitude: f.latitude,
      longitude: f.longitude,
      speedKmh: f.speedKmh,
      headingDeg: f.headingDeg,
      state: f.state,
      tripStatus: f.activeTrip?.status || "IN_PROGRESS",
      routeName: f.assignedRoute?.name || "Transit Corridor",
      statusText: `${f.speedKmh} km/h • ${f.statusLabel}`,
      departureTime: f.assignedShift?.startTime || "07:30 AM",
      driverName: f.assignedDriver?.fullName || "Driver",
      conductorName: f.assignedConductor?.fullName || "Conductor",
    }));
  }, [fleetCardsData]);

  // Selected bus resolved for shadow conductor mirroring
  const selectedBusDetails = useMemo(() => {
    if (!selectedBusIdForConductorView) return null;
    return fleetCardsData.find((f) => f.bus.id === selectedBusIdForConductorView) || null;
  }, [selectedBusIdForConductorView, fleetCardsData]);

  // ── 6. RENDER CONSOLE MIRROR (When Conductor Perspective is Active) ────────
  if (selectedBusDetails) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-black text-zinc-900 dark:text-white overflow-hidden animate-in fade-in duration-200">
        <ConductorLiveRadarView
          bus={selectedBusDetails.bus}
          activeTrip={selectedBusDetails.activeTrip}
          route={selectedBusDetails.assignedRoute}
          shift={selectedBusDetails.assignedShift}
          allTrips={trips}
          allBuses={buses}
          allRoutes={routes}
          allStops={stops}
          bookings={bookings}
          students={students}
          tripBookings={bookings.filter((b) => b.busId === selectedBusDetails.bus.id)}
          initialUser={{ role: "transport_manager", name: "Transport Dispatch Desk" }}
          backLabel="← Back to Fleet God-View"
          onClose={() => setSelectedBusIdForConductorView(null)}
        />
      </div>
    );
  }

  // ── 7. RENDER MAIN FLEET TELEMATICS GOD-VIEW & ROSTER ──────────────────────
  return (
    <div className="space-y-6 pb-12 select-none">
      {/* ── MACRO KPI STATS RIBBON ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Fleet */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Total Fleet Assets
            </div>
            <div className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white mt-1">
              {metrics.total} <span className="text-xs font-semibold text-zinc-400">Buses</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
            <BusFront className="w-6 h-6" />
          </div>
        </div>

        {/* En Route (Active Live Telematics) */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-black border border-emerald-500/40 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>In Transit Now</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {metrics.inTransit} <span className="text-xs font-semibold text-emerald-700/60 dark:text-emerald-400/60">Live</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
        </div>

        {/* Standby / Origin */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Standby at Origin
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {metrics.standby} <span className="text-xs font-semibold text-zinc-400">Scheduled</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Active Commuters */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Commuters In Service
            </div>
            <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {metrics.totalPassengers} <span className="text-xs font-semibold text-zinc-400">Pax</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Users className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ── 1. ALL BUS LIVE LOCATION CARD (GOD-VIEW TELEMATICS MAP) ────────── */}
      <section className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
        {/* Map Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>ALL BUS LIVE LOCATION</span>
              </span>
              <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400">
                Bird&apos;s Eye Telematics
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white mt-1">
              Multi-Asset Fleet Live Radar
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Strictly uncluttered overview showing all active bus coordinates across campus corridors without route path lines.
            </p>
          </div>

          {/* Quick Map Tile Style Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setMapTheme((prev) =>
                  prev === "GOOGLE_STREETS"
                    ? "GOOGLE_HYBRID"
                    : prev === "GOOGLE_HYBRID"
                    ? "CARTO_DARK"
                    : "GOOGLE_STREETS"
                );
              }}
              className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Cycle Map Style"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>
                {mapTheme === "GOOGLE_STREETS" ? "Google Streets" : mapTheme === "GOOGLE_HYBRID" ? "Satellite Hybrid" : "Dark Minimal"}
              </span>
            </button>
          </div>
        </div>

        {/* Clean God-View Map Canvas */}
        <div className="relative w-full h-[400px] sm:h-[480px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-inner">
          <CampusFleetMap
            fleetBuses={fleetMapBuses}
            focusedBusId={highlightedBusId || undefined}
            routeCoordinates={[]} // Strictly no route lines on god-view
            stops={[]} // Strictly no stops clutter on god-view
            tileTheme={mapTheme}
            height="100%"
            zoom={13}
            showUserLocation={false}
            showCampusLandmark={true}
            onBusClick={(busMarker) => {
              setHighlightedBusId(busMarker.busId);
              // Open Conductor View directly on bus icon tap
              setSelectedBusIdForConductorView(busMarker.busId);
            }}
          />

          {/* Floating Instructions Helper */}
          <div className="absolute bottom-3 left-3 z-20 pointer-events-none">
            <div className="px-3 py-1.5 rounded-xl bg-white/95 dark:bg-black/95 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 text-[11px] font-bold shadow-lg flex items-center gap-2 backdrop-blur-md">
              <Eye className="w-3.5 h-3.5 text-blue-500" />
              <span>Click any bus marker to mirror conductor view</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. ALL BUS CARDS (DISPATCH ROSTER GRID) ─────────────────────────── */}
      <section className="space-y-4">
        {/* Search & Status Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-zinc-900 dark:text-white">
              Fleet Vehicle Cards ({filteredBuses.length})
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Click any card to inspect the real-time conductor radar and passenger manifest for that run.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bus, route, or driver..."
                className="w-full sm:w-64 pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 shadow-xs"
              />
            </div>

            {/* Status Filter Buttons */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "ALL"
                    ? "bg-white dark:bg-black text-zinc-900 dark:text-white shadow-xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                All ({metrics.total})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("IN_TRANSIT")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "IN_TRANSIT"
                    ? "bg-white dark:bg-black text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                In Transit ({metrics.inTransit})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("STANDBY")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "STANDBY"
                    ? "bg-white dark:bg-black text-amber-600 dark:text-amber-400 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                Standby ({metrics.standby})
              </button>
            </div>
          </div>
        </div>

        {/* Bus Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBuses.map((item) => {
            const isHighlighted = highlightedBusId === item.bus.id;

            return (
              <div
                key={item.bus.id}
                onClick={() => {
                  setHighlightedBusId(item.bus.id);
                  setSelectedBusIdForConductorView(item.bus.id);
                }}
                className={`group p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                  isHighlighted
                    ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-500 shadow-lg ring-2 ring-blue-500/30"
                    : "bg-white dark:bg-black border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 shadow-sm hover:shadow-md"
                }`}
              >
                {/* Card Top: Bus ID & Status Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                      <BusFront className="w-6 h-6 text-zinc-900 dark:text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-black text-zinc-900 dark:text-white">
                          Bus {item.bus.busNumber}
                        </h4>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          {item.bus.registrationNo || "UK-04-TRANSIT"}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[200px] mt-0.5">
                        {item.assignedRoute?.name || "Corridor Line"}
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="text-right shrink-0">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${
                        item.state === "IN_TRANSIT"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-mono"
                          : item.state === "CAMPUS_PARKED"
                          ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 font-mono"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-mono"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${item.statusDotClass}`} />
                      <span>{item.state === "IN_TRANSIT" ? "EN ROUTE" : item.state === "CAMPUS_PARKED" ? "PARKED" : "STANDBY"}</span>
                    </span>
                  </div>
                </div>

                {/* Card Middle: Telemetry Cluster & Crew Assignment */}
                <div className="space-y-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                  {/* Crew Pair */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase">Driver</div>
                      <div className="font-bold text-zinc-800 dark:text-zinc-200 truncate mt-0.5">
                        {item.assignedDriver?.fullName || "Assigned Driver"}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase">Conductor</div>
                      <div className="font-bold text-zinc-800 dark:text-zinc-200 truncate mt-0.5">
                        {item.assignedConductor?.fullName || "Assigned Conductor"}
                      </div>
                    </div>
                  </div>

                  {/* Telemetry Metrics: Speed, GPS freshness, and Corridor direction */}
                  <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">{item.speedKmh} km/h</span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px]">
                      <Compass className="w-3.5 h-3.5 text-blue-500" />
                      <span>{item.assignedShift?.name || "Morning Shift"}</span>
                    </div>

                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      {item.hasLiveGps ? "● Live GPS" : "● Telematics Ready"}
                    </div>
                  </div>

                  {/* Commuter Occupancy & APC Density */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1">
                        <ScanFace className="w-3 h-3 text-emerald-500" />
                        <span>Face ID Gate APC</span>
                      </span>
                      <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                        {item.totalBooked} / {item.capacity} ({item.occupancyPercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          item.occupancyPercent >= 90
                            ? "bg-rose-500"
                            : item.occupancyPercent >= 70
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${item.occupancyPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                      <span>🎓 {item.studentCount} Students{item.facultyCount > 0 ? ` • 👨‍🏫 ${item.facultyCount} Faculty` : ""}</span>
                      <span className={`font-bold ${
                        item.occupancyPercent >= 90
                          ? "text-rose-500"
                          : item.occupancyPercent >= 70
                          ? "text-amber-500"
                          : "text-emerald-500"
                      }`}>
                        {item.occupancyPercent >= 90 ? "Critical" : item.occupancyPercent >= 70 ? "High Load" : "Normal"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom: Primary Action Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHighlightedBusId(item.bus.id);
                      setSelectedBusIdForConductorView(item.bus.id);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md group-hover:bg-blue-600 dark:group-hover:bg-blue-500 dark:group-hover:text-white"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Inspect Conductor Live View</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
