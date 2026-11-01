"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Cpu,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Plus,
  X,
  Bus as BusIcon,
  Check,
  Zap,
  Radio,
  Clock,
  ArrowRight,
  ShieldCheck,
  Power,
} from "lucide-react";
import type { Bus, Route, Stop } from "@/lib/types";

export interface ESP32CardHolderIssuanceViewProps {
  initialBuses?: Bus[];
  initialRoutes?: Route[];
  initialStops?: Stop[];
}

interface DetectedESP32 {
  deviceId: string;
  detectedAt: string;
  lastCardUid?: string | null;
  busId?: number | null;
  busNumber?: number | string | null;
}

interface HardwareStatus {
  deviceId: string;
  busId: number;
  busNumber: number;
  isMapped: boolean;
  lastSeen: string;
}

export default function ESP32CardHolderIssuanceView({
  initialBuses = [],
  initialRoutes = [],
  initialStops = [],
}: ESP32CardHolderIssuanceViewProps) {
  const [buses, setBuses] = useState<Bus[]>(initialBuses);
  const [routes] = useState<Route[]>(initialRoutes);
  const [stops] = useState<Stop[]>(initialStops);

  // Unassigned ESP32 readers detected on the network (newest first)
  const [unmappedDevices, setUnmappedDevices] = useState<DetectedESP32[]>([]);
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [lastPollTime, setLastPollTime] = useState<Date>(new Date());

  // Search & Filter state
  const [filterQuery, setFilterQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "DETECTED" | "ASSIGNED">("ALL");

  // Assignment Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [activeDeviceToAssign, setActiveDeviceToAssign] = useState<string>("");
  const [selectedBusForAssign, setSelectedBusForAssign] = useState<Bus | null>(null);
  const [busSearchInput, setBusSearchInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual Add Device Modal State
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualDeviceInput, setManualDeviceInput] = useState("");

  // Toast notification
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

function formatTimeAgo(isoString?: string | null): string {
  if (!isoString) return "";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

  const isHardwareActive = useMemo(() => {
    if (!hardwareStatus?.lastSeen) return false;
    const diffMs = Date.now() - new Date(hardwareStatus.lastSeen).getTime();
    return diffMs < 45 * 1000; // Active if packet received within 45 seconds
  }, [hardwareStatus, lastPollTime]);

  // Poll for newly detected ESP32 devices & live telematics status every 1.5 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const fetchLatestHardware = async () => {
      try {
        const res = await fetch(`/api/telematics/rfid/latest-tap?_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.unmappedDevices)) {
            setUnmappedDevices(data.unmappedDevices);
          }
          if (Array.isArray(data.buses)) {
            setBuses(data.buses);
          }
          setHardwareStatus(data.hardwareStatus || null);
          setLastPollTime(new Date());
        }
      } catch (err) {
        // silent fallback
      }
    };

    fetchLatestHardware();
    if (isPolling) {
      interval = setInterval(fetchLatestHardware, 1500);
    }
    return () => clearInterval(interval);
  }, [isPolling]);

  // Open modal to assign a bus to a specific ESP32 Device ID / MAC
  const handleOpenAssignModal = (deviceId: string, preselectedBusId?: number) => {
    setActiveDeviceToAssign(deviceId);
    const existingBus = preselectedBusId !== undefined
      ? buses.find((b) => b.id === preselectedBusId)
      : buses.find((b) => b.rfidDeviceId === deviceId);

    setSelectedBusForAssign(existingBus || null);
    setBusSearchInput(existingBus ? String(existingBus.busNumber) : "");
    setAssignModalOpen(true);
  };

  // Submit device-to-bus assignment
  const handleConfirmAssign = async () => {
    if (!selectedBusForAssign) {
      showToast("error", "Please select a bus asset to pair with this reader.");
      return;
    }
    if (!activeDeviceToAssign.trim()) {
      showToast("error", "Missing ESP32 Device ID or MAC Address.");
      return;
    }

    try {
      setIsSubmitting(true);
      const cleanDeviceId = activeDeviceToAssign.trim();
      const res = await fetch("/api/telematics/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId: selectedBusForAssign.id,
          deviceId: cleanDeviceId,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        showToast("error", data.error || data.message || "Failed to pair ESP32 reader.");
        return;
      }

      // Update buses in local state
      setBuses((prev) =>
        prev.map((b) => {
          if (b.id === selectedBusForAssign.id) {
            return {
              ...b,
              rfidDeviceId: cleanDeviceId,
            };
          }
          if (b.rfidDeviceId === cleanDeviceId && b.id !== selectedBusForAssign.id) {
            return { ...b, rfidDeviceId: undefined };
          }
          return b;
        })
      );

      // Remove from unmapped detected list
      setUnmappedDevices((prev) => prev.filter((d) => d.deviceId !== cleanDeviceId));

      // Update live hardwareStatus if applicable
      if (hardwareStatus && hardwareStatus.deviceId === cleanDeviceId) {
        setHardwareStatus({
          ...hardwareStatus,
          busId: selectedBusForAssign.id,
          busNumber: selectedBusForAssign.busNumber,
          isMapped: true,
        });
      }

      setAssignModalOpen(false);
      showToast(
        "success",
        `✓ ESP32 Reader [${cleanDeviceId}] assigned to ${selectedBusForAssign.busNumber}!`
      );
    } catch (err: any) {
      showToast("error", err.message || "Network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Unlink/clear an ESP32 reader from a bus
  const handleUnlinkDevice = async (busId: number, deviceId: string) => {
    if (!confirm(`Are you sure you want to unbind ESP32 reader [${deviceId}] from this bus?`)) {
      return;
    }

    try {
      const res = await fetch("/api/telematics/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId,
          deviceId: null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBuses((prev) =>
          prev.map((b) => (b.id === busId ? { ...b, rfidDeviceId: undefined } : b))
        );
        if (deviceId) {
          setUnmappedDevices((prev) => [
            {
              deviceId,
              detectedAt: new Date().toISOString(),
              lastCardUid: null,
            },
            ...prev.filter((d) => d.deviceId !== deviceId),
          ]);
        }
        if (hardwareStatus && (hardwareStatus.deviceId === deviceId || hardwareStatus.busId === busId)) {
          setHardwareStatus({
            ...hardwareStatus,
            busId: -1,
            busNumber: -1,
            isMapped: false,
          });
        }
        showToast("info", `✓ ESP32 reader unlinked and moved to detected list.`);
      }
    } catch (err: any) {
      showToast("error", "Failed to unlink reader.");
    }
  };

  // Dismiss / delete unmapped ESP32 tap from memory
  const handleDeleteUnmappedDevice = async (deviceId: string) => {
    try {
      setUnmappedDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
      await fetch(
        `/api/telematics/rfid/latest-tap?deviceId=${encodeURIComponent(deviceId)}`,
        { method: "DELETE" }
      );
      showToast("info", `Device ${deviceId} dismissed from detected list.`);
    } catch (_) {}
  };

  // Submit manually entered Device ID or MAC
  const handleConfirmManualDevice = () => {
    const clean = manualDeviceInput.trim();
    if (!clean) {
      showToast("error", "Please enter a valid Device ID or MAC Address.");
      return;
    }
    setManualModalOpen(false);
    setManualDeviceInput("");
    handleOpenAssignModal(clean);
  };

  // Filtered bus list for the assignment modal
  const filteredBusesForModal = useMemo(() => {
    if (!busSearchInput.trim()) return buses.slice(0, 10);
    const q = busSearchInput.toLowerCase().trim();
    return buses.filter(
      (b) =>
        String(b.busNumber).includes(q) ||
        b.registrationNo?.toLowerCase().includes(q) ||
        b.model?.toLowerCase().includes(q) ||
        b.rfidDeviceId?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [buses, busSearchInput]);

  // Buses with assigned readers
  const assignedBusesList = useMemo(() => {
    return buses.filter((b) => Boolean(b.rfidDeviceId));
  }, [buses]);

  // Only devices that are NOT mapped to any bus in the fleet (guarantees zero duplication)
  const validUnmappedDevices = useMemo(() => {
    const mappedMacs = new Set(
      buses
        .map((b) => (b.rfidDeviceId ? b.rfidDeviceId.toLowerCase().trim() : null))
        .filter(Boolean)
    );
    return unmappedDevices.filter(
      (d) => d.deviceId && !mappedMacs.has(d.deviceId.toLowerCase().trim())
    );
  }, [unmappedDevices, buses]);

  // Combined search filtering for main table
  const filteredUnmapped = useMemo(() => {
    if (!filterQuery.trim()) return validUnmappedDevices;
    const q = filterQuery.toLowerCase().trim();
    return validUnmappedDevices.filter((d) => d.deviceId?.toLowerCase().includes(q));
  }, [validUnmappedDevices, filterQuery]);

  const filteredAssigned = useMemo(() => {
    if (!filterQuery.trim()) return assignedBusesList;
    const q = filterQuery.toLowerCase().trim();
    return assignedBusesList.filter(
      (b) =>
        String(b.busNumber).includes(q) ||
        b.registrationNo?.toLowerCase().includes(q) ||
        b.rfidDeviceId?.toLowerCase().includes(q) ||
        b.model?.toLowerCase().includes(q)
    );
  }, [assignedBusesList, filterQuery]);

  // Resolve currently active bus from hardwareStatus deviceId or busId
  const activeMappedBus = useMemo(() => {
    if (!hardwareStatus?.deviceId) return null;
    const cleanMac = hardwareStatus.deviceId.toLowerCase().trim();
    return buses.find((b) => b.rfidDeviceId && b.rfidDeviceId.toLowerCase().trim() === cleanMac) || null;
  }, [hardwareStatus, buses]);

  const isCurrentlyMapped = Boolean(
    activeMappedBus || (hardwareStatus?.isMapped && hardwareStatus?.busNumber && hardwareStatus?.busId > 0)
  );
  const activeBusNumber = activeMappedBus?.busNumber || hardwareStatus?.busNumber;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl text-sm font-bold text-white transition-all transform animate-in fade-in slide-in-from-bottom-5 ${
            toast.type === "success"
              ? "bg-emerald-600"
              : toast.type === "error"
              ? "bg-rose-600"
              : "bg-gray-800"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : toast.type === "error" ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Zap className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Primary Mode Switcher: RFID Cards vs ESP32 Readers */}
      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl w-fit">
        <Link
          href="/transport-admin/rfid"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-all"
        >
          <Radio className="w-4 h-4" />
          <span>RFID Smart Cards</span>
        </Link>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm transition-all">
          <Cpu className="w-4 h-4" />
          <span>ESP32 Bus Readers</span>
          {validUnmappedDevices.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black animate-pulse">
              {validUnmappedDevices.length} New
            </span>
          )}
        </div>
      </div>

      {/* Clean Modern Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                ESP32 IoT Bus Readers
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                New signals from ESP32 microcontrollers appear at the top. Assign readers to buses with 1 click.
              </p>
            </div>
          </div>
        </div>

        {/* Live Hardware Status & Manual Add */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800 px-3.5 py-2 rounded-2xl border border-gray-200 dark:border-gray-700">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {isHardwareActive && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isHardwareActive ? "bg-emerald-500" : "bg-gray-400"
                }`}
              ></span>
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                {isHardwareActive
                  ? (isCurrentlyMapped
                      ? `Live: Bus ${activeBusNumber}`
                      : "ESP32 Active (Unassigned)")
                  : (isCurrentlyMapped
                      ? `Offline: Bus ${activeBusNumber}`
                      : "ESP32 Standby (Offline)")}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
                {hardwareStatus?.deviceId
                  ? `ID: ${hardwareStatus.deviceId} • ${isHardwareActive ? "Active now" : `Last seen ${formatTimeAgo(hardwareStatus.lastSeen)}`}`
                  : "Waiting for signal..."}
              </span>
            </div>
            {hardwareStatus && (
              <button
                onClick={async () => {
                  await fetch("/api/telematics/rfid/latest-tap?clearStatus=true", { method: "DELETE" });
                  setHardwareStatus(null);
                  showToast("info", "Heartbeat cache cleared.");
                }}
                className="ml-1 p-1 text-gray-400 hover:text-rose-500 rounded-lg transition-colors"
                title="Reset/Clear heartbeat status"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setManualModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Enter MAC/ID</span>
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        {/* Toolbar: Search + Filter Tabs */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "ALL"
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All Readers ({validUnmappedDevices.length + assignedBusesList.length})
            </button>
            <button
              onClick={() => setActiveTab("DETECTED")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "DETECTED"
                  ? "bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>New Devices ({validUnmappedDevices.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("ASSIGNED")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "ASSIGNED"
                  ? "bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Paired Buses ({assignedBusesList.length})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search MAC, bus number, reg..."
              className="w-full text-xs pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50/70 dark:bg-gray-800/50 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="p-3.5">ESP32 Device ID / MAC</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Assigned Bus</th>
                <th className="p-3.5">Registration No</th>
                <th className="p-3.5">Capacity & Model</th>
                <th className="p-3.5">Current Route</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {/* 1. NEW UNMAPPED ESP32 DEVICES (Always Top) */}
              {(activeTab === "ALL" || activeTab === "DETECTED") &&
                filteredUnmapped.map((device) => (
                  <tr
                    key={device.deviceId}
                    className="bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                  >
                    {/* Device ID / MAC with energetic pulse */}
                    <td className="p-3.5">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 font-mono font-black text-xs">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        <span>{device.deviceId}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="p-3.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-[10px] font-black uppercase tracking-wider">
                        New ESP32 • Pending
                      </span>
                      <div className="text-[10px] text-gray-400 mt-0.5 font-medium">
                        <span suppressHydrationWarning>
                          {mounted && device.detectedAt
                            ? new Date(device.detectedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })
                            : "--:--:--"}
                        </span>
                        {device.lastCardUid && (
                          <span className="ml-1 text-[9px] text-gray-400 font-mono">
                            (Card: {device.lastCardUid})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Bus Placeholder */}
                    <td className="p-3.5 text-gray-400 italic font-medium">
                      Not assigned yet
                    </td>
                    <td className="p-3.5 text-gray-400">—</td>
                    <td className="p-3.5 text-gray-400">—</td>
                    <td className="p-3.5 text-gray-400">—</td>

                    {/* Actions: Assign Bus or Delete */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenAssignModal(device.deviceId)}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                        >
                          <BusIcon className="w-3.5 h-3.5" />
                          <span>Assign Bus</span>
                        </button>
                        <button
                          onClick={() => handleDeleteUnmappedDevice(device.deviceId)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          title="Dismiss / Delete detected device"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {/* 2. ASSIGNED PAIRED BUSES */}
              {(activeTab === "ALL" || activeTab === "ASSIGNED") &&
                filteredAssigned.map((bus) => {
                  const isReportingLive =
                    isHardwareActive &&
                    (hardwareStatus?.busId === bus.id ||
                      Boolean(
                        hardwareStatus?.deviceId &&
                          bus.rfidDeviceId &&
                          hardwareStatus.deviceId.toLowerCase().trim() === bus.rfidDeviceId.toLowerCase().trim()
                      ));
                  const assignedRoute = routes.find((r) => r.id === bus.currentRouteId);

                  return (
                    <tr
                      key={bus.id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Paired Device ID */}
                      <td className="p-3.5">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 font-mono font-black text-xs">
                          <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>{bus.rfidDeviceId}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        {isReportingLive ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Live Active
                          </span>
                        ) : (
                          <div className="flex flex-col">
                            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                              Offline / Standby
                            </span>
                            {hardwareStatus?.busId === bus.id && hardwareStatus?.lastSeen && (
                              <span className="text-[9px] text-gray-400 mt-0.5 font-medium">
                                Last seen {formatTimeAgo(hardwareStatus.lastSeen)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Assigned Bus Details */}
                      <td className="p-3.5">
                        <div className="font-black text-gray-900 dark:text-white text-xs">
                          Bus {bus.busNumber}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {bus.model || "Standard Bus"}
                        </div>
                      </td>

                      {/* Registration */}
                      <td className="p-3.5 font-mono text-xs font-bold text-gray-700 dark:text-gray-300">
                        {bus.registrationNo || "—"}
                      </td>

                      {/* Capacity & Model */}
                      <td className="p-3.5 text-xs text-gray-600 dark:text-gray-400">
                        {bus.capacity} Seats ({bus.seatLayout || "2x2"})
                      </td>

                      {/* Route */}
                      <td className="p-3.5 text-xs text-gray-600 dark:text-gray-400">
                        {assignedRoute?.name || "Unassigned Corridor"}
                      </td>

                      {/* Actions: Reassign / Unlink */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() =>
                              handleOpenAssignModal(bus.rfidDeviceId!, bus.id)
                            }
                            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold transition-all"
                          >
                            Reassign
                          </button>
                          <button
                            onClick={() =>
                              handleUnlinkDevice(bus.id, bus.rfidDeviceId!)
                            }
                            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            title="Unlink reader from bus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {/* Empty State */}
              {filteredUnmapped.length === 0 && filteredAssigned.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-400">
                    <Cpu className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-bold">No ESP32 readers found</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Power on an ESP32 hardware unit or click &quot;Enter MAC/ID&quot; to pair manually.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL: ASSIGN ESP32 READER TO BUS ASSET ──────────────────────────── */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                  <BusIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900 dark:text-white">
                    Assign ESP32 Reader to Bus
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">
                    Hardware MAC/ID: {activeDeviceToAssign}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bus Asset */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Search Fleet Bus
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={busSearchInput}
                  onChange={(e) => setBusSearchInput(e.target.value)}
                  placeholder="Type bus number, registration, model..."
                  className="w-full text-xs pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Selectable Bus List */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Select Target Bus ({filteredBusesForModal.length})
              </label>
              <div className="max-h-56 overflow-y-auto space-y-1.5 border border-gray-200 dark:border-gray-800 rounded-2xl p-1.5">
                {filteredBusesForModal.map((b) => {
                  const isSelected = selectedBusForAssign?.id === b.id;
                  const alreadyHasReader =
                    b.rfidDeviceId && b.rfidDeviceId !== activeDeviceToAssign;

                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBusForAssign(b)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-500 shadow-sm"
                          : "bg-white dark:bg-gray-800/60 border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-xl ${
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          <BusIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-black text-xs text-gray-900 dark:text-white">
                            {b.busNumber}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {b.registrationNo} • {b.capacity} Seats ({b.model})
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {alreadyHasReader ? (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                            Replaces [{b.rfidDeviceId}]
                          </span>
                        ) : isSelected ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-blue-600 dark:text-blue-400">
                            <Check className="w-3.5 h-3.5" /> Selected
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">
                            Available
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredBusesForModal.length === 0 && (
                  <div className="p-4 text-center text-xs text-gray-400">
                    No matching bus assets found.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAssign}
                disabled={isSubmitting || !selectedBusForAssign}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Confirm & Assign to Bus</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: MANUALLY ENTER ESP32 MAC / DEVICE ID ──────────────────────── */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-black text-sm text-gray-900 dark:text-white">
                Enter ESP32 Hardware ID
              </h3>
              <button
                onClick={() => setManualModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                MAC Address or Hardware Device ID
              </label>
              <input
                type="text"
                value={manualDeviceInput}
                onChange={(e) => setManualDeviceInput(e.target.value)}
                placeholder="e.g. 24:6F:28:AB:12:CD or ESP32-GATE-01"
                className="w-full text-sm font-mono font-bold tracking-wider px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="px-3.5 py-2 text-xs font-bold text-gray-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmManualDevice}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <span>Next: Select Bus</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
