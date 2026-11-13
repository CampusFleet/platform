"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import {
  Clock,
  Sparkles,
  Home,
  Building2,
  Shuffle,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Navigation,
  ArrowRight,
  ShieldCheck,
  Search,
  Check,
  X,
  AlertCircle,
  GraduationCap,
  Calendar,
  Layers
} from "lucide-react";
import type { Shift, Trip, Route, Bus, Staff, TripDirection, ShiftType } from "@/lib/types";

export interface TransportAdminShiftsProps {
  initialShifts?: Shift[];
  initialTrips?: Trip[];
  initialRoutes?: Route[];
  initialBuses?: Bus[];
  initialStaff?: Staff[];
}

const SHIFT_TYPES: ShiftType[] = ["MORNING", "AFTERNOON", "EVENING", "NIGHT", "SPECIAL"];

const TIME_PRESETS: Record<TripDirection, string[]> = {
  HOME_TO_CAMPUS: ["06:45", "07:00", "07:20", "07:45", "08:15", "09:00"],
  CAMPUS_TO_HOME: ["13:30", "15:00", "16:15", "17:00", "17:45", "18:30"],
  CAMPUS_TO_CAMPUS: ["09:00", "11:30", "13:45", "15:30", "17:15"],
};

export default function TransportAdminShiftsView({
  initialShifts = [],
  initialTrips = [],
  initialRoutes = [],
  initialBuses = [],
  initialStaff = [],
}: TransportAdminShiftsProps = {}) {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>(() => (initialShifts.length > 0 ? initialShifts : store.getShifts()));
  const [trips, setTrips] = useState<Trip[]>(() => (initialTrips.length > 0 ? initialTrips : store.getTrips()));
  const [routes, setRoutes] = useState<Route[]>(() => (initialRoutes.length > 0 ? initialRoutes : store.getRoutes()));
  const [buses, setBuses] = useState<Bus[]>(() => (initialBuses.length > 0 ? initialBuses : store.getBuses()));

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDirectionFilter, setSelectedDirectionFilter] = useState<"ALL" | TripDirection>("ALL");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"ALL" | string>("ALL");

  const [isEditingFormOpen, setIsEditingFormOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Partial<Shift> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setShifts(store.getShifts());
      setTrips(store.getTrips());
      setRoutes(store.getRoutes());
      setBuses(store.getBuses());
    });
    return unsub;
  }, []);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  // Compute Active Trips per Shift
  const shiftTripsCountMap = useMemo(() => {
    const map = new Map<string, number>();
    trips.forEach((t) => {
      if (t.shiftId) {
        map.set(t.shiftId, (map.get(t.shiftId) || 0) + 1);
      }
    });
    return map;
  }, [trips]);

  // Shift Statistics
  const stats = useMemo(() => {
    const total = shifts.length;
    const morning = shifts.filter((s) => s.direction === "HOME_TO_CAMPUS" || s.shiftType === "MORNING").length;
    const evening = shifts.filter((s) => s.direction === "CAMPUS_TO_HOME" || s.shiftType === "EVENING").length;
    const special = shifts.filter((s) => s.isSpecial || s.direction === "CAMPUS_TO_CAMPUS").length;
    return { total, morning, evening, special };
  }, [shifts]);

  // Filtered Shifts
  const filteredShifts = useMemo(() => {
    return shifts.filter((sh) => {
      if (selectedDirectionFilter !== "ALL" && sh.direction !== selectedDirectionFilter) return false;
      if (selectedTypeFilter !== "ALL" && sh.shiftType !== selectedTypeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          sh.name.toLowerCase().includes(q) ||
          sh.shiftType.toLowerCase().includes(q) ||
          sh.startTime.includes(q) ||
          sh.endTime.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [shifts, selectedDirectionFilter, selectedTypeFilter, searchQuery]);

  const handleOpenNewForm = () => {
    setEditingShift({
      name: "",
      shiftType: "MORNING",
      direction: "HOME_TO_CAMPUS",
      startTime: "07:30",
      endTime: "08:45",
      bookingCutoffMins: 30,
      isSpecial: false,
    });
    setIsEditingFormOpen(true);
  };

  const handleOpenEditForm = (shift: Shift) => {
    setEditingShift({ ...shift });
    setIsEditingFormOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift?.name?.trim()) {
      alert("Shift Name is required.");
      return;
    }
    setIsSaving(true);
    try {
      if (editingShift.id) {
        await store.updateShift(editingShift.id, editingShift);
        showToast(`✓ Shift "${editingShift.name}" updated successfully.`);
      } else {
        await store.createShift({
          name: editingShift.name.trim(),
          shiftType: editingShift.shiftType || "MORNING",
          direction: editingShift.direction || "HOME_TO_CAMPUS",
          startTime: editingShift.startTime || "07:30",
          endTime: editingShift.endTime || "08:45",
          bookingCutoffMins: Number(editingShift.bookingCutoffMins) || 30,
          isSpecial: Boolean(editingShift.isSpecial),
        });
        showToast(`✓ New shift "${editingShift.name}" created successfully.`);
      }
      setShifts([...store.getShifts()]);
      setIsEditingFormOpen(false);
      setEditingShift(null);
    } catch (err: any) {
      alert("Error saving shift: " + (err.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteShift = async (shift: Shift) => {
    const assignedCount = shiftTripsCountMap.get(shift.id) || 0;
    const confirmMsg = assignedCount > 0
      ? `Shift "${shift.name}" currently has ${assignedCount} active dispatched trip(s). Are you sure you want to permanently delete this shift?`
      : `Are you sure you want to delete shift "${shift.name}"?`;

    if (!confirm(confirmMsg)) return;

    try {
      await store.deleteShift(shift.id);
      setShifts([...store.getShifts()]);
      showToast(`✓ Shift "${shift.name}" removed from database.`);
    } catch (err: any) {
      alert("Failed to delete shift: " + (err.message || "Unknown error"));
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in pb-16">
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700 flex items-center gap-2.5 text-xs font-bold animate-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Top Header & Fast Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  Transit Shift Master
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  {shifts.length} Configured
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Manage temporal operating schedules, departure windows, and commuter booking cutoff policies.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/transport-admin/trips"
            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-2xl flex items-center gap-2 shadow-xs transition-all"
          >
            <Navigation className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Go to Trips & Dispatches →</span>
          </Link>
          <button
            onClick={handleOpenNewForm}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-2xl flex items-center gap-2 shadow-lg shadow-blue-600/25 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create Shift</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Shifts</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{stats.total}</div>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Home className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Home → Campus</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{stats.morning}</div>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Campus → Home</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{stats.evening}</div>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Shuffle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Inter-Campus & Special</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{stats.special}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 sm:p-5 border border-gray-200/80 dark:border-gray-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Direction Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedDirectionFilter("ALL")}
              className={`px-3.5 py-2 text-xs font-black rounded-2xl transition-all cursor-pointer ${
                selectedDirectionFilter === "ALL"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xs"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              All Shifts ({shifts.length})
            </button>
            <button
              onClick={() => setSelectedDirectionFilter("HOME_TO_CAMPUS")}
              className={`px-3.5 py-2 text-xs font-black rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedDirectionFilter === "HOME_TO_CAMPUS"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900"
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Inbound (Home → Campus)</span>
            </button>
            <button
              onClick={() => setSelectedDirectionFilter("CAMPUS_TO_HOME")}
              className={`px-3.5 py-2 text-xs font-black rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedDirectionFilter === "CAMPUS_TO_HOME"
                  ? "bg-pink-600 text-white shadow-xs"
                  : "bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Outbound (Campus → Home)</span>
            </button>
            <button
              onClick={() => setSelectedDirectionFilter("CAMPUS_TO_CAMPUS")}
              className={`px-3.5 py-2 text-xs font-black rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedDirectionFilter === "CAMPUS_TO_CAMPUS"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900"
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Campus ⇄ Campus</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shifts by name or time..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-blue-500 font-bold"
            />
          </div>
        </div>
      </div>

      {/* Shifts Card Grid */}
      {filteredShifts.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-12 text-center border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 mx-auto flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-gray-900 dark:text-white">No Transit Shifts Found</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            No shifts match your search or direction filter. Create a new shift to schedule departures.
          </p>
          <button
            onClick={handleOpenNewForm}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-2xl shadow-md transition-all cursor-pointer"
          >
            + Create New Shift
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredShifts.map((sh) => {
            const assignedTrips = shiftTripsCountMap.get(sh.id) || 0;
            const dir = sh.direction || "HOME_TO_CAMPUS";
            const dirColor =
              dir === "HOME_TO_CAMPUS"
                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                : dir === "CAMPUS_TO_HOME"
                ? "bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800"
                : "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800";

            return (
              <div
                key={sh.id}
                className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-blue-400 dark:hover:border-blue-600 transition-all duration-300 flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${dirColor}`}
                    >
                      {dir === "HOME_TO_CAMPUS" && <Home className="w-3 h-3" />}
                      {dir === "CAMPUS_TO_HOME" && <Building2 className="w-3 h-3" />}
                      {dir === "CAMPUS_TO_CAMPUS" && <Shuffle className="w-3 h-3" />}
                      <span>
                        {dir === "HOME_TO_CAMPUS"
                          ? "Home → Campus"
                          : dir === "CAMPUS_TO_HOME"
                          ? "Campus → Home"
                          : "Campus ⇄ Campus"}
                      </span>
                    </span>

                    <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      {sh.shiftType}
                    </span>
                  </div>

                  {/* Shift Title & Special Pill */}
                  <div>
                    <h3 className="text-lg font-black text-gray-900 dark:text-white leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {sh.name}
                    </h3>
                    {sh.isSpecial && (
                      <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border border-yellow-300/60 dark:border-yellow-700/60">
                        <GraduationCap className="w-3 h-3" />
                        <span>Special / Restricted Facility</span>
                      </span>
                    )}
                  </div>

                  {/* Operating Window */}
                  <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Departure Window
                    </div>
                    <div className="flex items-center gap-2 text-base font-black font-mono text-gray-900 dark:text-white">
                      <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>{formatTime(sh.startTime)}</span>
                      <span className="text-gray-400 font-normal">→</span>
                      <span>{formatTime(sh.endTime)}</span>
                    </div>
                  </div>

                  {/* Cutoff & Dispatches Meta */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                      <div className="text-[10px] uppercase font-bold text-gray-400">Booking Cutoff</div>
                      <div className="font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                        {sh.bookingCutoffMins} mins prior
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                      <div className="text-[10px] uppercase font-bold text-gray-400">Active Dispatches</div>
                      <div className="font-bold text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                        <span>{assignedTrips} Trips</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
                  <Link
                    href={`/transport-admin/trips?shiftId=${encodeURIComponent(sh.id)}`}
                    className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-black rounded-xl text-center transition-all flex items-center justify-center gap-1.5"
                    title="View and schedule trips for this shift"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Deploy Trip</span>
                  </Link>

                  <button
                    onClick={() => handleOpenEditForm(sh)}
                    className="p-2 rounded-xl text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-800 transition-all cursor-pointer"
                    title="Edit Shift"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteShift(sh)}
                    className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 transition-all cursor-pointer"
                    title="Delete Shift"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT SHIFT MODAL */}
      {isEditingFormOpen && editingShift && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <form
            onSubmit={handleSaveShift}
            className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 space-y-5 text-gray-900 dark:text-white shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg">
                    {editingShift.id ? `Edit Shift: ${editingShift.name}` : "Create New Transit Shift"}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Define operational window and commuter reservation thresholds.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsEditingFormOpen(false);
                  setEditingShift(null);
                }}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Field: Shift Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                1. Shift Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Morning Inbound Peak (Pick-Up)"
                value={editingShift.name || ""}
                onChange={(e) => setEditingShift((prev) => ({ ...(prev || {}), name: e.target.value }))}
                className="w-full p-3 text-xs font-bold rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 outline-none focus:border-blue-500"
              />
            </div>

            {/* Direction Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                2. Transit Direction Corridor *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  { id: "HOME_TO_CAMPUS", label: "Home → Campus", icon: Home, desc: "Morning Pick-Up" },
                  { id: "CAMPUS_TO_HOME", label: "Campus → Home", icon: Building2, desc: "Evening Return" },
                  { id: "CAMPUS_TO_CAMPUS", label: "Campus ⇄ Campus", icon: Shuffle, desc: "Inter-Campus / Special" },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = editingShift.direction === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setEditingShift((prev) => ({
                          ...(prev || {}),
                          direction: item.id as TripDirection,
                          shiftType:
                            item.id === "HOME_TO_CAMPUS"
                              ? "MORNING"
                              : item.id === "CAMPUS_TO_HOME"
                              ? "EVENING"
                              : "SPECIAL",
                        }))
                      }
                      className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20"
                          : "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">{item.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Shift Type Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                3. Shift Category Tag
              </label>
              <div className="flex flex-wrap gap-2">
                {SHIFT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEditingShift((prev) => ({ ...(prev || {}), shiftType: type }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      editingShift.shiftType === type
                        ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Start and End Times with Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  4. Departure Window Time *
                </label>
                <span className="text-[10px] text-gray-400">
                  Quick Presets:{" "}
                  {TIME_PRESETS[editingShift.direction || "HOME_TO_CAMPUS"]?.slice(0, 4).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setEditingShift((prev) => ({
                          ...(prev || {}),
                          startTime: preset,
                          endTime: `${(parseInt(preset.split(":")[0]) + 1).toString().padStart(2, "0")}:${preset.split(":")[1]}`,
                        }))
                      }
                      className="ml-1 text-blue-600 hover:underline font-mono font-bold"
                    >
                      {preset}
                    </button>
                  ))}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400">Start Time</span>
                  <input
                    type="time"
                    required
                    value={editingShift.startTime || "07:30"}
                    onChange={(e) => setEditingShift((prev) => ({ ...(prev || {}), startTime: e.target.value }))}
                    className="w-full p-2.5 text-xs font-mono font-bold rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400">End Time</span>
                  <input
                    type="time"
                    required
                    value={editingShift.endTime || "08:45"}
                    onChange={(e) => setEditingShift((prev) => ({ ...(prev || {}), endTime: e.target.value }))}
                    className="w-full p-2.5 text-xs font-mono font-bold rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Cutoff & Special Switch */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-800 dark:text-gray-200">
                    Final Boarding Chart
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Minutes before departure when the chart is locked. Unconfirmed seats (students absent on the morning bus) are released then.
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="5"
                    max="240"
                    value={editingShift.bookingCutoffMins ?? 30}
                    onChange={(e) =>
                      setEditingShift((prev) => ({ ...(prev || {}), bookingCutoffMins: Number(e.target.value) }))
                    }
                    className="w-16 p-2 text-center text-xs font-mono font-black rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                  />
                  <span className="text-xs text-gray-500 font-bold">mins</span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-yellow-600" />
                    <span>Special / Restricted Facility</span>
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Only students explicitly allocated by admin can view and book this shift.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={Boolean(editingShift.isSpecial)}
                  onChange={(e) => setEditingShift((prev) => ({ ...(prev || {}), isSpecial: e.target.checked }))}
                  className="w-5 h-5 rounded text-blue-600"
                />
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => {
                  setIsEditingFormOpen(false);
                  setEditingShift(null);
                }}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-2xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !editingShift.name}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSaving ? (
                  <span>Saving Shift...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>{editingShift.id ? "Update Shift" : "Save New Shift"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
