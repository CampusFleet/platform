"use client";

import React, { useState, useEffect } from "react";
import {
  GitMerge,
  Send,
  Sliders,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  BusFront,
  Route,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  ShieldAlert,
  ArrowRight,
  Zap,
  Check,
  X,
  Radio,
  Fuel,
  Users,
  UserX,
  Gauge,
  TrendingDown,
  Waypoints,
  CornerDownRight,
  MapPin,
  Calendar,
  Layers,
  Award,
} from "lucide-react";

export interface MergeSuggestion {
  id: string;
  orchestrationType?: "INTRA_CORRIDOR_DISASSEMBLY" | "ROUTE_STITCH_CONSOLIDATION";
  mergePointId?: string;
  mergePointCode?: string;
  mergePointName?: string;
  routeId: string;
  routeName: string;
  secondaryRouteId?: string;
  secondaryRouteName?: string;
  stitchedRouteName?: string;
  sourceBusId: string;
  sourceBusName: string;
  sourceOccupancy: number;
  targetBusId: string;
  targetBusName: string;
  targetOccupancy: number;
  targetCapacity: number;
  combinedOccupancy: number;
  remainingSeats: number;
  activeStopIds?: string[];
  bypassedStopIds?: string[];
  estimatedDetourMinutes?: number;
  fuelSavedLiters?: number;
  prunedAbsenteeCount?: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason?: string;
  suggestedBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface MergePoint {
  id: string;
  code: string;
  name: string;
  routeId: string;
  routeName: string;
  stopId: string;
  stopName: string;
  description?: string;
  isActive: boolean;
}

export interface DispatchConfig {
  min_occupancy_percent: number;
  max_wait_minutes: number;
  progressive_dispatch_enabled: boolean;
}

export interface DispatchBus {
  id: string;
  busNumber: string;
  plateNumber: string;
  routeId: string;
  routeName: string;
  capacity: number;
  occupancy: number;
  occupancyPercent: number;
  status: string;
  meetsOccupancy: boolean;
  isReadyToDispatch: boolean;
  dispatchStatus: "DISPATCHED" | "READY_TO_DISPATCH" | "BOARDING";
}

export interface ReconciliationRun {
  id: string;
  reconciled_date: string;
  total_incoming_attendees: number;
  total_absentees_pruned: number;
  initial_outgoing_passengers: number;
  reconciled_outgoing_passengers: number;
  opportunities_detected: number;
  fuel_saved_liters: number;
  created_at: string;
}

export interface TransportManagerMergesProps {
  initialSuggestions?: MergeSuggestion[];
  initialMergePoints?: MergePoint[];
}

/**
 * Creative Cartoon Bus Vector Graphic
 * A playful, stylized bus with cute wheels, rounded body, and driver visor
 */
function CartoonBusGraphic({
  busNumber,
  color = "blue",
  isResting = false,
  passengers = 0,
}: {
  busNumber: string | number;
  color?: "blue" | "amber" | "emerald";
  isResting?: boolean;
  passengers?: number;
}) {
  const chassisColor = color === "blue" ? "#3B82F6" : color === "amber" ? "#F59E0B" : "#10B981";
  const roofColor = color === "blue" ? "#2563EB" : color === "amber" ? "#D97706" : "#059669";
  const accentStripe = "#FBBF24";

  return (
    <div className="relative inline-flex flex-col items-center select-none group">
      {isResting && (
        <div className="absolute -top-3.5 right-1 flex items-center gap-0.5 text-[10px] font-black text-amber-500 animate-bounce">
          <span>Z</span>
          <span className="text-[8px]">z</span>
          <span className="text-[6px]">z</span>
        </div>
      )}

      <svg width="104" height="48" viewBox="0 0 104 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm">
        {/* Roof Dome / AC Unit */}
        <rect x="32" y="3" width="40" height="4" rx="2" fill={roofColor} />

        {/* Main Rounded Bus Chassis */}
        <path
          d="M8 8C8 5.79 9.79 4 12 4H88C94 4 99 9 100 15L102 28C102.5 32 99.5 35 96 35H8C5.79 35 4 33.21 4 31V12C4 9.79 5.79 8 8 8Z"
          fill={chassisColor}
        />

        {/* Lower Trim Accent */}
        <path d="M4 29H102L100 35H8C5.79 35 4 33.21 4 31V29Z" fill="#1E293B" />

        {/* University Yellow Ribbon */}
        <rect x="4" y="26" width="98" height="2.5" fill={accentStripe} />

        {/* Windows */}
        <rect x="12" y="10" width="12" height="12" rx="2" fill="#E2E8F0" />
        <rect x="28" y="10" width="12" height="12" rx="2" fill="#E2E8F0" />
        <rect x="44" y="10" width="12" height="12" rx="2" fill="#E2E8F0" />
        <rect x="60" y="10" width="12" height="12" rx="2" fill="#E2E8F0" />

        {/* Front Windshield with Aerodynamic Slope */}
        <path d="M76 10H93L96 22H76V10Z" fill="#0F172A" />
        <path d="M80 12L89 20H85L78 12H80Z" fill="white" fillOpacity="0.5" />

        {/* Headlight with warm glow */}
        <circle cx="98" cy="28" r="3" fill="#FDE047" />

        {/* Left Wheel */}
        <circle cx="22" cy="36" r="7" fill="#0F172A" />
        <circle cx="22" cy="36" r="3.5" fill="#94A3B8" />

        {/* Right Wheel */}
        <circle cx="82" cy="36" r="7" fill="#0F172A" />
        <circle cx="82" cy="36" r="3.5" fill="#94A3B8" />
      </svg>

      {/* Playful Bus Label Pill */}
      <span className="mt-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 shadow-xs">
        {busNumber}
      </span>
    </div>
  );
}

export default function TransportManagerMergesView({
  initialSuggestions = [],
  initialMergePoints = [],
}: TransportManagerMergesProps = {}) {
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>(initialSuggestions);
  const [mergePoints, setMergePoints] = useState<MergePoint[]>(initialMergePoints);
  const [latestRecon, setLatestRecon] = useState<ReconciliationRun | null>(null);
  const [dispatchConfig, setDispatchConfig] = useState<DispatchConfig>({
    min_occupancy_percent: 80,
    max_wait_minutes: 15,
    progressive_dispatch_enabled: true,
  });
  const [dispatchQueue, setDispatchQueue] = useState<DispatchBus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isExecutingAll, setIsExecutingAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"disassembly" | "stitching" | "dispatch" | "mergePoints" | "history">("disassembly");

  // Reject Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedSuggestionForReject, setSelectedSuggestionForReject] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Add Merge Point Modal
  const [addPointModalOpen, setAddPointModalOpen] = useState(false);
  const [newPointForm, setNewPointForm] = useState({
    routeId: "",
    stopId: "",
    name: "",
    code: "",
    description: "",
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);

      const [sugRes, ptsRes, dispRes] = await Promise.all([
        fetch("/api/merges"),
        fetch("/api/merges/points"),
        fetch("/api/dispatch"),
      ]);

      const sugData = await sugRes.json();
      if (sugData.success) {
        setSuggestions(sugData.suggestions || []);
        if (sugData.latestReconciliation) setLatestRecon(sugData.latestReconciliation);
      }

      const ptsData = await ptsRes.json();
      if (ptsData.success) setMergePoints(ptsData.points || []);

      const dispData = await dispRes.json();
      if (dispData.success) {
        if (dispData.config) setDispatchConfig(dispData.config);
        if (dispData.queue) setDispatchQueue(dispData.queue);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Trigger Automatic Attendance Reconciliation & Opportunity Detection (Approach C)
  const handleReconcileAndDetect = async () => {
    try {
      setIsReconciling(true);
      setStatusMessage(null);
      const res = await fetch("/api/merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RECONCILE_AND_DETECT",
          reviewerName: "Transport Dispatch Manager",
        }),
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage({
          text: `Scan Complete! Morning attendance parsed, ${data.plan?.summary?.totalAbsentPruned || 0} absentees pruned. Detected ${data.detectedCount} fuel-saving bus combine opportunities!`,
          type: "success",
        });
        fetchData();
      } else {
        setStatusMessage({ text: data.message || "Reconciliation failed.", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Network error.", type: "error" });
    } finally {
      setIsReconciling(false);
    }
  };

  // 1-Click Auto-Pilot: Execute All Pending Recommended Disassemblies & Stitches
  const handleExecuteAll = async () => {
    try {
      setIsExecutingAll(true);
      setStatusMessage(null);
      const res = await fetch("/api/merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EXECUTE_ALL_RECOMMENDED",
          reviewerName: "Auto-Pilot Fleet Controller",
        }),
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage({ text: data.message, type: "success" });
        fetchData();
      } else {
        setStatusMessage({ text: data.message || "Execution failed.", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Error running auto-pilot.", type: "error" });
    } finally {
      setIsExecutingAll(false);
    }
  };

  // Approve Single Suggestion
  const handleApprove = async (suggestionId: string) => {
    try {
      setStatusMessage(null);
      const res = await fetch("/api/merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
          suggestionId,
          reviewerName: "Transport Manager",
        }),
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage({ text: data.message, type: "success" });
        fetchData();
      } else {
        setStatusMessage({ text: data.message, type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Error executing suggestion.", type: "error" });
    }
  };

  // Submit Rejection
  const handleSubmitReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSuggestionForReject) return;

    try {
      const res = await fetch("/api/merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REJECT",
          suggestionId: selectedSuggestionForReject,
          rejectionReason,
          reviewerName: "Transport Manager",
        }),
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage({ text: "Suggestion marked as rejected.", type: "success" });
        setRejectModalOpen(false);
        setSelectedSuggestionForReject(null);
        setRejectionReason("");
        fetchData();
      } else {
        setStatusMessage({ text: data.message, type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Error rejecting suggestion.", type: "error" });
    }
  };

  // Progressive Dispatch Configuration Save
  const handleSaveDispatchConfig = async () => {
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CONFIG",
          minOccupancyPercent: dispatchConfig.min_occupancy_percent,
          maxWaitMinutes: dispatchConfig.max_wait_minutes,
          enabled: dispatchConfig.progressive_dispatch_enabled,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage({ text: "Progressive dispatch rules updated successfully!", type: "success" });
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filter lists
  const pendingSuggestions = suggestions.filter((s) => s.status === "PENDING");
  const historySuggestions = suggestions.filter((s) => s.status !== "PENDING");

  const disassemblySuggestions = pendingSuggestions.filter(
    (s) => s.orchestrationType !== "ROUTE_STITCH_CONSOLIDATION"
  );
  const routeStitchSuggestions = pendingSuggestions.filter(
    (s) => s.orchestrationType === "ROUTE_STITCH_CONSOLIDATION"
  );

  const totalFuelSaved = suggestions
    .filter((s) => s.status === "APPROVED")
    .reduce((acc, curr) => acc + (curr.fuelSavedLiters || 0), 0);

  return (
    <div className="space-y-6">
      {/* ─── Creative Cartoonish Blue Hero Stage ────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-500/20 border-2 border-blue-400/40">
        {/* Playful Floating Road Pattern in Background */}
        <div className="absolute inset-0 pointer-events-none opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="white" strokeWidth="3" strokeDasharray="16 16" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            {/* Cartoon Capsule Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/30 text-[11px] font-black uppercase tracking-wider shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Smart Combine Engine</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-sm flex items-center gap-3">
              <span>Combine Buses</span>
              <span className="text-xs px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-extrabold uppercase tracking-wide shadow-sm">
                Fuel Saver
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-blue-100 font-medium leading-relaxed">
              When students are absent from the morning shift, we automatically combine half-empty buses at merge stops or stitch sparse routes. Save diesel, prevent traffic congestion, and protect your budget!
            </p>

            {/* Action CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={handleReconcileAndDetect}
                disabled={isReconciling}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-blue-700 hover:bg-blue-50 font-black text-xs shadow-[0_4px_0_0_#93c5fd] active:shadow-none active:translate-y-1 transition-all disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 text-blue-600 ${isReconciling ? "animate-spin" : ""}`} />
                <span>{isReconciling ? "Reconciling Demand..." : "Reconcile Attendance & Find Merges"}</span>
              </button>

              {pendingSuggestions.length > 0 && (
                <button
                  onClick={handleExecuteAll}
                  disabled={isExecutingAll}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-400 text-slate-950 hover:bg-emerald-300 font-black text-xs shadow-[0_4px_0_0_#059669] active:shadow-none active:translate-y-1 transition-all disabled:opacity-60"
                >
                  <Zap className="w-4 h-4 fill-current" />
                  <span>{isExecutingAll ? "Executing..." : `Auto-Combine All (${pendingSuggestions.length})`}</span>
                </button>
              )}

              <button
                onClick={fetchData}
                className="p-3 rounded-2xl bg-white/20 hover:bg-white/30 text-white transition-all active:scale-95"
                title="Refresh State"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Interactive Cartoon Stage Graphic */}
          <div className="hidden lg:flex items-center justify-center p-4 bg-white/10 backdrop-blur-md rounded-3xl border-2 border-white/20 shadow-inner">
            <div className="flex items-center gap-3">
              {/* Bus 1: Resting at Depot */}
              <div className="flex flex-col items-center">
                <CartoonBusGraphic busNumber="Bus A" color="amber" isResting={true} />
                <span className="text-[10px] font-black text-amber-200 mt-1">Stood Down</span>
              </div>

              {/* Dotted Merge Arrow */}
              <div className="flex flex-col items-center px-1">
                <span className="text-[9px] font-black uppercase text-blue-200 tracking-wider">Merge</span>
                <ArrowRight className="w-6 h-6 text-yellow-300 animate-pulse" />
              </div>

              {/* Bus 2: Carrier Bus zooming */}
              <div className="flex flex-col items-center">
                <CartoonBusGraphic busNumber="Bus B" color="blue" isResting={false} />
                <span className="text-[10px] font-black text-emerald-300 mt-1">Carrier Bus</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Notification Toast ────────────────────────────────────────── */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 border-2 shadow-sm transition-all ${
            statusMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-500" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="p-1 rounded-full hover:bg-black/10">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Playful Cartoon Stat Cards (Blue & Pastel Accent Neo-Brutalist) ─ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 p-4 rounded-3xl shadow-sm hover:border-blue-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">Morning Check-ins</span>
            <div className="p-2 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
            {latestRecon ? latestRecon.total_incoming_attendees : "Verified"}
          </div>
          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">Students present on campus</div>
        </div>

        {/* Card 2 */}
        <div className="bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 p-4 rounded-3xl shadow-sm hover:border-blue-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">Absentees Pruned</span>
            <div className="p-2 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
            {latestRecon ? latestRecon.total_absentees_pruned : "0"}
          </div>
          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">Excluded from evening manifest</div>
        </div>

        {/* Card 3 */}
        <div className="bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 p-4 rounded-3xl shadow-sm hover:border-blue-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">Combine Opportunities</span>
            <div className="p-2 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <GitMerge className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-indigo-600 dark:text-indigo-400">
            {pendingSuggestions.length}
          </div>
          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
            {disassemblySuggestions.length} Disassemblies • {routeStitchSuggestions.length} Stitches
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 p-4 rounded-3xl shadow-sm hover:border-blue-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">Fuel Rescued</span>
            <div className="p-2 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <Fuel className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {totalFuelSaved.toFixed(1)} <span className="text-sm font-bold">Liters</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
            ≈ ₹{(totalFuelSaved * 90).toLocaleString("en-IN")} saved in diesel
          </div>
        </div>
      </div>

      {/* ─── Chunky Cartoonish Navigation Tabs ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-blue-100 dark:border-blue-900/40 pb-3">
        <button
          onClick={() => setActiveTab("disassembly")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeTab === "disassembly"
              ? "bg-blue-600 text-white shadow-[0_3px_0_0_#1d4ed8]"
              : "bg-blue-50/70 dark:bg-slate-800 text-blue-900 dark:text-blue-300 hover:bg-blue-100 border border-blue-200 dark:border-blue-900"
          }`}
        >
          <GitMerge className="w-4 h-4" />
          <span>Merge Interchange Disassembly</span>
          {disassemblySuggestions.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-950 font-black">
              {disassemblySuggestions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("stitching")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeTab === "stitching"
              ? "bg-blue-600 text-white shadow-[0_3px_0_0_#1d4ed8]"
              : "bg-blue-50/70 dark:bg-slate-800 text-blue-900 dark:text-blue-300 hover:bg-blue-100 border border-blue-200 dark:border-blue-900"
          }`}
        >
          <Waypoints className="w-4 h-4" />
          <span>Route Stitching (Sparse Routes)</span>
          {routeStitchSuggestions.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-950 font-black">
              {routeStitchSuggestions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("dispatch")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeTab === "dispatch"
              ? "bg-blue-600 text-white shadow-[0_3px_0_0_#1d4ed8]"
              : "bg-blue-50/70 dark:bg-slate-800 text-blue-900 dark:text-blue-300 hover:bg-blue-100 border border-blue-200 dark:border-blue-900"
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Progressive Dispatch</span>
          {dispatchQueue.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-100 font-black">
              {dispatchQueue.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("mergePoints")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeTab === "mergePoints"
              ? "bg-blue-600 text-white shadow-[0_3px_0_0_#1d4ed8]"
              : "bg-blue-50/70 dark:bg-slate-800 text-blue-900 dark:text-blue-300 hover:bg-blue-100 border border-blue-200 dark:border-blue-900"
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Designated Merge Stops</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-100 font-black">
            {mergePoints.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeTab === "history"
              ? "bg-blue-600 text-white shadow-[0_3px_0_0_#1d4ed8]"
              : "bg-blue-50/70 dark:bg-slate-800 text-blue-900 dark:text-blue-300 hover:bg-blue-100 border border-blue-200 dark:border-blue-900"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Ledger & Fuel Saved</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-100 font-black">
            {historySuggestions.length}
          </span>
        </button>
      </div>

      {/* ─── TAB 1: INTRA-CORRIDOR BUS DISASSEMBLY AT MERGE STOPS ────── */}
      {activeTab === "disassembly" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>Intra-Corridor Bus Disassembly Opportunities</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-extrabold">
                  Same-Route Transshipment
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                When passenger actuals are low, one bus is stood down at the merge interchange to save fuel. Its students are reassigned to the carrier bus.
              </p>
            </div>
          </div>

          {disassemblySuggestions.length === 0 ? (
            <div className="p-10 text-center bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 rounded-3xl space-y-3">
              <div className="w-16 h-16 mx-auto bg-blue-50 dark:bg-blue-950/60 rounded-3xl flex items-center justify-center">
                <BusFront className="w-8 h-8 text-blue-500" />
              </div>
              <div className="text-base font-black text-slate-800 dark:text-slate-200">
                No Buses Need Disassembly Right Now
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                All buses currently have healthy occupancy levels. Click <strong>"Reconcile Attendance & Find Merges"</strong> above to ingest the latest morning check-in records!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {disassemblySuggestions.map((sug) => (
                <div
                  key={sug.id}
                  className="bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 rounded-3xl p-5 shadow-sm space-y-4 hover:border-blue-400 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                        {sug.routeName}
                      </span>
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-2 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-500" />
                        <span>Merge Interchange: {sug.mergePointName}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-black text-xs bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <Fuel className="w-3.5 h-3.5" />
                      <span>Saves ~{sug.fuelSavedLiters || 5.8}L</span>
                    </div>
                  </div>

                  {/* Playful Bus Graphic Transfer Map */}
                  <div className="p-4 bg-blue-50/50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-800/80 flex items-center justify-between">
                    {/* Stand Down Bus */}
                    <div className="flex flex-col items-center">
                      <CartoonBusGraphic busNumber={sug.sourceBusName} color="amber" isResting={true} />
                      <span className="text-[10px] font-black text-amber-600 mt-1">Stood Down (Depot)</span>
                      <span className="text-[10px] font-bold text-slate-400">{sug.sourceOccupancy} passengers</span>
                    </div>

                    {/* Funnel Arrow */}
                    <div className="flex flex-col items-center px-2">
                      <span className="text-[9px] font-black uppercase text-blue-500 tracking-wider">Combines Into</span>
                      <ArrowRight className="w-5 h-5 text-blue-500 animate-pulse" />
                    </div>

                    {/* Carrier Bus */}
                    <div className="flex flex-col items-center">
                      <CartoonBusGraphic busNumber={sug.targetBusName} color="blue" isResting={false} />
                      <span className="text-[10px] font-black text-blue-600 mt-1">Active Carrier</span>
                      <span className="text-[10px] font-bold text-emerald-600">
                        {sug.combinedOccupancy} / {sug.targetCapacity} seats ({sug.remainingSeats} free)
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setSelectedSuggestionForReject(sug.id);
                        setRejectModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(sug.id)}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-[0_3px_0_0_#1d4ed8] active:shadow-none active:translate-y-1 transition-all"
                    >
                      <Check className="w-4 h-4" />
                      <span>Combine & Stand Down Bus</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: MULTI-CORRIDOR ROUTE STITCHING (CLARKE-WRIGHT) ──── */}
      {activeTab === "stitching" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>Multi-Corridor Route Stitching (Clarke-Wright Savings)</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-extrabold">
                  Cross-Corridor Splice
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                When two neighboring routes are half-empty, one bus services the active stops of both routes, bypassing empty stops to save a full bus run!
              </p>
            </div>
          </div>

          {routeStitchSuggestions.length === 0 ? (
            <div className="p-10 text-center bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 rounded-3xl space-y-3">
              <div className="w-16 h-16 mx-auto bg-blue-50 dark:bg-blue-950/60 rounded-3xl flex items-center justify-center">
                <Waypoints className="w-8 h-8 text-blue-500" />
              </div>
              <div className="text-base font-black text-slate-800 dark:text-slate-200">
                No Sparse Routes to Stitch
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No adjacent routes are under 50% capacity today. When low student attendance leaves multiple routes half-empty, route stitching merges them automatically here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {routeStitchSuggestions.map((sug) => (
                <div
                  key={sug.id}
                  className="bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 rounded-3xl p-5 shadow-sm space-y-4 hover:border-blue-400 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                        Combined Line: {sug.stitchedRouteName || `${sug.routeName} + ${sug.secondaryRouteName || "Route 2"}`}
                      </span>
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-2 flex items-center gap-1.5">
                        <Waypoints className="w-3.5 h-3.5 text-blue-500" />
                        <span>Detour Buffer: +{sug.estimatedDetourMinutes || 8} min (Within SLA Limit)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-black text-xs bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <Fuel className="w-3.5 h-3.5" />
                      <span>Saves ~{sug.fuelSavedLiters || 8.4}L</span>
                    </div>
                  </div>

                  {/* Stitched Manifest Summary */}
                  <div className="p-4 bg-blue-50/50 dark:bg-slate-800/40 rounded-2xl border border-blue-200 dark:border-blue-800/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-black text-slate-800 dark:text-slate-200">
                      <span>Primary: {sug.routeName}</span>
                      <span>Combined Occupancy: {sug.combinedOccupancy} / {sug.targetCapacity}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Secondary: {sug.secondaryRouteName || "Adjacent Route"}</span>
                      <span className="font-bold text-emerald-600">{sug.remainingSeats} Free Seats Left</span>
                    </div>

                    <div className="pt-2 border-t border-blue-200 dark:border-blue-800/60 flex items-center justify-between">
                      <span className="text-amber-600 font-black flex items-center gap-1.5">
                        <BusFront className="w-3.5 h-3.5 text-amber-500" />
                        <span>Stand Down: {sug.sourceBusName}</span>
                      </span>
                      <span className="text-blue-600 font-black flex items-center gap-1.5">
                        <BusFront className="w-3.5 h-3.5 text-blue-500" />
                        <span>Carrier: {sug.targetBusName}</span>
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setSelectedSuggestionForReject(sug.id);
                        setRejectModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(sug.id)}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-[0_3px_0_0_#1d4ed8] active:shadow-none active:translate-y-1 transition-all"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve Route Stitch</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: PROGRESSIVE DISPATCH CONTROLS & LIVE QUEUE ───────── */}
      {activeTab === "dispatch" && (
        <div className="bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 rounded-3xl p-6 shadow-md space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-blue-100 dark:border-blue-900/40">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Congestion Reduction Engine</span>
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                Dynamic Progressive Bus Dispatch
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Dispatches buses progressively as they reach target occupancy to prevent campus bay traffic jams.
              </p>
            </div>

            {/* Config Controls */}
            <div className="flex flex-wrap items-center gap-3 bg-blue-50 dark:bg-slate-800/80 p-3 rounded-2xl border-2 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">
                <span>Threshold:</span>
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={dispatchConfig.min_occupancy_percent}
                  onChange={(e) =>
                    setDispatchConfig({ ...dispatchConfig, min_occupancy_percent: Number(e.target.value) })
                  }
                  className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-center font-mono text-xs font-black text-blue-600"
                />
                <span>%</span>
              </div>

              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">
                <span>Max Wait:</span>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={dispatchConfig.max_wait_minutes}
                  onChange={(e) =>
                    setDispatchConfig({ ...dispatchConfig, max_wait_minutes: Number(e.target.value) })
                  }
                  className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-center font-mono text-xs font-black text-blue-600"
                />
                <span>min</span>
              </div>

              <button
                onClick={handleSaveDispatchConfig}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-[0_2px_0_0_#1d4ed8] active:translate-y-0.5 transition-all"
              >
                Apply Rule
              </button>
            </div>
          </div>

          {/* Dispatch Queue Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dispatchQueue.length === 0 ? (
              <div className="col-span-full text-center py-8 text-xs text-slate-400">
                No active buses currently in departure queue.
              </div>
            ) : (
              dispatchQueue.map((bus) => (
                <div
                  key={bus.id}
                  className={`p-4 rounded-3xl border-2 transition-all ${
                    bus.isReadyToDispatch
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-md"
                      : bus.status === "DISPATCHED"
                      ? "bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-70"
                      : "bg-white dark:bg-slate-800/40 border-blue-100 dark:border-blue-900/60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                        <BusFront className="w-4 h-4 text-blue-600" />
                        <span>{bus.busNumber}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-bold">{bus.routeName}</div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        bus.dispatchStatus === "READY_TO_DISPATCH"
                          ? "bg-emerald-500 text-white animate-pulse shadow-sm"
                          : bus.dispatchStatus === "DISPATCHED"
                          ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {bus.dispatchStatus.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-[11px] font-black">
                      <span className="text-slate-600 dark:text-slate-400">
                        Occupancy: {bus.occupancy} / {bus.capacity} seats
                      </span>
                      <span
                        className={
                          bus.occupancyPercent >= dispatchConfig.min_occupancy_percent
                            ? "text-emerald-600 font-mono"
                            : "text-blue-600 font-mono"
                        }
                      >
                        {bus.occupancyPercent}%
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          bus.occupancyPercent >= dispatchConfig.min_occupancy_percent
                            ? "bg-emerald-500"
                            : "bg-blue-600"
                        }`}
                        style={{ width: `${Math.min(100, bus.occupancyPercent)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 4: DESIGNATED MERGE POINTS REGISTRY ────────────────── */}
      {activeTab === "mergePoints" && (
        <div className="bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 rounded-3xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Designated Route Merge Stops</h2>
              <p className="text-xs text-slate-500">
                Official route stops authorized for passenger consolidation and vehicle standing down.
              </p>
            </div>
            <button
              onClick={() => setAddPointModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-[0_2px_0_0_#1d4ed8] active:translate-y-0.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Configure Merge Stop</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {mergePoints.map((pt) => (
              <div
                key={pt.id}
                className="p-4 rounded-2xl bg-blue-50/50 dark:bg-slate-800/40 border-2 border-blue-100 dark:border-blue-900/60 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-black bg-blue-100 dark:bg-blue-950 px-2.5 py-0.5 rounded text-blue-700 dark:text-blue-300">
                    {pt.code}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold">Active Interchange</span>
                </div>
                <div className="font-black text-slate-900 dark:text-white text-sm">{pt.name}</div>
                <div className="text-[11px] text-slate-500 font-medium">Route: {pt.routeName || pt.routeId}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 5: AUDIT HISTORY & FUEL SAVINGS LEDGER ────────────── */}
      {activeTab === "history" && (
        <div className="bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/60 rounded-3xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Combine Buses Ledger & Fuel Rescued</h2>
              <p className="text-xs text-slate-500">
                Official audit record of approved vehicle disassemblies, stand downs, and verified diesel savings.
              </p>
            </div>
          </div>

          {historySuggestions.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">No past execution logs recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {historySuggestions.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-2xl bg-blue-50/40 dark:bg-slate-800/40 border border-blue-100 dark:border-blue-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          s.status === "APPROVED"
                            ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                            : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
                        }`}
                      >
                        {s.status}
                      </span>
                      <span className="font-black text-slate-900 dark:text-white">
                        {s.sourceBusName} → {s.targetBusName}
                      </span>
                      <span className="text-slate-400 font-medium">({s.routeName})</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Approved by {s.reviewedBy || "Dispatcher"} on{" "}
                      {s.reviewedAt ? new Date(s.reviewedAt).toLocaleString() : s.createdAt}
                    </div>
                  </div>

                  {s.status === "APPROVED" && (
                    <div className="text-emerald-600 dark:text-emerald-400 font-black flex items-center gap-1.5">
                      <Fuel className="w-4 h-4" />
                      <span>Rescued ~{s.fuelSavedLiters || 6.5}L diesel</span>
                    </div>
                  )}

                  {s.status === "REJECTED" && (
                    <div className="text-red-500 text-[11px] italic font-medium">Reason: {s.rejectionReason}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Reject Modal ──────────────────────────────────────────────── */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border-2 border-blue-200 dark:border-blue-800 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white">Reject Combine Suggestion</h3>
            <p className="text-xs text-slate-500">
              Please enter the operational reason for declining this vehicle merge opportunity:
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Driver requested special shift, campus event, maintenance..."
              className="w-full p-3 bg-blue-50/50 dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-2xl text-xs font-medium"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReject}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black shadow-md"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
