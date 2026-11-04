"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Armchair,
  Sparkles,
  Users,
  Compass,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Info,
  Shield,
  Zap,
  UserCheck,
  UserPlus,
  ArrowRight,
  Bus,
} from "lucide-react";
import type { SeatRowPreference, SeatPositionPreference } from "@/lib/types";

export interface CommuterSeatPreferencesCardProps {
  studentId: string;
  activeReservation?: {
    id?: string;
    chosen_seat?: string | null;
    auto_assigned_seat?: string | null;
    bus_id?: string;
    bus_number?: string;
    status?: string;
  } | null;
  onPreferencesUpdated?: () => void;
  showToast: (type: "success" | "error" | "warning" | "info", message: string, title?: string) => void;
}

export function CommuterSeatPreferencesCard({
  studentId,
  activeReservation,
  onPreferencesUpdated,
  showToast,
}: CommuterSeatPreferencesCardProps) {
  // Seat preferences state
  const [rowPreference, setRowPreference] = useState<SeatRowPreference>("MIDDLE");
  const [positionPreference, setPositionPreference] = useState<SeatPositionPreference>("WINDOW");
  const [partnerStudentId, setPartnerStudentId] = useState("");
  const [partnerName, setPartnerName] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hoveredSeat, setHoveredSeat] = useState<string | null>(null);
  const [partnerRequestStatus, setPartnerRequestStatus] = useState<string | null>(null);
  const [activeAllocatedSeat, setActiveAllocatedSeat] = useState<string | null>(
    activeReservation?.chosen_seat || activeReservation?.auto_assigned_seat || null
  );

  // Fetch initial preferences from backend
  useEffect(() => {
    if (!studentId) return;

    let isMounted = true;
    setIsLoading(true);

    fetch(`/api/students/seat-preferences?studentId=${studentId}`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (data.success && data.preferences) {
          if (data.preferences.rowPreference) setRowPreference(data.preferences.rowPreference);
          if (data.preferences.positionPreference) setPositionPreference(data.preferences.positionPreference);
          if (data.preferences.partnerStudentId) setPartnerStudentId(data.preferences.partnerStudentId);
          if (data.preferences.partnerName) setPartnerName(data.preferences.partnerName);
        }
      })
      .catch(err => console.warn("Failed to load seat preferences:", err))
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // Check companion partner status
    fetch(`/api/students/seat-partner-requests?studentId=${studentId}`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (data.success) {
          if (data.activePartnership) {
            setPartnerRequestStatus("ACCEPTED");
            const otherName = data.activePartnership.senderId === studentId 
              ? data.activePartnership.receiverName 
              : data.activePartnership.senderName;
            if (otherName) setPartnerName(otherName);
          } else if (data.outgoingRequests?.length > 0) {
            setPartnerRequestStatus("PENDING");
            setPartnerName(data.outgoingRequests[0].receiverName || "Classmate");
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [studentId]);

  // Sync active reservation seat when prop changes
  useEffect(() => {
    if (activeReservation) {
      setActiveAllocatedSeat(activeReservation.chosen_seat || activeReservation.auto_assigned_seat || null);
    }
  }, [activeReservation]);

  // Save preferences action
  const handleSavePreferences = async () => {
    if (!studentId) {
      showToast("error", "Student profile not identified.", "Save Error");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/students/seat-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          rowPreference,
          positionPreference,
          partnerStudentId: partnerStudentId.trim() || null,
          partnerName: partnerName.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save seat preferences");
      }

      if (data.autoAssignedSeat) {
        setActiveAllocatedSeat(data.autoAssignedSeat);
      }

      showToast(
        "success",
        data.autoAssignedSeat
          ? `Seat preferences saved! Reallocated to Seat ${data.autoAssignedSeat} on today's run.`
          : "Seat preferences saved! Your preference will be prioritized on next bus dispatch.",
        "Preferences Synchronized"
      );

      if (onPreferencesUpdated) onPreferencesUpdated();
    } catch (err: any) {
      showToast("error", err.message || "Could not save seat preferences.", "Save Failed");
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to determine if a seat matches user's current criteria
  const isSeatPreferred = (row: number, col: string) => {
    // Row match
    let rowMatch = true;
    if (rowPreference === "FRONT") rowMatch = row >= 1 && row <= 4;
    else if (rowPreference === "MIDDLE") rowMatch = row >= 5 && row <= 9;
    else if (rowPreference === "BACK") rowMatch = row >= 10 && row <= 13;

    // Position match
    let posMatch = true;
    if (positionPreference === "WINDOW") posMatch = col === "A" || col === "D" || (row === 13 && (col === "A" || col === "E"));
    else if (positionPreference === "AISLE") posMatch = col === "B" || col === "C";

    return rowMatch && posMatch;
  };

  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-none shadow-xs space-y-6">
      {/* Header with Title and Bus Seat Icon */}
      <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Seat Selection & Coach Preferences
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 uppercase bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300 border border-green-300 dark:border-green-800">
              Railway PNR Engine
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Specify your preferred coach zone and window/aisle positioning. Our algorithmic engine prioritizes your preference on every campus shuttle run.
          </p>
        </div>
        <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-none text-green-600 dark:text-green-400 shrink-0">
          <Armchair className="w-5 h-5" />
        </div>
      </div>

      <div className="p-6 pt-0 space-y-6">
        {/* Active Allocated Seat Banner (If already reserved for today) */}
        {activeAllocatedSeat && (
          <div className="p-4 border border-green-200 dark:border-green-800/80 bg-green-50/50 dark:bg-green-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 text-white font-mono font-bold text-base flex items-center justify-center border border-green-700 shadow-xs shrink-0">
                {activeAllocatedSeat}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Today&apos;s Locked Seat: Seat {activeAllocatedSeat}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 font-bold uppercase bg-green-600 text-white">
                    Active Pass
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Confirmed on active campus transit shuttle. Digital cryptographic QR pass is synced.
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right text-xs">
              <span className="text-gray-500 font-mono">Algorithm Match</span>
              <p className="text-green-700 dark:text-green-300 font-semibold font-mono">
                {rowPreference} • {positionPreference}
              </p>
            </div>
          </div>
        )}

        {/* Coach Row Zone Selection Cards (Front, Middle, Back, Any) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-gray-400" />
              <span>1. Coach Row Zone Preference</span>
            </label>
            <span className="text-[11px] text-gray-400 font-mono">Chassis Ride Dynamics</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Front Rows */}
            <div
              onClick={() => setRowPreference("FRONT")}
              className={`p-3.5 border cursor-pointer transition-all flex flex-col justify-between ${
                rowPreference === "FRONT"
                  ? "border-green-600 bg-green-50/40 dark:bg-green-950/30 ring-1 ring-green-600"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-950 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-green-600" />
                    Front Rows (1–4)
                  </span>
                  {rowPreference === "FRONT" && <Check className="w-4 h-4 text-green-600" />}
                </div>
                <span className="inline-block text-[10px] px-1.5 py-0.5 font-bold uppercase bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300">
                  Quick Egress & Low Motion
                </span>
                <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                  Nearest to driver and entry doors. Recommended for commuters prone to motion sickness and those desiring rapid disembarkation.
                </p>
              </div>
            </div>

            {/* Middle Rows (Recommended) */}
            <div
              onClick={() => setRowPreference("MIDDLE")}
              className={`p-3.5 border cursor-pointer transition-all flex flex-col justify-between relative ${
                rowPreference === "MIDDLE"
                  ? "border-green-600 bg-green-50/40 dark:bg-green-950/30 ring-1 ring-green-600"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-950 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-green-600" />
                    Mid-Coach (5–9)
                  </span>
                  {rowPreference === "MIDDLE" && <Check className="w-4 h-4 text-green-600" />}
                </div>
                <span className="inline-block text-[10px] px-1.5 py-0.5 font-bold uppercase bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700">
                  Smoothest Ride • Recommended
                </span>
                <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                  Centered between vehicle wheel axles. Minimal chassis vibration, lowest engine noise, and maximum ride stability on highway transit.
                </p>
              </div>
            </div>

            {/* Rear Rows */}
            <div
              onClick={() => setRowPreference("BACK")}
              className={`p-3.5 border cursor-pointer transition-all flex flex-col justify-between ${
                rowPreference === "BACK"
                  ? "border-green-600 bg-green-50/40 dark:bg-green-950/30 ring-1 ring-green-600"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-950 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-green-600" />
                    Rear Coach (10–13)
                  </span>
                  {rowPreference === "BACK" && <Check className="w-4 h-4 text-green-600" />}
                </div>
                <span className="inline-block text-[10px] px-1.5 py-0.5 font-bold uppercase bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300">
                  Quiet &amp; Group Seating
                </span>
                <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                  Located in the rear passenger cabin away from boarding passenger flow. Preferred for study groups and uninterrupted morning reading.
                </p>
              </div>
            </div>

            {/* No Preference */}
            <div
              onClick={() => setRowPreference("NO_PREFERENCE")}
              className={`p-3.5 border cursor-pointer transition-all flex flex-col justify-between ${
                rowPreference === "NO_PREFERENCE"
                  ? "border-green-600 bg-green-50/40 dark:bg-green-950/30 ring-1 ring-green-600"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-950 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-gray-400" />
                    Any Row Zone
                  </span>
                  {rowPreference === "NO_PREFERENCE" && <Check className="w-4 h-4 text-green-600" />}
                </div>
                <span className="inline-block text-[10px] px-1.5 py-0.5 font-bold uppercase bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300">
                  System Load-Balanced
                </span>
                <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                  Allows the dispatch algorithm to balance overall coach mass center-outward for fuel efficiency and rapid boarding throughput.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Seat Position Preference (Window, Aisle, Any) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Armchair className="w-3.5 h-3.5 text-gray-400" />
              <span>2. Lateral Seat Position</span>
            </label>
            <span className="text-[11px] text-gray-400 font-mono">Ergonomic Comfort</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Window Seat */}
            <div
              onClick={() => setPositionPreference("WINDOW")}
              className={`p-3.5 border cursor-pointer transition-all flex flex-col justify-between ${
                positionPreference === "WINDOW"
                  ? "border-green-600 bg-green-50/40 dark:bg-green-950/30 ring-1 ring-green-600"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-950 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <span>🪟</span> Window Seat
                  </span>
                  {positionPreference === "WINDOW" && <Check className="w-4 h-4 text-green-600" />}
                </div>
                <span className="inline-block text-[10px] px-1.5 py-0.5 font-bold uppercase bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300">
                  Wall Rest &amp; Panoramic View
                </span>
                <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                  Boundary against the coach exterior wall. Ideal for resting your head against the pillar, enjoying scenic mountain views, and quiet commutes.
                </p>
              </div>
            </div>

            {/* Aisle Seat */}
            <div
              onClick={() => setPositionPreference("AISLE")}
              className={`p-3.5 border cursor-pointer transition-all flex flex-col justify-between ${
                positionPreference === "AISLE"
                  ? "border-green-600 bg-green-50/40 dark:bg-green-950/30 ring-1 ring-green-600"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-950 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <span>🚶</span> Aisle Seat
                  </span>
                  {positionPreference === "AISLE" && <Check className="w-4 h-4 text-green-600" />}
                </div>
                <span className="inline-block text-[10px] px-1.5 py-0.5 font-bold uppercase bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300">
                  Extra Legroom &amp; Walkway Access
                </span>
                <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                  Direct access to the center walkway. Provides additional shoulder freedom, leg stretching space, and zero need to squeeze past fellow passengers.
                </p>
              </div>
            </div>

            {/* Any Position */}
            <div
              onClick={() => setPositionPreference("NO_PREFERENCE")}
              className={`p-3.5 border cursor-pointer transition-all flex flex-col justify-between ${
                positionPreference === "NO_PREFERENCE"
                  ? "border-green-600 bg-green-50/40 dark:bg-green-950/30 ring-1 ring-green-600"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-950 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-gray-400" />
                    Any Position
                  </span>
                  {positionPreference === "NO_PREFERENCE" && <Check className="w-4 h-4 text-green-600" />}
                </div>
                <span className="inline-block text-[10px] px-1.5 py-0.5 font-bold uppercase bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300">
                  First Available
                </span>
                <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                  Assigns the closest available seat matching your preferred row zone without lateral position constraints.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive 2D Bus Coach Seat Schematic Diagram */}
        <div className="space-y-2 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-gray-500">
            <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Bus className="w-3.5 h-3.5 text-green-600" />
              <span>3. Live Coach Visualizer (52-Seater Standard Fleet Layout)</span>
            </span>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-green-600 inline-block" /> Preferred
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-gray-200 dark:bg-zinc-700 inline-block" /> Available
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-amber-500 inline-block" /> Faculty Priority
              </span>
            </div>
          </div>

          {/* Coach Schematic Box */}
          <div className="p-4 sm:p-6 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-gray-800 rounded-none overflow-x-auto">
            <div className="min-w-[540px] max-w-xl mx-auto space-y-4">
              {/* Front Bus Cabin Indicator */}
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 dark:border-zinc-800 pb-3 text-xs text-gray-400 font-mono">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 text-[10px] uppercase font-bold">
                    Door &amp; Egress
                  </span>
                  <span>Boarding Stairs</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-bold">
                  <span>DRIVER CABIN</span>
                  <span className="text-base">☸️</span>
                </div>
              </div>

              {/* Rows 1 to 12 (Standard 2x2 Layout) */}
              <div className="space-y-2">
                {[
                  { row: 1, zone: "FRONT", isFaculty: true },
                  { row: 2, zone: "FRONT" },
                  { row: 3, zone: "FRONT" },
                  { row: 4, zone: "FRONT" },
                  { row: 5, zone: "MIDDLE" },
                  { row: 6, zone: "MIDDLE" },
                  { row: 7, zone: "MIDDLE" },
                  { row: 8, zone: "MIDDLE" },
                  { row: 9, zone: "MIDDLE" },
                  { row: 10, zone: "BACK" },
                  { row: 11, zone: "BACK" },
                  { row: 12, zone: "BACK" },
                ].map(({ row, zone, isFaculty }) => {
                  const seatA = `${row}A`;
                  const seatB = `${row}B`;
                  const seatC = `${row}C`;
                  const seatD = `${row}D`;

                  return (
                    <div key={row} className="flex items-center justify-between text-xs">
                      {/* Zone indicator on left */}
                      <span className="w-16 font-mono text-[10px] text-gray-400">
                        {row === 1 ? "FRONT 1" : row === 5 ? "MID 5" : row === 10 ? "REAR 10" : `Row ${row}`}
                      </span>

                      {/* Left Side: Window A + Aisle B */}
                      <div className="flex items-center gap-2">
                        {/* Seat A (Window) */}
                        <div
                          onMouseEnter={() => setHoveredSeat(seatA)}
                          onMouseLeave={() => setHoveredSeat(null)}
                          className={`w-10 h-9 flex items-center justify-center font-mono text-xs border transition-all select-none ${
                            activeAllocatedSeat === seatA
                              ? "bg-green-600 text-white font-bold border-green-700 ring-2 ring-green-400"
                              : isSeatPreferred(row, "A")
                              ? "bg-green-100 text-green-900 border-green-500 dark:bg-green-950/70 dark:text-green-300 font-bold"
                              : isFaculty
                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                              : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300"
                          }`}
                          title={`Seat ${seatA} (Window • ${zone})`}
                        >
                          {seatA}
                        </div>

                        {/* Seat B (Aisle) */}
                        <div
                          onMouseEnter={() => setHoveredSeat(seatB)}
                          onMouseLeave={() => setHoveredSeat(null)}
                          className={`w-10 h-9 flex items-center justify-center font-mono text-xs border transition-all select-none ${
                            activeAllocatedSeat === seatB
                              ? "bg-green-600 text-white font-bold border-green-700 ring-2 ring-green-400"
                              : isSeatPreferred(row, "B")
                              ? "bg-green-100 text-green-900 border-green-500 dark:bg-green-950/70 dark:text-green-300 font-bold"
                              : isFaculty
                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                              : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300"
                          }`}
                          title={`Seat ${seatB} (Aisle • ${zone})`}
                        >
                          {seatB}
                        </div>
                      </div>

                      {/* Central Walking Aisle */}
                      <div className="w-14 text-center font-mono text-[10px] text-gray-300 dark:text-zinc-700 uppercase tracking-widest">
                        AISLE
                      </div>

                      {/* Right Side: Aisle C + Window D */}
                      <div className="flex items-center gap-2">
                        {/* Seat C (Aisle) */}
                        <div
                          onMouseEnter={() => setHoveredSeat(seatC)}
                          onMouseLeave={() => setHoveredSeat(null)}
                          className={`w-10 h-9 flex items-center justify-center font-mono text-xs border transition-all select-none ${
                            activeAllocatedSeat === seatC
                              ? "bg-green-600 text-white font-bold border-green-700 ring-2 ring-green-400"
                              : isSeatPreferred(row, "C")
                              ? "bg-green-100 text-green-900 border-green-500 dark:bg-green-950/70 dark:text-green-300 font-bold"
                              : isFaculty
                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                              : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300"
                          }`}
                          title={`Seat ${seatC} (Aisle • ${zone})`}
                        >
                          {seatC}
                        </div>

                        {/* Seat D (Window) */}
                        <div
                          onMouseEnter={() => setHoveredSeat(seatD)}
                          onMouseLeave={() => setHoveredSeat(null)}
                          className={`w-10 h-9 flex items-center justify-center font-mono text-xs border transition-all select-none ${
                            activeAllocatedSeat === seatD
                              ? "bg-green-600 text-white font-bold border-green-700 ring-2 ring-green-400"
                              : isSeatPreferred(row, "D")
                              ? "bg-green-100 text-green-900 border-green-500 dark:bg-green-950/70 dark:text-green-300 font-bold"
                              : isFaculty
                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                              : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300"
                          }`}
                          title={`Seat ${seatD} (Window • ${zone})`}
                        >
                          {seatD}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Row 13 (Rear 5-Seat Bench) */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-dashed border-gray-200 dark:border-zinc-800">
                  <span className="w-16 font-mono text-[10px] text-gray-400">Row 13</span>
                  <div className="flex items-center justify-center gap-2 flex-1">
                    {["13A", "13B", "13C", "13D", "13E"].map((seatCode, idx) => (
                      <div
                        key={seatCode}
                        onMouseEnter={() => setHoveredSeat(seatCode)}
                        onMouseLeave={() => setHoveredSeat(null)}
                        className={`w-10 h-9 flex items-center justify-center font-mono text-xs border transition-all select-none ${
                          activeAllocatedSeat === seatCode
                            ? "bg-green-600 text-white font-bold border-green-700 ring-2 ring-green-400"
                            : rowPreference === "BACK"
                            ? "bg-green-100 text-green-900 border-green-500 dark:bg-green-950/70 dark:text-green-300 font-bold"
                            : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300"
                        }`}
                        title={`Rear Bench Seat ${seatCode}`}
                      >
                        {seatCode}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Travel Partner Pairing (PNR Cohesion Rule) */}
        <div className="p-4 border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-zinc-900/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-green-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                4. Peer Companion Seating (PNR Cohesion Pair)
              </h3>
            </div>
            {partnerRequestStatus === "ACCEPTED" ? (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border border-green-300 dark:border-green-800 flex items-center gap-1">
                <Check className="w-3 h-3" /> Paired with {partnerName || "Peer"}
              </span>
            ) : partnerRequestStatus === "PENDING" ? (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                Pending Peer Invite
              </span>
            ) : (
              <span className="text-[10px] font-mono text-gray-400">Optional</span>
            )}
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            Traveling daily with a classmate on the same bus? Enter their Student ID or Roll Number below. The algorithm automatically binds your reservation as a companion pair to allocate adjacent seats (e.g. 4A &amp; 4B).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                Travel Partner Student ID / Roll No
              </label>
              <input
                type="text"
                value={partnerStudentId}
                onChange={e => setPartnerStudentId(e.target.value)}
                placeholder="E.g. STU-2026-0849 or Roll No"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                Partner Full Name (Display Verification)
              </label>
              <input
                type="text"
                value={partnerName}
                onChange={e => setPartnerName(e.target.value)}
                placeholder="E.g. Rahul Sharma"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Action Save Button */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Preferences are saved to your student profile and dynamically re-evaluated whenever a vehicle run is initiated.
          </p>

          <button
            type="button"
            onClick={handleSavePreferences}
            disabled={isSaving}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-none transition-colors text-sm shadow-xs active:scale-95 cursor-pointer flex items-center gap-2 shrink-0"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Reallocating Seat...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Seat Preferences</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
