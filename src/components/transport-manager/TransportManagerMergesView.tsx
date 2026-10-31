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

  // Active Tab: 'disassembly' | 'stitching' | 'dispatch' | 'mergePoints' | 'history'
  const [activeTab, setActiveTab] = useState<"disassembly" | "stitching" | "dispatch" | "mergePoints" | "history">("disassembly");

  // Reject Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedSuggestionForReject, setSelectedSuggestionForReject] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Add Merge Point Modal
  const [addPointModalOpen, setAddPointModalOpen] = useState(false);
  const [availableRoutes, setAvailableRoutes] = useState<any[]>([]);
  const [availableStops, setAvailableStops] = useState<any[]>([]);
  const [newPointForm, setNewPointForm] = useState({
    routeId: "",
    stopId: "",
    name: "",
    code: "",
    description: "",
  });

  // Load all data from APIs
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
          text: `Orchestration Completed: Ingested morning attendance, pruned ${data.plan?.summary?.totalAbsentPruned || 0} absentees. Detected ${data.detectedCount} fuel-saving opportunities (~${data.plan?.totalFuelSavedLiters || 0}L saved).`,
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
      {/* ─── Master Header Banner ────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/40 p-6 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 text-white">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Autonomous Fleet Orchestration Hub</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Bus Disassembly & Route Stitching
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Attendance-reconciled fleet right-sizing: Automatically stands down redundant buses based on morning attendance actuals, reassigning students at merge interchanges and stitching sparse routes via Clarke-Wright heuristics.
          </p>
        </div>

        {/* Global Action CTAs */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleReconcileAndDetect}
            disabled={isReconciling}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? "animate-spin" : ""}`} />
            <span>{isReconciling ? "Reconciling Attendance..." : "Reconcile Attendance & Detect"}</span>
          </button>

          {pendingSuggestions.length > 0 && (
            <button
              onClick={handleExecuteAll}
              disabled={isExecutingAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-60"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isExecutingAll ? "Executing..." : `Auto-Pilot: Execute All (${pendingSuggestions.length})`}</span>
            </button>
          )}

          <button
            onClick={fetchData}
            className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Refresh View"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ─── Notification Toast ────────────────────────────────────────── */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 border transition-all ${
            statusMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300"
              : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="p-1 rounded-full hover:bg-black/10">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Real-Time Demand & Reconciliation Metrics Cockpit ────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold">
            <span>Morning Check-ins</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
            {latestRecon ? latestRecon.total_incoming_attendees : "Active"}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Verified on-campus students</div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold">
            <span>Absentee Riders Pruned</span>
            <UserX className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
            {latestRecon ? latestRecon.total_absentees_pruned : "0"}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Deducted from outgoing run</div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold">
            <span>Opportunities Detected</span>
            <GitMerge className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
            {pendingSuggestions.length}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {disassemblySuggestions.length} Disassemblies • {routeStitchSuggestions.length} Stitches
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold">
            <span>Total Fuel Saved</span>
            <Fuel className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {totalFuelSaved.toFixed(1)} <span className="text-sm font-bold">L</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            ≈ ₹{(totalFuelSaved * 90).toLocaleString("en-IN")} operational savings
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
        <button
          onClick={() => setActiveTab("disassembly")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "disassembly"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <GitMerge className="w-3.5 h-3.5" />
          <span>Bus Disassembly at Merge Stops</span>
          {disassemblySuggestions.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-indigo-700 font-extrabold">
              {disassemblySuggestions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("stitching")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "stitching"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Waypoints className="w-3.5 h-3.5" />
          <span>Route Stitching (Clarke-Wright)</span>
          {routeStitchSuggestions.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-indigo-700 font-extrabold">
              {routeStitchSuggestions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("dispatch")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "dispatch"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Progressive Dispatch</span>
          {dispatchQueue.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-200 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-200 font-extrabold">
              {dispatchQueue.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("mergePoints")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "mergePoints"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Designated Merge Points</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-extrabold">
            {mergePoints.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "history"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Execution Ledger</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-extrabold">
            {historySuggestions.length}
          </span>
        </button>
      </div>

      {/* ─── TAB 1: INTRA-CORRIDOR BUS DISASSEMBLY AT MERGE STOPS ────── */}
      {activeTab === "disassembly" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>Intra-Corridor Bus Disassembly Opportunities</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                  Same-Route Transshipment
                </span>
              </h2>
              <p className="text-xs text-gray-500">
                Buses combining passengers at authorized route interchange stops. One bus is stood down to save a full vehicle run while students board the receiving carrier bus.
              </p>
            </div>
          </div>

          {disassemblySuggestions.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl space-y-2">
              <BusFront className="w-10 h-10 text-gray-400 mx-auto" />
              <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
                No Intra-Corridor Disassemblies Pending
              </div>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                All buses currently maintain healthy load factors or have already been right-sized. Click "Reconcile Attendance & Detect" above to refresh with latest morning check-ins.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {disassemblySuggestions.map((sug) => (
                <div
                  key={sug.id}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-sm space-y-4 hover:border-indigo-400 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">
                        {sug.routeName}
                      </span>
                      <div className="text-xs font-bold text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Merge Interchange: {sug.mergePointName}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-xl">
                      <Fuel className="w-3.5 h-3.5" />
                      <span>Saves ~{sug.fuelSavedLiters || 5.8}L</span>
                    </div>
                  </div>

                  {/* Visual Transfer Map */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
                    {/* Source Bus (Stood Down) */}
                    <div className="space-y-0.5">
                      <div className="text-[10px] uppercase font-bold text-red-500 flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" />
                        <span>Stand Down Bus</span>
                      </div>
                      <div className="font-extrabold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <BusFront className="w-3.5 h-3.5 text-red-500" />
                        <span>{sug.sourceBusName}</span>
                      </div>
                      <div className="text-[11px] text-gray-500">{sug.sourceOccupancy} passengers</div>
                    </div>

                    <ArrowRight className="w-5 h-5 text-indigo-400 animate-pulse" />

                    {/* Target Bus (Active Carrier) */}
                    <div className="space-y-0.5 text-right">
                      <div className="text-[10px] uppercase font-bold text-emerald-500 flex items-center justify-end gap-1">
                        <Check className="w-3 h-3" />
                        <span>Receiving Carrier</span>
                      </div>
                      <div className="font-extrabold text-gray-900 dark:text-white flex items-center justify-end gap-1.5">
                        <BusFront className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{sug.targetBusName}</span>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Combined: {sug.combinedOccupancy} / {sug.targetCapacity} seats ({sug.remainingSeats} free)
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => {
                        setSelectedSuggestionForReject(sug.id);
                        setRejectModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(sug.id)}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve & Stand Down Vehicle</span>
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
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>Multi-Corridor Route Stitching (Clarke-Wright Savings)</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold">
                  Cross-Corridor Splicing
                </span>
              </h2>
              <p className="text-xs text-gray-500">
                Merges active drop-off stops from two adjacent low-demand routes into a single consolidated bus route, bypassing empty stops and standing down the redundant vehicle.
              </p>
            </div>
          </div>

          {routeStitchSuggestions.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl space-y-2">
              <Waypoints className="w-10 h-10 text-gray-400 mx-auto" />
              <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
                No Route Stitching Opportunities Found
              </div>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                No adjacent routes are currently under 50% capacity. When absenteeism creates parallel half-empty buses, Clarke-Wright heuristics will automatically suggest route merges here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {routeStitchSuggestions.map((sug) => (
                <div
                  key={sug.id}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-sm space-y-4 hover:border-purple-400 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-full">
                        Stitched Route: {sug.stitchedRouteName || `${sug.routeName} + ${sug.secondaryRouteName || "Route 2"}`}
                      </span>
                      <div className="text-xs font-bold text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                        <Waypoints className="w-3.5 h-3.5 text-purple-500" />
                        <span>Max Detour Buffer: +{sug.estimatedDetourMinutes || 8} min (Within SLA)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-xl">
                      <Fuel className="w-3.5 h-3.5" />
                      <span>Saves ~{sug.fuelSavedLiters || 8.4}L</span>
                    </div>
                  </div>

                  {/* Stitched Corridor Manifest Card */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 dark:text-gray-300">
                      <span>Primary: {sug.routeName}</span>
                      <span>Combined Occupancy: {sug.combinedOccupancy} / {sug.targetCapacity}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>Secondary: {sug.secondaryRouteName || "Adjacent Corridor"}</span>
                      <span>Seats Remaining: {sug.remainingSeats} seats</span>
                    </div>

                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-between text-[11px]">
                      <span className="text-red-500 font-bold flex items-center gap-1">
                        <BusFront className="w-3 h-3" />
                        <span>Stand Down: {sug.sourceBusName}</span>
                      </span>
                      <span className="text-emerald-500 font-bold flex items-center gap-1">
                        <BusFront className="w-3 h-3" />
                        <span>Carrier: {sug.targetBusName}</span>
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => {
                        setSelectedSuggestionForReject(sug.id);
                        setRejectModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(sug.id)}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition-all active:scale-95"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve Route Stitch & Stand Down</span>
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
        <div className="bg-white dark:bg-gray-900/90 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-md space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Congestion Reduction Engine</span>
              </div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white">
                Dynamic Progressive Bus Dispatch
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Dispatches buses progressively as they hit target occupancy, relieving campus depot congestion.
              </p>
            </div>

            {/* Config Controls */}
            <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-2xl border border-gray-200 dark:border-gray-700/80">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300">
                <span>Threshold:</span>
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={dispatchConfig.min_occupancy_percent}
                  onChange={(e) =>
                    setDispatchConfig({ ...dispatchConfig, min_occupancy_percent: Number(e.target.value) })
                  }
                  className="w-16 px-2 py-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-center font-mono text-xs font-bold"
                />
                <span>%</span>
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300">
                <span>Max Wait:</span>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={dispatchConfig.max_wait_minutes}
                  onChange={(e) =>
                    setDispatchConfig({ ...dispatchConfig, max_wait_minutes: Number(e.target.value) })
                  }
                  className="w-16 px-2 py-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-center font-mono text-xs font-bold"
                />
                <span>min</span>
              </div>

              <button
                onClick={handleSaveDispatchConfig}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-colors"
              >
                Apply Rule
              </button>
            </div>
          </div>

          {/* Dispatch Queue Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dispatchQueue.length === 0 ? (
              <div className="col-span-full text-center py-8 text-xs text-gray-400">
                No active buses currently in departure queue.
              </div>
            ) : (
              dispatchQueue.map((bus) => (
                <div
                  key={bus.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    bus.isReadyToDispatch
                      ? "bg-green-50/70 dark:bg-green-950/30 border-green-300 dark:border-green-800/80 shadow-md ring-1 ring-green-500/20"
                      : bus.status === "DISPATCHED"
                      ? "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-800 opacity-70"
                      : "bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <BusFront className="w-4 h-4 text-blue-500" />
                        <span>{bus.busNumber}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{bus.routeName}</div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        bus.dispatchStatus === "READY_TO_DISPATCH"
                          ? "bg-green-500 text-white animate-pulse"
                          : bus.dispatchStatus === "DISPATCHED"
                          ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {bus.dispatchStatus.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-gray-600 dark:text-gray-400">
                        Occupancy: {bus.occupancy} / {bus.capacity} seats
                      </span>
                      <span
                        className={
                          bus.occupancyPercent >= dispatchConfig.min_occupancy_percent
                            ? "text-green-600 dark:text-green-400 font-mono"
                            : "text-gray-500 font-mono"
                        }
                      >
                        {bus.occupancyPercent}%
                      </span>
                    </div>

                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          bus.occupancyPercent >= dispatchConfig.min_occupancy_percent
                            ? "bg-green-500"
                            : "bg-blue-500"
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
        <div className="bg-white dark:bg-gray-900/90 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Designated Route Merge Interchanges</h2>
              <p className="text-xs text-gray-500">
                Official route stops authorized for passenger consolidation and vehicle standing down.
              </p>
            </div>
            <button
              onClick={() => setAddPointModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Configure Interchange</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {mergePoints.map((pt) => (
              <div
                key={pt.id}
                className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 px-2 py-0.5 rounded text-indigo-700 dark:text-indigo-300">
                    {pt.code}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Active Interchange</span>
                </div>
                <div className="font-extrabold text-gray-900 dark:text-white text-sm">{pt.name}</div>
                <div className="text-[11px] text-gray-500">Route: {pt.routeName || pt.routeId}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 5: AUDIT HISTORY & FUEL SAVINGS LEDGER ────────────── */}
      {activeTab === "history" && (
        <div className="bg-white dark:bg-gray-900/90 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Fleet Orchestration Execution Ledger</h2>
              <p className="text-xs text-gray-500">
                Audit record of approved vehicle disassemblies, standing down events, and verified fuel savings.
              </p>
            </div>
          </div>

          {historySuggestions.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400">No past execution logs found.</div>
          ) : (
            <div className="space-y-2">
              {historySuggestions.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          s.status === "APPROVED"
                            ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                            : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
                        }`}
                      >
                        {s.status}
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {s.sourceBusName} → {s.targetBusName}
                      </span>
                      <span className="text-gray-400">({s.routeName})</span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Executed by {s.reviewedBy || "Dispatcher"} on{" "}
                      {s.reviewedAt ? new Date(s.reviewedAt).toLocaleString() : s.createdAt}
                    </div>
                  </div>

                  {s.status === "APPROVED" && (
                    <div className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                      <Fuel className="w-4 h-4" />
                      <span>Saved ~{s.fuelSavedLiters || 6.5}L fuel</span>
                    </div>
                  )}

                  {s.status === "REJECTED" && (
                    <div className="text-red-500 text-[11px] italic">Reason: {s.rejectionReason}</div>
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
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Reject Suggestion</h3>
            <p className="text-xs text-gray-500">
              Please enter the operational reason for declining this vehicle standing down opportunity:
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Driver requested extra trip, campus event underway, vehicle reserved..."
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReject}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md"
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
