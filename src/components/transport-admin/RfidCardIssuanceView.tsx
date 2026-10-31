"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Radio,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  UserCheck,
  UserPlus,
  Plus,
  X,
  MapPin,
  Lock,
  Zap,
  Check,
  Cpu,
  User,
  Settings,
  Wifi,
  Laptop,
  ArrowRight,
} from "lucide-react";
import type { Student, Stop, Route, Bus } from "@/lib/types";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { CustomDropdown } from "@/components/common/CustomDropdown";

export interface RfidCardIssuanceViewProps {
  initialStudents?: Student[];
  initialStops?: Stop[];
  initialRoutes?: Route[];
  initialBuses?: Bus[];
}

interface DetectedCard {
  rfidCardId: string;
  busId: number;
  busNumber?: number;
  deviceId?: string;
  scannedAt: string;
}

interface HardwareStatus {
  deviceId: string;
  busId: number;
  busNumber: number;
  isMapped: boolean;
  lastSeen: string;
}

function StudentPhotoBadge({
  photoUrl,
  name,
  className = "w-7 h-7 rounded-lg",
}: {
  photoUrl?: string | null;
  name: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const safeUrl = getSafePhotoUrl(photoUrl);

  const initials = (name || "S")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (!safeUrl || hasError) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-[10px] shadow-sm select-none shrink-0 border border-blue-400/30`}
      >
        {initials || "S"}
      </div>
    );
  }

  return (
    <img
      src={safeUrl}
      alt={name}
      onError={() => setHasError(true)}
      className={`${className} object-cover bg-gray-100 shrink-0 border border-gray-200 dark:border-gray-700`}
    />
  );
}

export default function RfidCardIssuanceView({
  initialStudents = [],
  initialStops = [],
  initialRoutes = [],
  initialBuses = [],
}: RfidCardIssuanceViewProps) {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [stops] = useState<Stop[]>(initialStops);
  const [routes] = useState<Route[]>(initialRoutes);
  const [buses, setBuses] = useState<Bus[]>(initialBuses);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Unassigned cards detected by ESP32 (newest first)
  const [unmappedCards, setUnmappedCards] = useState<DetectedCard[]>([]);
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [lastPollTime, setLastPollTime] = useState<Date>(new Date());

  // Search & Filter state
  const [filterQuery, setFilterQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "DETECTED" | "ASSIGNED">("ALL");

  // Assignment Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [activeCardToAssign, setActiveCardToAssign] = useState<string>("");
  const [selectedStudentForAssign, setSelectedStudentForAssign] = useState<Student | null>(null);
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentIdInput, setStudentIdInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual Add Card Modal State
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualUidInput, setManualUidInput] = useState("");

  // Device-to-Bus Pairing Modal State
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [selectedBusForDevice, setSelectedBusForDevice] = useState<number>(-1);
  const [deviceIdInput, setDeviceIdInput] = useState<string>("");
  const [isSavingDevice, setIsSavingDevice] = useState(false);

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

  // Poll for newly tapped cards from ESP32 every 1.5 seconds with zero caching
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const fetchLatestTaps = async () => {
      try {
        const res = await fetch(`/api/telematics/rfid/latest-tap?_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.unmappedList)) {
            setUnmappedCards(data.unmappedList);
          }
          setHardwareStatus(data.hardwareStatus || null);
          setLastPollTime(new Date());
        }
      } catch (err) {
        // silent fallback
      }
    };

    fetchLatestTaps();
    if (isPolling) {
      interval = setInterval(fetchLatestTaps, 1500);
    }
    return () => clearInterval(interval);
  }, [isPolling]);

  // Open modal to assign student to a specific card UID
  const handleOpenAssignModal = (cardUid: string, preselectedStudentId?: string) => {
    setActiveCardToAssign(cardUid);
    const existingStudent = preselectedStudentId
      ? students.find((s) => s.id === preselectedStudentId)
      : students.find((s) => s.rfidCardId === cardUid);

    setSelectedStudentForAssign(existingStudent || null);
    setStudentSearchInput(existingStudent ? existingStudent.fullName : "");
    setStudentIdInput(existingStudent?.studentIdCode || "");
    setAssignModalOpen(true);
  };

  // Submit student assignment to card
  const handleConfirmAssign = async () => {
    if (!selectedStudentForAssign) {
      showToast("error", "Please select a student to assign this card to.");
      return;
    }
    if (!activeCardToAssign.trim()) {
      showToast("error", "Missing card UID.");
      return;
    }

    try {
      setIsSubmitting(true);
      const cleanRfid = activeCardToAssign.trim().toUpperCase();
      const res = await fetch("/api/telematics/rfid/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudentForAssign.id,
          rfidCardId: cleanRfid,
          studentIdCode: studentIdInput.trim() || undefined,
          forceReassign: true,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        showToast("error", data.error || data.message || "Failed to assign card.");
        return;
      }

      // Update student in local state across all matching student rows
      setStudents((prev) =>
        prev.map((s) => {
          if (
            s.id === selectedStudentForAssign.id ||
            (selectedStudentForAssign.userId && s.userId === selectedStudentForAssign.userId)
          ) {
            return {
              ...s,
              rfidCardId: cleanRfid,
              studentIdCode: studentIdInput.trim() || s.studentIdCode,
            };
          }
          if (
            s.rfidCardId === cleanRfid &&
            s.id !== selectedStudentForAssign.id &&
            (!selectedStudentForAssign.userId || s.userId !== selectedStudentForAssign.userId)
          ) {
            return { ...s, rfidCardId: undefined };
          }
          return s;
        })
      );

      // Remove from unmapped detected list
      setUnmappedCards((prev) => prev.filter((c) => c.rfidCardId !== cleanRfid));

      setAssignModalOpen(false);
      showToast("success", `✓ Card ${cleanRfid} assigned to ${selectedStudentForAssign.fullName}!`);
    } catch (err: any) {
      showToast("error", err.message || "Network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete card from student (Unlink)
  const handleDeleteStudentCard = async (student: Student) => {
    if (!student.rfidCardId) return;
    if (!confirm(`Are you sure you want to delete and unlink RFID card [${student.rfidCardId}] from ${student.fullName}?`)) return;

    const oldCard = student.rfidCardId;
    // Optimistic instant UI update
    setStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...s, rfidCardId: undefined } : s))
    );

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/telematics/rfid/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          rfidCardId: null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast("success", `✓ Card ${oldCard} deleted from ${student.fullName}.`);
      } else {
        // Rollback on failure
        setStudents((prev) =>
          prev.map((s) => (s.id === student.id ? { ...s, rfidCardId: oldCard } : s))
        );
        showToast("error", data.error || "Failed to delete card.");
      }
    } catch (e: any) {
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, rfidCardId: oldCard } : s))
      );
      showToast("error", e.message || "Failed to delete card.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dismiss/delete an unassigned card from the detected list
  const handleDeleteUnmappedCard = async (rfidCardId: string) => {
    // Optimistic instant UI update
    setUnmappedCards((prev) => prev.filter((c) => c.rfidCardId !== rfidCardId));
    try {
      const res = await fetch(`/api/telematics/rfid/latest-tap?rfidCardId=${rfidCardId}&_t=${Date.now()}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.unmappedList)) {
        setUnmappedCards(data.unmappedList);
      }
      showToast("info", `Card ${rfidCardId} deleted.`);
    } catch (_) {}
  };

  // Submit manually entered card
  const handleConfirmManualCard = () => {
    const clean = manualUidInput.trim().toUpperCase();
    if (!clean) {
      showToast("error", "Please enter a valid Hexadecimal Card UID.");
      return;
    }
    setManualModalOpen(false);
    setManualUidInput("");
    handleOpenAssignModal(clean);
  };

  // Save or update ESP32 device-to-bus mapping
  const handleSaveDeviceMapping = async () => {
    if (selectedBusForDevice <= 0) {
      showToast("error", "Please select a bus asset.");
      return;
    }

    try {
      setIsSavingDevice(true);
      const cleanDevice = deviceIdInput.trim();
      const res = await fetch("/api/telematics/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId: selectedBusForDevice,
          deviceId: cleanDevice || null,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        showToast("error", data.error || "Failed to pair ESP32 reader.");
        return;
      }

      // Update local buses state
      setBuses((prev) =>
        prev.map((b) => {
          if (b.id === selectedBusForDevice) {
            return { ...b, rfidDeviceId: cleanDevice || undefined };
          }
          if (cleanDevice && b.rfidDeviceId === cleanDevice && b.id !== selectedBusForDevice) {
            return { ...b, rfidDeviceId: undefined };
          }
          return b;
        })
      );

      // If mapped bus matches active hardwareStatus, update it
      if (hardwareStatus && (hardwareStatus.deviceId === cleanDevice || hardwareStatus.busId === selectedBusForDevice)) {
        setHardwareStatus({
          ...hardwareStatus,
          busId: selectedBusForDevice,
          busNumber: Number(data.bus?.bus_number) || selectedBusForDevice,
          isMapped: Boolean(cleanDevice),
        });
      }

      setDeviceModalOpen(false);
      showToast("success", data.message || "✓ ESP32 reader paired successfully!");
    } catch (err: any) {
      showToast("error", err.message || "An error occurred.");
    } finally {
      setIsSavingDevice(false);
    }
  };

  // Filtered student search inside the assignment modal
  const searchResultsForModal = useMemo(() => {
    if (!studentSearchInput.trim()) return students.slice(0, 10);
    const q = studentSearchInput.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.fullName?.toLowerCase().includes(q) ||
        s.studentIdCode?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.className?.toLowerCase().includes(q) ||
        s.department?.toLowerCase().includes(q) ||
        s.courseName?.toLowerCase().includes(q) ||
        s.courseCode?.toLowerCase().includes(q) ||
        s.branchName?.toLowerCase().includes(q) ||
        (s as any).course?.toLowerCase().includes(q) ||
        (s as any).branch?.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [students, studentSearchInput]);

  // Combined Unified List:
  // 1. Newly detected unassigned cards appear FIRST at the top of the list!
  // 2. Then all assigned student cards!
  const assignedCardsList = useMemo(() => {
    const seen = new Set<string>();
    const list: Student[] = [];
    for (const s of students) {
      if (!s.rfidCardId) continue;
      const key = `${s.rfidCardId}:${s.userId || s.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(s);
      }
    }
    return list;
  }, [students]);

  const filteredUnmapped = useMemo(() => {
    if (!filterQuery.trim()) return unmappedCards;
    const q = filterQuery.toLowerCase().trim();
    return unmappedCards.filter((c) => c.rfidCardId.toLowerCase().includes(q) || String(c.busId).includes(q));
  }, [unmappedCards, filterQuery]);

  const filteredAssigned = useMemo(() => {
    if (!filterQuery.trim()) return assignedCardsList;
    const q = filterQuery.toLowerCase().trim();
    return assignedCardsList.filter(
      (s) =>
        s.rfidCardId?.toLowerCase().includes(q) ||
        s.fullName?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.studentIdCode?.toLowerCase().includes(q) ||
        s.className?.toLowerCase().includes(q) ||
        s.department?.toLowerCase().includes(q) ||
        s.courseName?.toLowerCase().includes(q) ||
        (s as any).course?.toLowerCase().includes(q)
    );
  }, [assignedCardsList, filterQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-bold animate-in slide-in-from-top-2 ${
            toast.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800"
              : toast.type === "error"
              ? "bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-800"
              : "bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-800"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : toast.type === "error" ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          ) : (
            <Zap className="w-4 h-4 text-blue-600 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Primary Mode Switcher: RFID Cards vs ESP32 Readers */}
      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl w-fit">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm transition-all">
          <Radio className="w-4 h-4" />
          <span>RFID Smart Cards</span>
          {unmappedCards.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black animate-pulse">
              {unmappedCards.length} New
            </span>
          )}
        </div>
        <Link
          href="/transport-admin/esp32"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-all cursor-pointer"
        >
          <Cpu className="w-4 h-4" />
          <span>ESP32 Bus Readers</span>
        </Link>
      </div>

      {/* Clean Modern Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                RFID Smart Cards
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                New taps from ESP32 appear at the top. Assign cards to students or delete cards with 1 click.
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic ESP32 Hardware Status & Quick Add */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const defaultBus = (hardwareStatus?.busId && hardwareStatus.busId > 0) ? hardwareStatus.busId : (buses.length > 0 ? buses[0].id : -1);
              setSelectedBusForDevice(defaultBus);
              const matchedBus = buses.find((b) => b.id === defaultBus);
              setDeviceIdInput(matchedBus?.rfidDeviceId || hardwareStatus?.deviceId || "");
              setDeviceModalOpen(true);
            }}
            className="group flex items-center gap-2.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-750 px-3.5 py-2 rounded-2xl border border-gray-200 dark:border-gray-700 transition-all text-left shadow-sm active:scale-95 cursor-pointer"
            title="Click to view and configure ESP32 IoT hardware bus mapping"
          >
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
                <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                {isHardwareActive
                  ? (hardwareStatus?.isMapped && hardwareStatus?.busNumber && hardwareStatus?.busId > 0
                      ? `ESP32 Online • Bus ${hardwareStatus.busNumber}`
                      : `ESP32 Active (${hardwareStatus?.deviceId || "Connected"})`)
                  : (hardwareStatus?.isMapped && hardwareStatus?.busNumber && hardwareStatus?.busId > 0
                      ? `ESP32 Offline • Bus ${hardwareStatus.busNumber}`
                      : "ESP32 Standby (Offline)")}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
                {hardwareStatus?.deviceId
                  ? `Hardware: ${hardwareStatus.deviceId} • ${isHardwareActive ? "Active now" : `Last seen ${formatTimeAgo(hardwareStatus.lastSeen)}`}`
                  : "Click to map readers"}
              </span>
            </div>
            <Settings className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 transition-colors ml-1 shrink-0" />
          </button>

          <button
            onClick={() => setManualModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Enter UID</span>
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
              All Cards ({unmappedCards.length + assignedCardsList.length})
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
              <span>New Taps ({unmappedCards.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("ASSIGNED")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "ASSIGNED"
                  ? "bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Assigned ({assignedCardsList.length})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search UID, student name, email, student ID..."
              className="w-full text-xs pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Clean Unified List Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-bold text-gray-400 border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="p-3.5">RFID Card UID</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Assigned Student</th>
                <th className="p-3.5">Student ID</th>
                <th className="p-3.5">Class & Department</th>
                <th className="p-3.5">Pickup Bus Stop</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {/* 1. NEWLY DETECTED UNMAPPED CARDS FROM ESP32 (APPEAR FIRST AT THE TOP OF THE LIST) */}
              {(activeTab === "ALL" || activeTab === "DETECTED") &&
                filteredUnmapped.map((card) => (
                  <tr
                    key={card.rfidCardId}
                    className="bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50/70 dark:hover:bg-amber-950/40 transition-colors"
                  >
                    {/* Card UID with energetic pulse badge */}
                    <td className="p-3.5">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 font-mono font-black text-xs">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        <span>{card.rfidCardId}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="p-3.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-[10px] font-black uppercase tracking-wider">
                        New Tap • Pending
                      </span>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                        <span>{card.busNumber || card.busId}</span>
                        <span className="mx-1">•</span>
                        <span suppressHydrationWarning>
                          {mounted && card.scannedAt
                            ? new Date(card.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "--:--"}
                        </span>
                        {card.deviceId && (
                          <span className="ml-1 text-[9px] text-gray-400 font-mono">({card.deviceId})</span>
                        )}
                      </div>
                    </td>

                    {/* Student Placeholder */}
                    <td className="p-3.5 text-gray-400 italic">
                      Not assigned yet
                    </td>
                    <td className="p-3.5 text-gray-400">—</td>
                    <td className="p-3.5 text-gray-400">—</td>
                    <td className="p-3.5 text-gray-400">—</td>

                    {/* Actions: Assign Student or Delete */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenAssignModal(card.rfidCardId)}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all active:scale-95"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Assign Student</span>
                        </button>
                        <button
                          onClick={() => handleDeleteUnmappedCard(card.rfidCardId)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          title="Dismiss / Delete tap"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {/* 2. ASSIGNED REGISTERED CARDS */}
              {(activeTab === "ALL" || activeTab === "ASSIGNED") &&
                filteredAssigned.map((student) => {
                  const stop = stops.find((st) => st.id === student.primaryStopId);
                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Card UID */}
                      <td className="p-3.5">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-mono font-black text-xs">
                          <Radio className="w-3 h-3 text-blue-600" />
                          <span>{student.rfidCardId}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            student.transportAccessSuspended
                              ? "bg-rose-100 text-rose-700 border-rose-300"
                              : "bg-emerald-100 text-emerald-700 border-emerald-300"
                          }`}
                        >
                          {student.transportAccessSuspended ? "SUSPENDED" : "ACTIVE"}
                        </span>
                      </td>

                      {/* Student Info */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <StudentPhotoBadge
                            photoUrl={student.photoUrl}
                            name={student.fullName}
                            className="w-8 h-8 rounded-xl"
                          />
                          <div>
                            <div className="font-bold text-gray-900 dark:text-white">
                              {student.fullName}
                            </div>
                            <div className="text-[10px] text-gray-400">{student.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Student ID */}
                      <td className="p-3.5 font-mono font-bold text-gray-700 dark:text-gray-300">
                        {student.studentIdCode || "—"}
                      </td>

                      {/* Class */}
                      <td className="p-3.5 text-gray-600 dark:text-gray-400">
                        <div>{student.className || "General"}</div>
                        <div className="text-[10px] opacity-75">{student.department}</div>
                      </td>

                      {/* Stop */}
                      <td className="p-3.5 text-gray-600 dark:text-gray-400">
                        {stop?.name || "Main Campus Corridor"}
                      </td>

                      {/* Actions: Reassign or Delete Card */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenAssignModal(student.rfidCardId!, student.id)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                          >
                            Reassign
                          </button>
                          <button
                            onClick={() => handleDeleteStudentCard(student)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="Delete / Unlink Card"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {filteredUnmapped.length === 0 && filteredAssigned.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 text-xs">
                    No RFID cards match your search. Tap an RFID card on the ESP32 reader to see it appear here live!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL: ASSIGN STUDENT TO CARD ────────────────────────────────────── */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 dark:bg-blue-950 text-blue-600 rounded-xl">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 dark:text-white">
                    Assign Card: <span className="font-mono text-blue-600 dark:text-blue-400">{activeCardToAssign}</span>
                  </h3>
                  <p className="text-xs text-gray-500">Select a student from the directory</p>
                </div>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Student Search */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Search Student (Name, Email, Student ID, or Course)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={studentSearchInput}
                  onChange={(e) => setStudentSearchInput(e.target.value)}
                  placeholder="Type student name, email, student ID, or course..."
                  className="w-full text-xs font-semibold pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                />
              </div>

              {/* Student Results List */}
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-2xl">
                {searchResultsForModal.map((stu) => {
                  const isSelected = selectedStudentForAssign?.id === stu.id;
                  return (
                    <div
                      key={stu.id}
                      onClick={() => {
                        setSelectedStudentForAssign(stu);
                        setStudentIdInput(stu.studentIdCode || "");
                      }}
                      className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-950/60"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <StudentPhotoBadge
                          photoUrl={stu.photoUrl}
                          name={stu.fullName}
                          className="w-7 h-7 rounded-lg shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                            {stu.fullName}
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono truncate">
                            ID: {stu.studentIdCode || "Pending"}{stu.email ? ` • ${stu.email}` : ""} • {stu.className || stu.department}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Student ID Confirmation */}
            {selectedStudentForAssign && (
              <div className="space-y-1.5 p-3 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                  Student ID
                </label>
                <input
                  type="text"
                  value={studentIdInput}
                  onChange={(e) => setStudentIdInput(e.target.value)}
                  placeholder="e.g. 230111075 or PV-23620010"
                  className="w-full text-xs font-semibold px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none"
                />
              </div>
            )}

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
                disabled={isSubmitting || !selectedStudentForAssign}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Confirm & Assign Card</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: MANUALLY ENTER CARD UID ───────────────────────────────────── */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-black text-sm text-gray-900 dark:text-white">
                Enter RFID Card UID
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
                Card UID (Hexadecimal)
              </label>
              <input
                type="text"
                value={manualUidInput}
                onChange={(e) => setManualUidInput(e.target.value.toUpperCase())}
                placeholder="e.g. 23BDEB2C"
                className="w-full text-sm font-mono font-bold tracking-wider px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 uppercase"
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
                onClick={handleConfirmManualCard}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <span>Next: Select Student</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ESP32 HARDWARE DEVICE MAPPING ─────────────────────────────── */}
      {deviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900 dark:text-white">
                    IoT Hardware Reader Mapping
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Map ESP32 terminals to campus buses dynamically without reflashing firmware.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeviceModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Reporting Status Banner */}
            {hardwareStatus && (
              <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                        isHardwareActive ? "bg-emerald-400 opacity-75" : "bg-amber-400 opacity-50"
                      }`}
                    ></span>
                    <span
                      className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                        isHardwareActive ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    ></span>
                  </span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">
                    Latest Active Device: <span className="font-mono text-blue-600 dark:text-blue-400">{hardwareStatus.deviceId}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeviceIdInput(hardwareStatus.deviceId);
                  }}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black"
                >
                  Use This Device ID
                </button>
              </div>
            )}

            {/* Pairing Form */}
            <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-200 dark:border-gray-700/80 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Select Bus Asset */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Select Bus Asset
                  </label>
                  <CustomDropdown
                    size="sm"
                    value={selectedBusForDevice > 0 ? String(selectedBusForDevice) : ""}
                    onChange={(val) => {
                      const num = val ? Number(val) : -1;
                      setSelectedBusForDevice(num);
                      const matched = buses.find((b) => b.id === num);
                      setDeviceIdInput(matched?.rfidDeviceId || "");
                    }}
                    placeholder="Select Bus Asset"
                    options={buses.map((b) => ({
                      value: String(b.id),
                      label: `Bus ${b.busNumber} (${b.registrationNo}) ${b.rfidDeviceId ? `• [${b.rfidDeviceId}]` : "• [Unpaired]"}`,
                    }))}
                  />
                </div>

                {/* Device Hardware ID or MAC */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    ESP32 Device ID / MAC Address
                  </label>
                  <input
                    type="text"
                    value={deviceIdInput}
                    onChange={(e) => setDeviceIdInput(e.target.value)}
                    placeholder="e.g. 24:6F:28:AB:12:CD or ESP32-BUS-44"
                    className="w-full text-xs font-mono font-bold px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setDeviceIdInput("")}
                  className="text-xs text-rose-500 hover:text-rose-600 font-bold"
                >
                  Clear / Unbind Reader
                </button>
                <button
                  type="button"
                  onClick={handleSaveDeviceMapping}
                  disabled={isSavingDevice || !selectedBusForDevice}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingDevice ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Hardware Pairing</span>
                </button>
              </div>
            </div>

            {/* Fleet Bus Pairing Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                Fleet Reader Registry ({buses.length} Buses)
              </h4>
              <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800/80 text-[10px] font-black uppercase text-gray-500">
                      <th className="p-2.5">Bus Asset</th>
                      <th className="p-2.5">Paired ESP32 ID</th>
                      <th className="p-2.5">Live Status</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {buses.map((b) => {
                      const isLive = isHardwareActive && hardwareStatus?.busId === b.id;
                      return (
                        <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                          <td className="p-2.5 font-bold text-gray-900 dark:text-white">
                            Bus {b.busNumber}
                            <span className="block text-[10px] text-gray-400 font-normal">
                              {b.registrationNo}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-[11px]">
                            {b.rfidDeviceId ? (
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
                                {b.rfidDeviceId}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">Not paired</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {isLive ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Live Now
                              </span>
                            ) : b.rfidDeviceId ? (
                              <span className="text-[10px] text-gray-400">Standby</span>
                            ) : (
                              <span className="text-[10px] text-gray-400">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBusForDevice(b.id);
                                setDeviceIdInput(b.rfidDeviceId || "");
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
