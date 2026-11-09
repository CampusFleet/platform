"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  MapPin,
  Clock,
  CheckCircle2,
  Users,
  BusFront,
  MessageSquare,
  Sparkles,
  ChevronRight,
  ShieldX,
  Send,
  X,
} from "lucide-react";
import type { BusSecurityIncident, IncidentStatus, SecuritySeverity } from "@/lib/types";

interface SecurityIncidentsCenterViewProps {
  initialIncidents?: BusSecurityIncident[];
}

export function SecurityIncidentsCenterView({
  initialIncidents = [],
}: SecurityIncidentsCenterViewProps) {
  const [incidents, setIncidents] = useState<BusSecurityIncident[]>(initialIncidents);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "ALL">("ALL");
  const [severityFilter, setSeverityFilter] = useState<SecuritySeverity | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIncidentForResolution, setSelectedIncidentForResolution] = useState<BusSecurityIncident | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [isSubmittingResolution, setIsSubmittingResolution] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transport-manager/incidents?limit=100");
      if (!res.ok) throw new Error("Failed to load incidents");
      const data = await res.json();
      if (data.success && Array.isArray(data.incidents)) {
        setIncidents(data.incidents);
      }
    } catch (err: any) {
      console.error("Error fetching incidents:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialIncidents.length === 0) {
      fetchIncidents();
    }

    // Cross-tab real-time sync via BroadcastChannel
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        channel = new BroadcastChannel("campusfleet_security_incidents");
        channel.onmessage = (event) => {
          if (event?.data?.type === "NEW_INCIDENT") {
            fetchIncidents();
          }
        };
      }
    } catch (e) {
      // fallback
    }

    const interval = setInterval(fetchIncidents, 8000);
    return () => {
      clearInterval(interval);
      if (channel) channel.close();
    };
  }, [fetchIncidents, initialIncidents.length]);

  // KPIs
  const stats = useMemo(() => {
    const active = incidents.filter((i) => i.status === "ACTIVE");
    const critical = active.filter((i) => i.severity === "CRITICAL");
    const acknowledged = incidents.filter((i) => i.status === "ACKNOWLEDGED");
    const resolved = incidents.filter((i) => i.status === "RESOLVED");

    return {
      activeCount: active.length,
      criticalCount: critical.length,
      acknowledgedCount: acknowledged.length,
      resolvedCount: resolved.length,
      totalCount: incidents.length,
    };
  }, [incidents]);

  // Filtered List
  const filteredIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      if (statusFilter !== "ALL" && incident.status !== statusFilter) return false;
      if (severityFilter !== "ALL" && incident.severity !== severityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchBus = String(incident.busNumber || incident.busId).toLowerCase().includes(q);
        const matchStop = (incident.stopName || "").toLowerCase().includes(q);
        const matchType = incident.incidentType.toLowerCase().includes(q);
        if (!matchBus && !matchStop && !matchType) return false;
      }
      return true;
    });
  }, [incidents, statusFilter, severityFilter, searchQuery]);

  const handleUpdateStatus = async (
    incidentId: string,
    targetStatus: IncidentStatus,
    notes?: string
  ) => {
    try {
      const res = await fetch(`/api/transport-manager/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus,
          resolutionNotes: notes,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update incident status");
      }

      const updated = await res.json();
      setToastMessage({
        type: "success",
        text: `Incident ${targetStatus === "RESOLVED" ? "resolved" : "acknowledged"} successfully`,
      });
      setTimeout(() => setToastMessage(null), 3000);

      // Refresh list
      setIncidents((prev) =>
        prev.map((item) => (item.id === incidentId ? updated.incident : item))
      );
      setSelectedIncidentForResolution(null);
      setResolutionNotes("");
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Operation failed" });
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleDispatchDriverNotice = (incident: BusSecurityIncident) => {
    // Dispatch notice to driver console
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        const driverChannel = new BroadcastChannel("campusfleet_driver_alerts");
        driverChannel.postMessage({
          type: "SECURITY_INTERCEPT_ORDER",
          busId: incident.busId,
          incidentId: incident.id,
          title: "INTRUDER INTERCEPT ORDER",
          message: `Transport Manager ordered manual ticket verification at stop: ${incident.stopName || "current stop"}.`,
        });
        driverChannel.close();
      }
      setToastMessage({
        type: "success",
        text: `Driver alert dispatched to Bus ${incident.busNumber || incident.busId}`,
      });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (e) {
      console.warn("Broadcast error:", e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* ── TOAST NOTIFICATION ── */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-2 ${
            toastMessage.type === "success"
              ? "bg-emerald-900 border border-emerald-500 text-emerald-100"
              : "bg-rose-900 border border-rose-500 text-rose-100"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-bold">{toastMessage.text}</span>
        </div>
      )}

      {/* ── HEADER & REFRESH ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Autonomous Transit Security Center
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  LIVE TELEMATICS
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Real-Time Intruder Interception • Gate Biometrics Forensics • Zero-Touch Commuter Protection
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => fetchIncidents()}
            disabled={loading}
            className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-bold shadow-xs transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-rose-600 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Incidents</span>
          </button>

          <Link
            href="/transport-manager/live"
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-2"
          >
            <Radio className="w-4 h-4" />
            <span>Live Fleet Radar</span>
          </Link>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Active Threats */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Threats
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-rose-600 dark:text-rose-400">
              {stats.activeCount}
            </span>
            <span className="text-xs text-rose-500 font-bold">
              ({stats.criticalCount} Critical)
            </span>
          </div>
        </div>

        {/* Acknowledged */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Under Review
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-amber-600 dark:text-amber-400">
              {stats.acknowledgedCount}
            </span>
            <span className="text-xs text-slate-400">Acknowledged</span>
          </div>
        </div>

        {/* Resolved Today */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Resolved
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
              {stats.resolvedCount}
            </span>
            <span className="text-xs text-emerald-500 font-bold">Closed</span>
          </div>
        </div>

        {/* Total Interceptions */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Recorded
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
              {stats.totalCount}
            </span>
            <span className="text-xs text-slate-400">All-time</span>
          </div>
        </div>
      </div>

      {/* ── FILTERS & SEARCH TOOLBAR ── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* Status Tabs */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl w-full md:w-auto overflow-x-auto">
          {(["ALL", "ACTIVE", "ACKNOWLEDGED", "RESOLVED"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {tab === "ALL" ? "All Incidents" : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Severity filter & Search input */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">🔴 Critical</option>
            <option value="HIGH">🟠 High</option>
            <option value="MEDIUM">🟡 Medium</option>
            <option value="LOW">⚪ Low</option>
          </select>

          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by bus, stop, type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* ── INCIDENTS LIST ── */}
      {filteredIncidents.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            All Fleet Gates Secure
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            No security incidents match the current filters. All autonomous boarding telematics are operating cleanly.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredIncidents.map((incident) => {
            const isCritical = incident.severity === "CRITICAL";
            const isActive = incident.status === "ACTIVE";

            return (
              <div
                key={incident.id}
                className={`p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border transition-all shadow-xs ${
                  isActive && isCritical
                    ? "border-rose-400/80 dark:border-rose-700/80 ring-2 ring-rose-500/10"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  {/* Left: Incident info */}
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-3 rounded-2xl shrink-0 ${
                        isCritical
                          ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                          : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                      }`}
                    >
                      <ShieldAlert className="w-6 h-6" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isCritical
                              ? "bg-rose-600 text-white"
                              : "bg-amber-500 text-white"
                          }`}
                        >
                          {incident.severity}
                        </span>

                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {incident.incidentType.replace(/_/g, " ")}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            incident.status === "ACTIVE"
                              ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                              : incident.status === "ACKNOWLEDGED"
                              ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          }`}
                        >
                          ● {incident.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-sm font-black text-slate-900 dark:text-white pt-1">
                        <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                          <BusFront className="w-4 h-4" />
                          <span>Bus {incident.busNumber || incident.busId}</span>
                        </span>
                        {incident.busRegistrationNo && (
                          <span className="text-xs font-mono font-normal text-slate-400">
                            ({incident.busRegistrationNo})
                          </span>
                        )}
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-rose-500" />
                          <span>{incident.stopName || "Stop Location Unknown"}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-0.5 flex-wrap">
                        <span className="font-mono">
                          GPS: {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          View Map <ExternalLink className="w-3 h-3" />
                        </a>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(incident.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}{" "}
                          ({new Date(incident.createdAt).toLocaleDateString()})
                        </span>
                      </div>

                      {incident.resolutionNotes && (
                        <div className="mt-2 text-xs bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                          <strong>Resolution Notes:</strong> {incident.resolutionNotes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleDispatchDriverNotice(incident)}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                      title="Dispatch real-time warning to driver console"
                    >
                      <Send className="w-3.5 h-3.5 text-blue-500" />
                      <span>Alert Driver</span>
                    </button>

                    {incident.status === "ACTIVE" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(incident.id, "ACKNOWLEDGED")}
                        className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>Acknowledge</span>
                      </button>
                    )}

                    {incident.status !== "RESOLVED" && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIncidentForResolution(incident);
                          setResolutionNotes("");
                        }}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Resolve Incident</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── RESOLUTION MODAL ── */}
      {selectedIncidentForResolution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Resolve Security Incident
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIncidentForResolution(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Provide operator resolution details for Bus{" "}
              {selectedIncidentForResolution.busNumber || selectedIncidentForResolution.busId} at{" "}
              {selectedIncidentForResolution.stopName || "Route Stop"}.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Resolution Notes & Disposition
              </label>
              <textarea
                rows={3}
                placeholder="e.g., Driver verified student identity with physical badge; admitted as guest faculty; intruder instructed to step off."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedIncidentForResolution(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isSubmittingResolution}
                onClick={async () => {
                  setIsSubmittingResolution(true);
                  await handleUpdateStatus(
                    selectedIncidentForResolution.id,
                    "RESOLVED",
                    resolutionNotes || "Resolved by Transport Manager"
                  );
                  setIsSubmittingResolution(false);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
              >
                {isSubmittingResolution ? "Saving..." : "Confirm & Close Incident"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
