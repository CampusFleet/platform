"use client";

import React, { useState, useEffect, useMemo } from "react";
import { store } from "@/lib/store";
import {
  Users,
  BusFront,
  Search,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Award,
  ShieldCheck,
  X,
  Plus,
  RefreshCw,
  Clock,
  QrCode,
  Banknote,
  Check,
  Lock,
  Sunrise,
  Sunset,
  Building,
  Sparkles,
  ArrowRight,
  Filter,
  CheckCheck,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { formatTime, formatDate } from "@/lib/utils";
import type { Trip, Bus, Route, Staff, UserAccount, AttendanceRecord } from "@/lib/types";
import { CustomDropdown } from "@/components/common/CustomDropdown";
import {
  buildDutyBlocks,
  rotateDutyBlocks,
  autoAssignDutyBlocks,
  categorizeShifts,
  BusDutyBlock,
  ShiftSummaryOption,
} from "@/lib/duty-blocks";

interface TransportManagerCrewViewProps {
  initialTrips?: Trip[];
  initialBuses?: Bus[];
  initialRoutes?: Route[];
  initialStaff?: Staff[];
  initialUsers?: UserAccount[];
}

export default function TransportManagerCrewView({
  initialTrips = [],
  initialBuses = [],
  initialRoutes = [],
  initialStaff = [],
  initialUsers = [],
}: TransportManagerCrewViewProps) {
  const [trips, setTrips] = useState<Trip[]>(() => (initialTrips.length > 0 ? initialTrips : store.getTrips()));
  const [buses, setBuses] = useState<Bus[]>(() => (initialBuses.length > 0 ? initialBuses : store.getBuses()));
  const [routes, setRoutes] = useState<Route[]>(() => (initialRoutes.length > 0 ? initialRoutes : store.getRoutes()));
  const [staff, setStaff] = useState<Staff[]>(() => (initialStaff.length > 0 ? initialStaff : store.getStaff()));
  const [users, setUsers] = useState<UserAccount[]>(() => (initialUsers.length > 0 ? initialUsers : store.getUsers()));
  const [shifts, setShifts] = useState<any[]>(() => store.getShifts());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => store.getAttendanceRecords());

  const [activeViewMode, setActiveViewMode] = useState<"DUTY_BLOCKS" | "ROSTER" | "DUTY_LEDGER">("DUTY_BLOCKS");
  const [crewSearchQuery, setCrewSearchQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState("ALL");
  const [dutyFilter, setDutyFilter] = useState<"ALL" | "CONFLICTS" | "UNCREWED">("ALL");

  const [selectedBlockForCrew, setSelectedBlockForCrew] = useState<BusDutyBlock | null>(null);
  const [selectedTripForCrew, setSelectedTripForCrew] = useState<Trip | null>(null);
  const [crewModalOpen, setCrewModalOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedConductorId, setSelectedConductorId] = useState("");
  const [isAssigningCrew, setIsAssigningCrew] = useState(false);
  const [crewAssignError, setCrewAssignError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Operational Date
  const [crewDate, setCrewDate] = useState(() => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().split("T")[0];
  });

  // Dynamic duty blocks computed from current data
  const { dutyBlocks: computedBlocks, incomingShifts, outgoingShifts, summary } = useMemo(() => {
    return buildDutyBlocks(buses, routes, shifts, trips, staff, users, crewDate);
  }, [buses, routes, shifts, trips, staff, users, crewDate]);

  // Local editable duty blocks state (allows Transport Manager to adjust, auto-assign, or rotate before publishing)
  const [localDutyBlocks, setLocalDutyBlocks] = useState<BusDutyBlock[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPublishingRoster, setIsPublishingRoster] = useState(false);
  const [rotationStep, setRotationStep] = useState(1);

  // Sync local duty blocks when computed blocks change (unless user has active unsaved edits)
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setLocalDutyBlocks(computedBlocks);
    }
  }, [computedBlocks, hasUnsavedChanges]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setTrips(store.getTrips());
      setBuses(store.getBuses());
      setRoutes(store.getRoutes());
      setStaff(store.getStaff());
      setUsers(store.getUsers());
      setShifts(store.getShifts());
      setAttendanceRecords(store.getAttendanceRecords());
    });
    return unsub;
  }, []);

  // 1. DRIVERS: strictly users/staff where role === 'driver' (conductors cannot drive!)
  const eligibleDrivers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; phone: string; license?: string; role: string; employeeCode?: string }>();
    staff
      .filter((s) => s.role === "driver")
      .forEach((s) => {
        map.set(s.id, {
          id: s.id,
          name: s.fullName,
          phone: s.phone || "—",
          license: s.licenseNo || "HMV-COMMERCIAL",
          role: "driver",
          employeeCode: s.employeeCode,
        });
      });
    users
      .filter((u) => u.role === "driver")
      .forEach((u) => {
        if (!map.has(u.id)) {
          map.set(u.id, {
            id: u.id,
            name: u.fullName,
            phone: u.phone || "—",
            license: "HMV-COMMERCIAL",
            role: "driver",
          });
        }
      });
    return Array.from(map.values());
  }, [staff, users]);

  // 2. CONDUCTORS: BOTH conductors AND qualified drivers are eligible!
  const eligibleConductors = useMemo(() => {
    const map = new Map<string, { id: string; name: string; phone: string; role: string; isActingDriver?: boolean; employeeCode?: string }>();
    staff
      .filter((s) => s.role === "conductor")
      .forEach((s) => {
        map.set(s.id, {
          id: s.id,
          name: s.fullName,
          phone: s.phone || "—",
          role: "conductor",
          isActingDriver: false,
          employeeCode: s.employeeCode,
        });
      });
    users
      .filter((u) => u.role === "conductor")
      .forEach((u) => {
        if (!map.has(u.id)) {
          map.set(u.id, {
            id: u.id,
            name: u.fullName,
            phone: u.phone || "—",
            role: "conductor",
            isActingDriver: false,
          });
        }
      });
    staff
      .filter((s) => s.role === "driver")
      .forEach((s) => {
        if (!map.has(s.id)) {
          map.set(s.id, {
            id: s.id,
            name: `${s.fullName} (Qualified Driver)`,
            phone: s.phone || "—",
            role: "driver",
            isActingDriver: true,
            employeeCode: s.employeeCode,
          });
        }
      });
    return Array.from(map.values());
  }, [staff, users]);

  // Filtered Duty Blocks for current search & status filters
  const filteredDutyBlocks = useMemo(() => {
    return localDutyBlocks.filter((block) => {
      if (dutyFilter === "CONFLICTS" && block.dutyStatus !== "CONFLICT_MULTIPLE_OUTGOING") return false;
      if (dutyFilter === "UNCREWED" && block.driverId && block.conductorId) return false;
      if (!crewSearchQuery.trim()) return true;
      const q = crewSearchQuery.toLowerCase();
      return (
        String(block.busNumber).includes(q) ||
        block.routeName?.toLowerCase().includes(q) ||
        block.driverName?.toLowerCase().includes(q) ||
        block.conductorName?.toLowerCase().includes(q) ||
        block.outgoingShiftName?.toLowerCase().includes(q)
      );
    });
  }, [localDutyBlocks, crewSearchQuery, dutyFilter]);

  // Filtered Trips for selected date and dynamic shift (Granular View)
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (t.tripDate !== crewDate) return false;
      if (shiftFilter !== "ALL" && t.shiftId !== shiftFilter) return false;
      if (!crewSearchQuery.trim()) return true;
      const q = crewSearchQuery.toLowerCase();
      const bus = buses.find((b) => b.id === t.busId);
      const route = routes.find((r) => r.id === t.routeId);
      return (
        t.tripCode?.toLowerCase().includes(q) ||
        String(bus?.busNumber).includes(q) ||
        route?.name?.toLowerCase().includes(q)
      );
    });
  }, [trips, crewDate, crewSearchQuery, shiftFilter, buses, routes]);

  const crewDutyRecords = useMemo(() => {
    return attendanceRecords.filter(
      (a) =>
        a.userRole === "driver" ||
        a.userRole === "conductor" ||
        a.signatureToken?.startsWith("DUTY-") ||
        a.method === "BUS_QR_SCAN"
    );
  }, [attendanceRecords]);

  // Handle Dynamic Outgoing Shift selection for a single bus
  const handleSelectOutgoingShift = (busId: number, shiftId: string) => {
    const shift = outgoingShifts.find((s) => s.id === shiftId);
    if (!shift) return;

    setLocalDutyBlocks((prev) =>
      prev.map((block) => {
        if (block.busId === busId) {
          return {
            ...block,
            outgoingShiftId: shift.id,
            outgoingShiftName: shift.name,
            outgoingShiftTime: shift.startTime,
            dutyStatus: "PENDING_CONFIRMATION",
            conflictingTrips: [], // Conflict is resolved by picking this shift
          };
        }
        return block;
      })
    );
    setHasUnsavedChanges(true);
  };

  // Handle Auto-Assign Across Outgoing Shifts
  const handleAutoAssign = () => {
    const assigned = autoAssignDutyBlocks(localDutyBlocks, outgoingShifts, 0);
    setLocalDutyBlocks(assigned);
    setHasUnsavedChanges(true);
    showToast("⚡ Auto-assigned dynamic 1-Inbound + 1-Outbound duty blocks!");
  };

  // Handle Dynamic Bus Rotation
  const handleRotateRoster = () => {
    const rotated = rotateDutyBlocks(localDutyBlocks, outgoingShifts, rotationStep);
    setRotationStep((s) => s + 1);
    setLocalDutyBlocks(rotated);
    setHasUnsavedChanges(true);
    showToast("🔄 Rotated fleet outgoing shift duties across buses!");
  };

  // Confirm and Publish Duty Blocks to Supabase Database
  const handleConfirmAndPublish = async () => {
    setIsPublishingRoster(true);
    try {
      const res = await fetch("/api/dispatch/duty-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CONFIRM_ALLOCATIONS",
          targetDate: crewDate,
          dutyBlocks: localDutyBlocks,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast(
          `✓ Fleet duty allocations published! (${data.upsertedCount} active runs, ${data.removedDuplicatesCount} conflicts resolved).`
        );
        setHasUnsavedChanges(false);
        await store.syncFromSupabase();
      } else {
        showToast(data.error || "Failed to confirm allocations.");
      }
    } catch (err: any) {
      showToast("Network error: " + err.message);
    } finally {
      setIsPublishingRoster(false);
    }
  };

  const openCrewModalForBlock = (block: BusDutyBlock) => {
    setSelectedBlockForCrew(block);
    setSelectedTripForCrew(null);
    setSelectedDriverId(block.driverId || "");
    setSelectedConductorId(block.conductorId || "");
    setCrewAssignError(null);
    setCrewModalOpen(true);
  };

  const openCrewModalForTrip = (trip: Trip) => {
    setSelectedTripForCrew(trip);
    setSelectedBlockForCrew(null);
    setSelectedDriverId(trip.driverId || "");
    setSelectedConductorId(trip.conductorId || "");
    setCrewAssignError(null);
    setCrewModalOpen(true);
  };

  const handleSaveCrewAssignment = async () => {
    setIsAssigningCrew(true);
    setCrewAssignError(null);

    try {
      const payload: any = {
        driverId: selectedDriverId || null,
        conductorId: selectedConductorId || null,
      };

      if (selectedBlockForCrew) {
        payload.busId = selectedBlockForCrew.busId;
        payload.tripDate = crewDate;
        payload.applyToAllShifts = true;
      } else if (selectedTripForCrew) {
        payload.tripId = selectedTripForCrew.id;
      }

      const res = await fetch("/api/staff/assign-crew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        showToast("✓ Crew roster updated successfully!");
        setCrewModalOpen(false);

        // Update local block state immediately
        if (selectedBlockForCrew) {
          const drv = eligibleDrivers.find((d) => d.id === selectedDriverId);
          const cnd = eligibleConductors.find((c) => c.id === selectedConductorId);

          setLocalDutyBlocks((prev) =>
            prev.map((b) =>
              b.busId === selectedBlockForCrew.busId
                ? {
                    ...b,
                    driverId: selectedDriverId || undefined,
                    driverName: drv?.name,
                    driverPhone: drv?.phone,
                    driverLicense: drv?.license,
                    conductorId: selectedConductorId || undefined,
                    conductorName: cnd?.name,
                    conductorPhone: cnd?.phone,
                  }
                : b
            )
          );
        }

        store.syncFromSupabase();
      } else {
        setCrewAssignError(data.error || "Failed to update crew assignment.");
      }
    } catch (err: any) {
      setCrewAssignError("Network error: " + err.message);
    } finally {
      setIsAssigningCrew(false);
    }
  };

  // Helper for quick date shortcuts
  const setQuickDate = (offsetDays: number) => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
    setCrewDate(ist.toISOString().split("T")[0]);
    setHasUnsavedChanges(false);
  };

  const isToday = useMemo(() => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return crewDate === ist.toISOString().split("T")[0];
  }, [crewDate]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in slide-in-from-bottom-3 border border-gray-700/50">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-blue-800/40">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-mono font-bold text-blue-300 mb-2">
              <Award className="w-3.5 h-3.5" />
              <span>Dynamic Fleet Dispatch & Shift Allocation Cockpit</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Vehicle Duty Blocks & Crew Rostering
            </h2>
            <p className="text-xs sm:text-sm text-blue-200/80 max-w-2xl mt-1">
              Standard 1-Inbound + 1-Outbound Vehicle Duty Block protocol: Each physical bus operates 1 morning
              arrival shift and 1 designated departure shift. Automatic rotation balances mileage and driver duty hours.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-800/80 p-1.5 rounded-2xl border border-gray-700">
              <button
                onClick={() => setQuickDate(0)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-xl transition-all ${
                  isToday ? "bg-blue-600 text-white shadow" : "text-gray-300 hover:text-white"
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setQuickDate(1)}
                className="px-2.5 py-1 text-[11px] font-bold rounded-xl text-gray-300 hover:text-white transition-all"
              >
                Tomorrow
              </button>
              <div className="h-4 w-px bg-gray-700 mx-1" />
              <div className="flex items-center gap-1 px-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-blue-400" />
                <input
                  type="date"
                  value={crewDate}
                  onChange={(e) => {
                    setCrewDate(e.target.value);
                    setHasUnsavedChanges(false);
                  }}
                  className="text-xs px-2 py-0.5 rounded-lg bg-gray-900 border border-gray-700 text-white font-mono font-bold outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Operational KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Active Fleet */}
        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-[10px] uppercase font-black tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <BusFront className="w-3 h-3" />
            <span>Active Fleet</span>
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-gray-900 dark:text-white">
            {localDutyBlocks.length}
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">Vehicles in service</div>
        </div>

        {/* 2. Inbound Shift */}
        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-[10px] uppercase font-black tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Sunrise className="w-3 h-3" />
            <span>Inbound (AM)</span>
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-gray-900 dark:text-white">
            {localDutyBlocks.length} / {localDutyBlocks.length}
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">
            {incomingShifts[0]?.startTime || "07:15"} Morning Run
          </div>
        </div>

        {/* 3 & 4. Dynamic Outgoing Shifts Counts */}
        {outgoingShifts.map((shift, sIdx) => {
          const count = localDutyBlocks.filter((b) => b.outgoingShiftId === shift.id).length;
          const isFirst = sIdx === 0;
          return (
            <div
              key={shift.id}
              className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm"
            >
              <div
                className={`text-[10px] uppercase font-black tracking-wider flex items-center gap-1 ${
                  isFirst
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-purple-600 dark:text-purple-400"
                }`}
              >
                <Sunset className="w-3 h-3" />
                <span className="truncate">{shift.name.split(" ")[0]} ({shift.startTime})</span>
              </div>
              <div className="text-2xl font-black font-mono mt-1 text-gray-900 dark:text-white">
                {count}
              </div>
              <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
                {shift.startTime} Departure
              </div>
            </div>
          );
        })}

        {/* 5. Integrity & Conflict Monitor */}
        <div
          className={`p-4 rounded-2xl border shadow-sm ${
            summary.conflictCount > 0
              ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60"
              : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
          }`}
        >
          <div
            className={`text-[10px] uppercase font-black tracking-wider flex items-center gap-1 ${
              summary.conflictCount > 0
                ? "text-red-600 dark:text-red-400 font-black"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {summary.conflictCount > 0 ? (
              <AlertTriangle className="w-3 h-3" />
            ) : (
              <ShieldCheck className="w-3 h-3" />
            )}
            <span>Rule Integrity</span>
          </div>
          <div
            className={`text-2xl font-black font-mono mt-1 ${
              summary.conflictCount > 0
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {summary.conflictCount > 0 ? `${summary.conflictCount} Conflicts` : "100% Valid"}
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">
            {summary.conflictCount > 0 ? "Double-booked outshifts" : "1 In + 1 Out protocol"}
          </div>
        </div>

        {/* 6. Crew Readiness */}
        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-[10px] uppercase font-black tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>Fully Crewed</span>
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-teal-600 dark:text-teal-400">
            {localDutyBlocks.filter((b) => b.driverId && b.conductorId).length} / {localDutyBlocks.length}
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">Driver + Conductor Ready</div>
        </div>
      </div>

      {/* Operational Warning Banner when Conflicts Exist in Database */}
      {summary.conflictCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold">Dual Outshift Conflict Detected:</span> Several buses are currently scheduled
              for multiple overlapping outgoing shifts on this date (e.g. 13:30 AND 16:45).
              Click <strong>Auto-Assign</strong> or allocate individual buses, then click <strong>Confirm & Publish</strong> to eliminate double-booking.
            </div>
          </div>
          <button
            onClick={handleAutoAssign}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shrink-0 cursor-pointer text-xs"
          >
            ⚡ Auto-Resolve Conflicts
          </button>
        </div>
      )}

      {/* View Mode Switcher Tabs & Primary Control Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveViewMode("DUTY_BLOCKS")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeViewMode === "DUTY_BLOCKS"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "bg-white dark:bg-gray-850 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <BusFront className="w-4 h-4" />
            <span>Vehicle Duty Blocks ({localDutyBlocks.length})</span>
          </button>

          <button
            onClick={() => setActiveViewMode("ROSTER")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeViewMode === "ROSTER"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "bg-white dark:bg-gray-850 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Granular Dispatch Runs ({filteredTrips.length})</span>
          </button>

          <button
            onClick={() => setActiveViewMode("DUTY_LEDGER")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeViewMode === "DUTY_LEDGER"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "bg-white dark:bg-gray-850 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <Banknote className="w-4 h-4" />
            <span>Crew Duty Attendance & Payroll ({crewDutyRecords.length})</span>
          </button>
        </div>

        {/* Action Controls for Duty Blocks */}
        {activeViewMode === "DUTY_BLOCKS" && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoAssign}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all cursor-pointer shadow-sm"
              title="Auto-distribute buses across outgoing shifts based on student demand balance"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span>Auto-Assign</span>
            </button>

            <button
              onClick={handleRotateRoster}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all cursor-pointer shadow-sm"
              title="Rotate bus shift assignments to equalize vehicle wear and driver hours"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
              <span>Rotate Fleet</span>
            </button>

            <button
              onClick={handleConfirmAndPublish}
              disabled={isPublishingRoster}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md ${
                hasUnsavedChanges || summary.conflictCount > 0
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              <CheckCheck className="w-4 h-4" />
              <span>{isPublishingRoster ? "Publishing..." : hasUnsavedChanges ? "Confirm & Publish Changes *" : "Confirm & Publish Roster"}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── TAB 1: VEHICLE DUTY BLOCKS (PRIMARY COCKPIT) ────────────────────────── */}
      {activeViewMode === "DUTY_BLOCKS" && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <BusFront className="w-4 h-4 text-blue-600" />
                <span>Vehicle Duty Blocks Allocation Matrix</span>
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Every bus is dispatched on 1 Morning Incoming shift + 1 Designated Outgoing shift. Toggle outgoing shifts directly per bus below.
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-[11px] font-bold">
                <button
                  onClick={() => setDutyFilter("ALL")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    dutyFilter === "ALL" ? "bg-white dark:bg-gray-700 shadow-xs text-blue-600 dark:text-blue-400" : "text-gray-500"
                  }`}
                >
                  All ({localDutyBlocks.length})
                </button>
                <button
                  onClick={() => setDutyFilter("CONFLICTS")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    dutyFilter === "CONFLICTS" ? "bg-white dark:bg-gray-700 shadow-xs text-red-600 dark:text-red-400" : "text-gray-500"
                  }`}
                >
                  Conflicts ({summary.conflictCount})
                </button>
                <button
                  onClick={() => setDutyFilter("UNCREWED")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    dutyFilter === "UNCREWED" ? "bg-white dark:bg-gray-700 shadow-xs text-amber-600 dark:text-amber-400" : "text-gray-500"
                  }`}
                >
                  Uncrewed ({summary.uncrewedCount})
                </button>
              </div>

              <div className="relative flex-1 sm:w-64 sm:flex-none">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={crewSearchQuery}
                  onChange={(e) => setCrewSearchQuery(e.target.value)}
                  placeholder="Search bus, route, or crew..."
                  className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-blue-500 font-bold"
                />
              </div>
            </div>
          </div>

          {filteredDutyBlocks.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400 font-mono space-y-2">
              <BusFront className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
              <div>No vehicle duty blocks match the active filter or search query.</div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-black text-gray-400 border-b border-gray-200 dark:border-gray-800 text-[10px]">
                  <tr>
                    <th className="p-3.5">Bus & Corridor Route</th>
                    <th className="p-3.5">Incoming Shift (Home ➔ Campus)</th>
                    <th className="p-3.5">Allocated Outgoing Shift (Campus ➔ Home)</th>
                    <th className="p-3.5">Designated Driver</th>
                    <th className="p-3.5">Designated Conductor</th>
                    <th className="p-3.5 text-center">Duty Status</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredDutyBlocks.map((block) => {
                    const isFullyCrewed = Boolean(block.driverId && block.conductorId);
                    const hasConflict = block.dutyStatus === "CONFLICT_MULTIPLE_OUTGOING";

                    const driverAtt = attendanceRecords.find(
                      (a) =>
                        (a.userId === block.driverId || a.studentId === block.driverId) &&
                        (a.busId === block.busId)
                    );

                    const conductorAtt = attendanceRecords.find(
                      (a) =>
                        (a.userId === block.conductorId || a.studentId === block.conductorId) &&
                        (a.busId === block.busId)
                    );

                    return (
                      <tr
                        key={block.busId}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${
                          hasConflict ? "bg-red-50/30 dark:bg-red-950/20" : ""
                        }`}
                      >
                        {/* Bus & Corridor */}
                        <td className="p-3.5">
                          <div className="font-black text-gray-900 dark:text-white flex items-center gap-1.5 text-sm">
                            <BusFront className="w-4 h-4 text-blue-600" />
                            <span>Bus {block.busNumber}</span>
                          </div>
                          <div className="font-bold text-gray-700 dark:text-gray-300 text-[11px] mt-0.5">
                            {block.routeName}
                          </div>
                          <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                            {block.registrationNo} • {block.capacity} seats
                          </div>
                        </td>

                        {/* Incoming Shift (Morning) */}
                        <td className="p-3.5">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-bold text-[11px]">
                            <Sunrise className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{block.incomingShiftName}</span>
                            <span className="font-mono text-[10px] opacity-75">({block.incomingShiftTime})</span>
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono mt-1 flex items-center gap-1">
                            <span>Pickup: Stops ➔ Campus</span>
                          </div>
                        </td>

                        {/* Allocated Outgoing Shift (Campus -> Home) Dynamic Selector */}
                        <td className="p-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {outgoingShifts.map((shift) => {
                              const isSelected = block.outgoingShiftId === shift.id;
                              return (
                                <button
                                  key={shift.id}
                                  onClick={() => handleSelectOutgoingShift(block.busId, shift.id)}
                                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                                    isSelected
                                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                      : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                                  }`}
                                >
                                  <Sunset className={`w-3 h-3 ${isSelected ? "text-white" : "text-gray-400"}`} />
                                  <span>{shift.name.split(" ")[0]}</span>
                                  <span className="font-mono text-[10px] opacity-80">({shift.startTime})</span>
                                  {isSelected && <Check className="w-3 h-3 ml-0.5 text-white" />}
                                </button>
                              );
                            })}
                          </div>

                          {hasConflict && (
                            <div className="mt-1 text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>Dual Outshift Conflict (Select one to allocate)</span>
                            </div>
                          )}
                        </td>

                        {/* Designated Driver */}
                        <td className="p-3.5">
                          {block.driverName ? (
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white">{block.driverName}</div>
                              <div className="text-[10px] text-gray-400 font-mono">
                                {block.driverPhone || "—"} • {block.driverLicense || "HMV"}
                              </div>
                              {driverAtt ? (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>Checked-in ({formatTime(driverAtt.timestamp)})</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  <span>Pending Check-in</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-red-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Unassigned
                            </span>
                          )}
                        </td>

                        {/* Designated Conductor */}
                        <td className="p-3.5">
                          {block.conductorName ? (
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white">{block.conductorName}</div>
                              <div className="text-[10px] text-gray-400 font-mono">{block.conductorPhone || "—"}</div>
                              {conductorAtt ? (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>Checked-in ({formatTime(conductorAtt.timestamp)})</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  <span>Pending Check-in</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-yellow-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Unassigned
                            </span>
                          )}
                        </td>

                        {/* Duty Status */}
                        <td className="p-3.5 text-center">
                          {hasConflict ? (
                            <span className="inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800">
                              Conflict (Dual)
                            </span>
                          ) : (
                            <span
                              className={`inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                isFullyCrewed
                                  ? "bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300"
                                  : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                              }`}
                            >
                              {isFullyCrewed ? "1 In + 1 Out Ready" : "Crew Pending"}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => openCrewModalForBlock(block)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap"
                          >
                            {isFullyCrewed ? "Change Crew" : "Assign Crew"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: GRANULAR TRIP DISPATCH RUNS ─────────────────────────────────── */}
      {activeViewMode === "ROSTER" && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <BusFront className="w-4 h-4 text-blue-600" />
              <span>Granular Transit Runs (Trips)</span>
            </h3>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <CustomDropdown
                value={shiftFilter}
                onChange={(val) => setShiftFilter(val)}
                size="sm"
                options={[
                  { value: "ALL", label: `All Shifts (${shifts.length})` },
                  ...shifts.map((s) => ({
                    value: s.id,
                    label: `${s.name}${s.startTime ? ` (${s.startTime})` : ""}`,
                  })),
                ]}
                containerClassName="w-48"
              />
              <div className="relative flex-1 sm:w-72 sm:flex-none">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={crewSearchQuery}
                  onChange={(e) => setCrewSearchQuery(e.target.value)}
                  placeholder="Search bus or route..."
                  className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-blue-500 font-bold"
                />
              </div>
            </div>
          </div>

          {filteredTrips.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400 font-mono space-y-2">
              <Users className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
              <div>No trips found for the selected date or search query.</div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-black text-gray-400 border-b border-gray-200 dark:border-gray-800 text-[10px]">
                  <tr>
                    <th className="p-3.5">Bus & Operational Code</th>
                    <th className="p-3.5">Corridor Route & Direction</th>
                    <th className="p-3.5">Assigned Driver</th>
                    <th className="p-3.5">Assigned Conductor</th>
                    <th className="p-3.5 text-center">Crew Status</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredTrips.map((trip) => {
                    const bus = buses.find((b) => b.id === trip.busId);
                    const route = routes.find((r) => r.id === trip.routeId);
                    const driver = staff.find((s) => s.id === trip.driverId) || users.find((u) => u.id === trip.driverId);
                    const conductor = staff.find((s) => s.id === trip.conductorId) || users.find((u) => u.id === trip.conductorId);

                    const driverAtt = attendanceRecords.find(
                      (a) =>
                        (a.userId === trip.driverId || a.studentId === trip.driverId) &&
                        (a.tripId === trip.id || a.busId === trip.busId)
                    );

                    const conductorAtt = attendanceRecords.find(
                      (a) =>
                        (a.userId === trip.conductorId || a.studentId === trip.conductorId) &&
                        (a.tripId === trip.id || a.busId === trip.busId)
                    );

                    const isComplete = Boolean(trip.driverId && trip.conductorId);
                    const shift = shifts.find((s) => s.id === trip.shiftId);
                    const isOutbound = shift?.direction === "CAMPUS_TO_HOME";
                    const isC2C = shift?.direction === "CAMPUS_TO_CAMPUS";

                    return (
                      <tr key={trip.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                            <BusFront className="w-3.5 h-3.5 text-blue-600" />
                            <span>Bus {bus?.busNumber || "TBA"}</span>
                          </div>
                          <div className="text-[10px] font-mono text-gray-400">{trip.tripCode}</div>
                        </td>

                        <td className="p-3.5">
                          <div className="font-bold text-gray-800 dark:text-gray-200">{route?.name || "Route TBA"}</div>
                          <div className="text-[10px] font-mono mt-0.5">
                            <span
                              className={`inline-flex items-center gap-1 font-bold ${
                                isC2C
                                  ? "text-purple-600 dark:text-purple-400"
                                  : isOutbound
                                  ? "text-indigo-600 dark:text-indigo-400"
                                  : "text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {isC2C ? (
                                <Building className="w-3 h-3 shrink-0" />
                              ) : isOutbound ? (
                                <Sunset className="w-3 h-3 shrink-0" />
                              ) : (
                                <Sunrise className="w-3 h-3 shrink-0" />
                              )}
                              <span>{shift?.name || "Transit Run"}</span>
                              {shift?.startTime && <span className="opacity-75 font-normal">({shift.startTime})</span>}
                            </span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          {driver ? (
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white">{driver.fullName}</div>
                              <div className="text-[10px] text-gray-400 font-mono">{driver.phone || "—"}</div>
                              {driverAtt ? (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>Checked-in ({formatTime(driverAtt.timestamp)})</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  <span>Check-in Pending</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-red-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Unassigned
                            </span>
                          )}
                        </td>

                        <td className="p-3.5">
                          {conductor ? (
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white">{conductor.fullName}</div>
                              <div className="text-[10px] text-gray-400 font-mono">{conductor.phone || "—"}</div>
                              {conductorAtt ? (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>Checked-in ({formatTime(conductorAtt.timestamp)})</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  <span>Check-in Pending</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-yellow-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Unassigned
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isComplete
                                ? "bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300"
                                : "bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300"
                            }`}
                          >
                            {isComplete ? "Fully Crewed" : "Incomplete"}
                          </span>
                        </td>

                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => openCrewModalForTrip(trip)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                          >
                            {isComplete ? "Change Crew" : "Assign Crew"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: CREW DUTY ATTENDANCE & PAYROLL LEDGER ──────────────────────── */}
      {activeViewMode === "DUTY_LEDGER" && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Staff & Crew Duty Attendance Ledger</span>
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Verified duty check-ins recorded via Physical Bus QR Door Scanner or Card Selector for payroll and shift compensation auditing.
              </p>
            </div>
          </div>

          {crewDutyRecords.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400 font-mono space-y-2">
              <Clock className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
              <div>No staff duty attendance logged yet. Attendance is recorded when crew scans a bus QR or selects a bus card.</div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-black text-gray-400 border-b border-gray-200 dark:border-gray-800 text-[10px]">
                  <tr>
                    <th className="p-3.5">Crew Member</th>
                    <th className="p-3.5">Assigned Bus</th>
                    <th className="p-3.5">Trip & Corridor</th>
                    <th className="p-3.5">Verification Method</th>
                    <th className="p-3.5">Timestamp</th>
                    <th className="p-3.5">Duty Signature</th>
                    <th className="p-3.5 text-right">Payroll Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {crewDutyRecords.map((record) => {
                    const bus = buses.find((b) => b.id === record.busId);
                    const trip = trips.find((t) => t.id === record.tripId);
                    const route = routes.find((r) => r.id === trip?.routeId);

                    return (
                      <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-bold text-gray-900 dark:text-white">
                            {record.userName || record.userId || "Staff Member"}
                          </div>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider mt-0.5 ${
                              record.userRole === "driver"
                                ? "bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300"
                                : "bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300"
                            }`}
                          >
                            {record.userRole || "CREW"}
                          </span>
                        </td>

                        <td className="p-3.5">
                          <div className="font-bold text-gray-800 dark:text-gray-200">
                            {bus?.busNumber ? `Bus ${bus.busNumber}` : record.busId || "Fleet Bus"}
                          </div>
                          <div className="text-[10px] font-mono text-gray-400">
                            {bus?.registrationNo || "UK-07-FLEET"}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <div className="font-bold text-gray-800 dark:text-gray-200">
                            {trip?.tripCode || record.tripId || "General Duty"}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {route?.name || "Campus Transit Corridor"}
                          </div>
                        </td>

                        <td className="p-3.5">
                          {record.method === "BUS_QR_SCAN" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Bus Door QR Scan</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-bold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                              <span>Card Selector</span>
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 font-mono text-gray-600 dark:text-gray-300">
                          <div>{formatDate(record.timestamp)}</div>
                          <div className="text-[10px] text-gray-400">{formatTime(record.timestamp)}</div>
                        </td>

                        <td className="p-3.5 font-mono text-[10px] text-gray-500">
                          {record.signatureToken || `DUTY-${record.id.substring(0, 8)}`}
                        </td>

                        <td className="p-3.5 text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-black text-[10px]">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Qualified Duty Record</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Crew Assignment Modal */}
      {crewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h4 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>
                    {selectedBlockForCrew
                      ? `Assign Crew to Bus ${selectedBlockForCrew.busNumber}`
                      : "Assign Trip Crew"}
                  </span>
                </h4>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {selectedBlockForCrew?.routeName || selectedTripForCrew?.tripCode}
                </div>
              </div>
              <button
                onClick={() => setCrewModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {crewAssignError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                {crewAssignError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Driver Select */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  Designated Driver (Strictly Drivers Only)
                </label>
                <CustomDropdown
                  value={selectedDriverId}
                  onChange={(val) => setSelectedDriverId(val)}
                  placeholder="— Unassign Driver —"
                  options={[
                    { value: "", label: "— Unassign Driver —" },
                    ...eligibleDrivers.map((d) => ({
                      value: d.id,
                      label: `${d.name} (${d.license || "HMV"}) • ${d.phone}`,
                    })),
                  ]}
                />
              </div>

              {/* Conductor Select */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  Designated Conductor (Conductors or Qualified Drivers)
                </label>
                <CustomDropdown
                  value={selectedConductorId}
                  onChange={(val) => setSelectedConductorId(val)}
                  placeholder="— Unassign Conductor —"
                  options={[
                    { value: "", label: "— Unassign Conductor —" },
                    ...eligibleConductors.map((c) => ({
                      value: c.id,
                      label: `${c.name} • ${c.phone}`,
                    })),
                  ]}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setCrewModalOpen(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCrewAssignment}
                disabled={isAssigningCrew}
                className="px-4 py-2 text-xs font-black rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm cursor-pointer"
              >
                {isAssigningCrew ? "Saving Roster..." : "Confirm Crew Allocation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
