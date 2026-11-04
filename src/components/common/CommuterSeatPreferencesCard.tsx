"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  Clock,
  X,
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

  // UI & Peer Seating State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hoveredSeat, setHoveredSeat] = useState<string | null>(null);
  const [partnerRequestStatus, setPartnerRequestStatus] = useState<string | null>(null);
  const [activeAllocatedSeat, setActiveAllocatedSeat] = useState<string | null>(
    activeReservation?.chosen_seat || activeReservation?.auto_assigned_seat || null
  );

  // Companion Pairing & Bus Passenger Manifest State
  const [busPeers, setBusPeers] = useState<any[]>([]);
  const [busInfo, setBusInfo] = useState<any | null>(null);
  const [isLoadingPeers, setIsLoadingPeers] = useState(false);
  const [selectedPeerId, setSelectedPeerId] = useState("");
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [activePartnership, setActivePartnership] = useState<any | null>(null);
  const [isSendingPartnerRequest, setIsSendingPartnerRequest] = useState(false);
  const [isProcessingActionId, setIsProcessingActionId] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);

  const displayBusNumber = busInfo?.bus_number || activeReservation?.bus_number || activeReservation?.bus_id || "";

  // Dedicated Partner Data Fetcher
  const fetchPartnerData = useCallback(async (busIdOverride?: string) => {
    if (!studentId) return;
    setIsLoadingPeers(true);
    try {
      const effectiveBusId = busIdOverride || activeReservation?.bus_id || "";
      const res = await fetch(`/api/students/seat-partner-requests?studentId=${studentId}&busId=${effectiveBusId}`);
      const data = await res.json();
      if (data.success) {
        setIncomingRequests(data.incomingRequests || []);
        setOutgoingRequests(data.outgoingRequests || []);
        setActivePartnership(data.activePartnership || null);
        setBusPeers(data.busPeers || []);
        if (data.busInfo) setBusInfo(data.busInfo);

        if (data.activePartnership) {
          setPartnerRequestStatus("ACCEPTED");
          const otherName =
            data.activePartnership.sender_id === studentId
              ? data.activePartnership.receiver_name
              : data.activePartnership.sender_name;
          if (otherName) setPartnerName(otherName);
        } else if (data.outgoingRequests?.length > 0) {
          setPartnerRequestStatus("PENDING");
          setPartnerName(data.outgoingRequests[0].receiver_name || "Classmate");
        } else {
          setPartnerRequestStatus(null);
        }
      }
    } catch (err) {
      console.warn("Failed to load seat partner data:", err);
    } finally {
      setIsLoadingPeers(false);
    }
  }, [studentId, activeReservation?.bus_id]);

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

    fetchPartnerData();

    return () => {
      isMounted = false;
    };
  }, [studentId, fetchPartnerData]);

  // Sync active reservation seat and bus when prop changes
  useEffect(() => {
    if (activeReservation) {
      setActiveAllocatedSeat(activeReservation.chosen_seat || activeReservation.auto_assigned_seat || null);
      if (activeReservation.bus_id) {
        fetchPartnerData(activeReservation.bus_id);
      }
    }
  }, [activeReservation, fetchPartnerData]);

  // Action: Send Seat Partner Request
  const handleSendPartnerRequest = async (overrideId?: string, overrideName?: string) => {
    const targetId = overrideId || selectedPeerId || partnerStudentId.trim();
    if (!targetId) {
      showToast("warning", "Please select a classmate from the dropdown or enter their Student ID.", "Companion Required");
      return;
    }

    setIsSendingPartnerRequest(true);
    try {
      const res = await fetch("/api/students/seat-partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SEND_REQUEST",
          senderId: studentId,
          receiverId: targetId,
          receiverStudentIdCode: targetId,
          busId: busInfo?.id || activeReservation?.bus_id,
          preferredRowZone: rowPreference,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send seat partner invitation.");
      }

      showToast("success", data.message, "Invitation Sent");
      setSelectedPeerId("");
      await fetchPartnerData();
      onPreferencesUpdated?.();
    } catch (err: any) {
      showToast("error", err.message || "Failed to send partner request", "Error");
    } finally {
      setIsSendingPartnerRequest(false);
    }
  };

  // Action: Accept Partner Request
  const handleAcceptRequest = async (requestId: string) => {
    setIsProcessingActionId(requestId);
    try {
      const res = await fetch("/api/students/seat-partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ACCEPT_REQUEST",
          requestId,
          respondingStudentId: studentId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      showToast("success", data.message, "Seat Partner Confirmed");
      if (data.allocatedPair?.senderSeat || data.allocatedPair?.receiverSeat) {
        setActiveAllocatedSeat(data.allocatedPair.receiverSeat || data.allocatedPair.senderSeat);
      }
      await fetchPartnerData();
      onPreferencesUpdated?.();
    } catch (err: any) {
      showToast("error", err.message || "Failed to accept partner request", "Error");
    } finally {
      setIsProcessingActionId(null);
    }
  };

  // Action: Decline Partner Request
  const handleDeclineRequest = async (requestId: string) => {
    setIsProcessingActionId(requestId);
    try {
      const res = await fetch("/api/students/seat-partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DECLINE_REQUEST", requestId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      showToast("info", "Seat partner invitation declined.", "Invitation Declined");
      await fetchPartnerData();
    } catch (err: any) {
      showToast("error", err.message, "Error");
    } finally {
      setIsProcessingActionId(null);
    }
  };

  // Action: Cancel Outgoing Partner Request
  const handleCancelRequest = async (requestId: string) => {
    setIsProcessingActionId(requestId);
    try {
      const res = await fetch("/api/students/seat-partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL_REQUEST", requestId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      showToast("info", "Pending seat partner invitation cancelled.", "Cancelled");
      await fetchPartnerData();
    } catch (err: any) {
      showToast("error", err.message, "Error");
    } finally {
      setIsProcessingActionId(null);
    }
  };

  // Action: Unlink Active Partnership
  const handleUnlinkPartner = async (requestId: string) => {
    if (!confirm("Are you sure you want to unlink your seat partner? You will both be able to select seats independently.")) return;
    setIsProcessingActionId(requestId);
    try {
      const res = await fetch("/api/students/seat-partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UNLINK_PARTNER", requestId, studentId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      showToast("info", "Seat partnership unlinked successfully.", "Unlinked");
      setPartnerStudentId("");
      setPartnerName("");
      await fetchPartnerData();
      onPreferencesUpdated?.();
    } catch (err: any) {
      showToast("error", err.message, "Error");
    } finally {
      setIsProcessingActionId(null);
    }
  };

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

        {/* 4. Travel Partner Pairing (PNR Cohesion Rule) */}
        <div className="p-4 border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-zinc-900/40 space-y-4 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                4. Peer Companion Seating (PNR Cohesion Pair)
              </h3>
            </div>
            {activePartnership ? (
              <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-full flex items-center gap-1 shadow-2xs">
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Paired with {partnerName || activePartnership.receiver_name || activePartnership.sender_name}
              </span>
            ) : outgoingRequests.length > 0 ? (
              <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Pending Peer Invite
              </span>
            ) : (
              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                Optional
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Traveling daily with a classmate on the same bus? Select a student assigned to this bus or enter their Student ID below to send a seat partner request. The algorithm automatically allocates adjacent seats (e.g. 4A &amp; 4B) once confirmed.
          </p>

          {/* Active Confirmed Partnership View */}
          {activePartnership ? (
            <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                    Paired with {partnerName || activePartnership.receiver_name || activePartnership.sender_name}
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 truncate">
                    {activePartnership.allocated_pair?.senderSeat && activePartnership.allocated_pair?.receiverSeat
                      ? `Adjacent Seating: Seats ${activePartnership.allocated_pair.senderSeat} & ${activePartnership.allocated_pair.receiverSeat}`
                      : `Confirmed companion on Bus ${displayBusNumber} • Adjacent seats prioritized`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleUnlinkPartner(activePartnership.id)}
                disabled={Boolean(isProcessingActionId)}
                className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 text-[11px] font-semibold transition-colors shrink-0 cursor-pointer"
              >
                {isProcessingActionId === activePartnership.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Unlink"}
              </button>
            </div>
          ) : outgoingRequests.length > 0 ? (
            /* Pending Outgoing Request View */
            <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                    Invite sent to {outgoingRequests[0].receiver_name}
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 truncate">
                    Waiting for peer acceptance to bind seats adjacent on Bus {displayBusNumber}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCancelRequest(outgoingRequests[0].id)}
                disabled={Boolean(isProcessingActionId)}
                className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300 text-[11px] font-semibold transition-colors shrink-0 cursor-pointer"
              >
                {isProcessingActionId === outgoingRequests[0].id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Cancel Invite"}
              </button>
            </div>
          ) : (
            /* Unpaired: Dropdown of Students Assigned to this Bus + Send Request */
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <Bus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Select Classmate Assigned to Bus {displayBusNumber}</span>
                  </label>
                  {isLoadingPeers ? (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading classmates...
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400 font-mono">
                      {busPeers.length} student{busPeers.length === 1 ? "" : "s"} on this bus
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={selectedPeerId}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedPeerId(val);
                        const matchedPeer = busPeers.find(p => p.studentId === val);
                        if (matchedPeer) {
                          setPartnerStudentId(matchedPeer.studentIdCode || matchedPeer.studentId);
                          setPartnerName(matchedPeer.fullName);
                        }
                      }}
                      disabled={isLoadingPeers || busPeers.length === 0}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs disabled:opacity-50 transition-all cursor-pointer"
                    >
                      <option value="">
                        {isLoadingPeers
                          ? "Loading passengers for this bus..."
                          : busPeers.length > 0
                          ? `-- Choose a classmate on Bus ${displayBusNumber} (${busPeers.length} available) --`
                          : `-- No other classmates reserved yet on Bus ${displayBusNumber} --`}
                      </option>
                      {busPeers.map(peer => (
                        <option key={peer.studentId} value={peer.studentId}>
                          {peer.fullName} {peer.studentIdCode ? `(${peer.studentIdCode})` : ""} {peer.className ? `• ${peer.className}` : ""} {peer.currentSeat ? `[Seat ${peer.currentSeat}]` : ""} {peer.stopName ? `• ${peer.stopName}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSendPartnerRequest()}
                    disabled={!selectedPeerId || isSendingPartnerRequest}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
                  >
                    {isSendingPartnerRequest ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Request...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Send Partner Request</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Manual ID / Roll Number Fallback Toggle */}
              <div className="pt-1 border-t border-gray-200/60 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowManualInput(prev => !prev)}
                  className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>{showManualInput ? "▲ Hide manual Roll No lookup" : "▼ Can't find them in the list? Enter Student ID or Roll No manually"}</span>
                </button>

                {showManualInput && (
                  <div className="mt-2.5 p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg space-y-2.5 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Classmate Student ID / Roll No
                        </label>
                        <input
                          type="text"
                          value={partnerStudentId}
                          onChange={e => setPartnerStudentId(e.target.value)}
                          placeholder="E.g. 230111075 or STU-2026-0849"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:border-emerald-500 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Classmate Full Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={partnerName}
                          onChange={e => setPartnerName(e.target.value)}
                          placeholder="E.g. Rahul Sharma"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:border-emerald-500 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleSendPartnerRequest(partnerStudentId, partnerName)}
                        disabled={!partnerStudentId.trim() || isSendingPartnerRequest}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {isSendingPartnerRequest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                        <span>Send Invite by ID</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5. Incoming Seat Partner Requests (Mutual Consent Acceptance / Rejection) */}
        <div className="p-4 border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-zinc-900/40 space-y-3 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                5. Incoming Companion Invitations
              </h3>
            </div>
            {incomingRequests.length > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                {incomingRequests.length} Pending
              </span>
            ) : (
              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                Up to date
              </span>
            )}
          </div>

          {incomingRequests.length > 0 ? (
            <div className="space-y-2.5">
              {incomingRequests.map((req: any) => (
                <div
                  key={req.id}
                  className="p-3.5 bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800/60 rounded-xl shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800">
                        {req.sender_name?.slice(0, 2).toUpperCase() || "PE"}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                          {req.sender_name}
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Invited you to be seat partners on <span className="font-semibold text-gray-700 dark:text-gray-200">Bus {displayBusNumber || req.bus_id}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Today"}
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-600 dark:text-gray-300 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 leading-relaxed">
                    💡 Accepting this invitation will link your reservations as a companion pair and automatically reallocate your seats adjacent to each other (e.g. Window + Aisle in the same row).
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleDeclineRequest(req.id)}
                      disabled={Boolean(isProcessingActionId)}
                      className="px-3.5 py-1.5 border border-gray-300 dark:border-zinc-700 hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-950/30 dark:hover:text-red-400 dark:hover:border-red-800 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      {isProcessingActionId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Decline"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAcceptRequest(req.id)}
                      disabled={Boolean(isProcessingActionId)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      {isProcessingActionId === req.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Pairing Seats...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept & Pair Seats</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-white/60 dark:bg-zinc-900/50 border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl text-center space-y-1">
              <Users className="w-5 h-5 text-gray-400 mx-auto" />
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                No pending companion invitations
              </p>
              <p className="text-[11px] text-gray-400">
                When a classmate traveling on Bus {displayBusNumber} invites you to pair seats, you can review and accept their request here.
              </p>
            </div>
          )}
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

