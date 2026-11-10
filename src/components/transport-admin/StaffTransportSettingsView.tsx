"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Settings2,
  MapPin,
  Route,
  Shield,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Gauge,
  Timer,
  ArrowRightLeft,
  ScanFace,
  QrCode,
  Radio,
  CreditCard,
  Layers,
  ScanLine,
} from "lucide-react";
import type { TransportSettings, SeatSelectionMode, TransitAttendanceMode, ValidationLocksConfig } from "@/lib/types";
import { DEFAULT_VALIDATION_LOCKS } from "@/lib/types";
import { broadcastAttendanceModeChange } from "@/lib/attendance";
import { store } from "@/lib/store";

// ─── Default settings (before DB load) ──────────────────────────────────────

const DEFAULT_SETTINGS: TransportSettings = {
  id: "",
  maxWalkDistanceKm: 3.0,
  autoAssignmentEnabled: true,
  seatSelectionMode: "AT_ATTENDANCE",
  attendanceMode: "ALL",
  validationLocks: DEFAULT_VALIDATION_LOCKS,
  minFillPercent: 60,
  maxRideTimeMins: 90,
  capacityBufferPercent: 10,
  switchAutoApproveBelowPct: 90,
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function StaffTransportSettingsView() {
  const [settings, setSettings] = useState<TransportSettings>(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<TransportSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch settings on mount
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fleet/settings");
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
        setOriginalSettings(data.settings);
      }
    } catch (err) {
      console.error("Failed to load transport settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Track changes
  useEffect(() => {
    const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings);
    setHasChanges(changed);
  }, [settings, originalSettings]);

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    try {
      const currentUser = store.getCurrentUser();
      const res = await fetch("/api/fleet/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          updatedBy: currentUser?.id || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOriginalSettings(data.settings);
        setSettings(data.settings);
        if (data.settings?.attendanceMode) {
          broadcastAttendanceModeChange(data.settings.attendanceMode, data.settings.validationLocks);
        }
        showToast("Transport settings saved successfully!", "success");
      } else {
        showToast(data.message || "Failed to save settings.", "error");
      }
    } catch (err) {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  // Update individual setting
  const updateSetting = <K extends keyof TransportSettings>(key: K, value: TransportSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const currentLocks: ValidationLocksConfig = settings.validationLocks || DEFAULT_VALIDATION_LOCKS;

  const activeLocksCount = [
    Boolean(currentLocks.faceId),
    Boolean(currentLocks.dynamicQr),
    Boolean(currentLocks.rfid),
    Boolean(currentLocks.staticQr),
  ].filter(Boolean).length;

  const toggleLock = (lockKey: keyof ValidationLocksConfig) => {
    const isCurrentlyActive = Boolean(currentLocks[lockKey]);
    if (isCurrentlyActive && activeLocksCount <= 1) {
      showToast("At least one gate validation lock must remain active to allow commuter boarding.", "error");
      return;
    }

    const updatedLocks: ValidationLocksConfig = {
      ...currentLocks,
      [lockKey]: !isCurrentlyActive,
    };

    const updatedCount = Object.values(updatedLocks).filter(Boolean).length;
    let computedMode: TransitAttendanceMode = "ALL";
    if (updatedCount === 1) {
      if (updatedLocks.faceId) computedMode = "FACE_ID";
      else if (updatedLocks.dynamicQr) computedMode = "DYNAMIC_QR";
      else if (updatedLocks.rfid) computedMode = "RFID";
      else if (updatedLocks.staticQr) computedMode = "STATIC_QR";
    }

    setSettings(prev => ({
      ...prev,
      validationLocks: updatedLocks,
      attendanceMode: computedMode,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-3 text-sm text-gray-500">Loading transport settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
            <Settings2 className="w-7 h-7 text-violet-600" />
            Smart Transit Settings
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Configure corridor dispatch rules, walking distance limits, passenger switch policies, and fleet operational thresholds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefaults}
            className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-xs transition-colors"
          >
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`px-5 py-2.5 font-bold rounded-xl text-xs flex items-center gap-2 transition-all ${
              hasChanges
                ? "bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200 dark:shadow-violet-900/30"
                : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold animate-in fade-in border ${
            toast.type === "success"
              ? "bg-green-50 dark:bg-green-950/40 border-green-300 dark:border-green-800 text-green-900 dark:text-green-200"
              : "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.message}
          </div>
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ─── Card 0: Multi-Lock Attendance & Gate Validation Policy ─── */}
        <div className="lg:col-span-2">
          <SettingsCard
            icon={<ScanFace className="w-5 h-5 text-indigo-600" />}
            title="Institutional Gate Validation Locks"
            description="Configure active commuter validation locks independently. All enabled locks operate in parallel across fleet vehicles with real-time biometric and NFC deduplication."
          >
            <div className="space-y-4">
              {/* Header Status Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${activeLocksCount > 1 ? "bg-emerald-500 animate-pulse" : "bg-blue-500"}`} />
                  <span className="text-xs sm:text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                    {activeLocksCount} of 4 Gate Locks Active
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    activeLocksCount > 1
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  }`}>
                    {activeLocksCount > 1 ? "Parallel Concurrency Mode" : "Single Gate Enforcement"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {activeLocksCount > 1
                    ? "Commuters can validate via any active lock. De-duplication prevents duplicate counts."
                    : "Only this single validation channel will be accepted on vehicle doors."}
                </p>
              </div>

              {/* Stacked List of 4 Validation Locks */}
              <div className="space-y-3">
                {/* 1. Autonomous Face ID Biometrics */}
                <div
                  onClick={() => toggleLock("faceId")}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer select-none ${
                    currentLocks.faceId
                      ? "border-indigo-500/40 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-xs"
                      : "border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 opacity-70 hover:opacity-100 hover:border-gray-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                        currentLocks.faceId
                          ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/30"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500"
                      }`}>
                        <ScanFace className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-gray-900 dark:text-white">
                            Autonomous Face ID Biometrics
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            Recommended
                          </span>
                          <span className="px-1.5 py-0.2 text-[10px] font-mono text-gray-400 dark:text-zinc-500 border border-gray-200 dark:border-zinc-800 rounded">
                            MobileFaceNet ONNX
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                          Zero-touch dual-camera telematics on bus doors. Auto-identifies commuters via invariant 512-d embeddings. No phone or card required.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[11px] font-black uppercase tracking-wider hidden sm:inline ${
                        currentLocks.faceId ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-zinc-500"
                      }`}>
                        {currentLocks.faceId ? "Active" : "Disabled"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={currentLocks.faceId}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLock("faceId");
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                          currentLocks.faceId ? "bg-indigo-600" : "bg-gray-300 dark:bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            currentLocks.faceId ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Dynamic Rotating QR Code Pass */}
                <div
                  onClick={() => toggleLock("dynamicQr")}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer select-none ${
                    currentLocks.dynamicQr
                      ? "border-blue-500/40 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs"
                      : "border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 opacity-70 hover:opacity-100 hover:border-gray-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                        currentLocks.dynamicQr
                          ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500"
                      }`}>
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-gray-900 dark:text-white">
                            Dynamic Rotating QR Code Pass
                          </span>
                          <span className="px-1.5 py-0.2 text-[10px] font-mono text-gray-400 dark:text-zinc-500 border border-gray-200 dark:border-zinc-800 rounded">
                            HMAC-SHA256 • 60s
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                          Time-synced rotating cryptographic token on the student&apos;s phone screen (anti-screenshot protection) scanned by the conductor.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[11px] font-black uppercase tracking-wider hidden sm:inline ${
                        currentLocks.dynamicQr ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-zinc-500"
                      }`}>
                        {currentLocks.dynamicQr ? "Active" : "Disabled"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={currentLocks.dynamicQr}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLock("dynamicQr");
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                          currentLocks.dynamicQr ? "bg-blue-600" : "bg-gray-300 dark:bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            currentLocks.dynamicQr ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Contactless RFID Smart Cards */}
                <div
                  onClick={() => toggleLock("rfid")}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer select-none ${
                    currentLocks.rfid
                      ? "border-purple-500/40 bg-purple-50/40 dark:bg-purple-950/20 shadow-xs"
                      : "border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 opacity-70 hover:opacity-100 hover:border-gray-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                        currentLocks.rfid
                          ? "bg-purple-600 text-white shadow-sm shadow-purple-500/30"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500"
                      }`}>
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-gray-900 dark:text-white">
                            Contactless RFID Smart Cards
                          </span>
                          <span className="px-1.5 py-0.2 text-[10px] font-mono text-gray-400 dark:text-zinc-500 border border-gray-200 dark:border-zinc-800 rounded">
                            MIFARE Classic 1K / NFC
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                          Physical student smart card tap against IoT door terminals (ESP32/RC522) with local offline cache and cloud sync.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[11px] font-black uppercase tracking-wider hidden sm:inline ${
                        currentLocks.rfid ? "text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-zinc-500"
                      }`}>
                        {currentLocks.rfid ? "Active" : "Disabled"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={currentLocks.rfid}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLock("rfid");
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                          currentLocks.rfid ? "bg-purple-600" : "bg-gray-300 dark:bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            currentLocks.rfid ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. Static Bus Door QR (Self-Scan) */}
                <div
                  onClick={() => toggleLock("staticQr")}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer select-none ${
                    currentLocks.staticQr
                      ? "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs"
                      : "border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 opacity-70 hover:opacity-100 hover:border-gray-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                        currentLocks.staticQr
                          ? "bg-amber-600 text-white shadow-sm shadow-amber-500/30"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500"
                      }`}>
                        <ScanLine className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-gray-900 dark:text-white">
                            Static Bus Door QR (Self-Scan)
                          </span>
                          <span className="px-1.5 py-0.2 text-[10px] font-mono text-gray-400 dark:text-zinc-500 border border-gray-200 dark:border-zinc-800 rounded">
                            GPS Geofence Verified
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                          Conductor displays static entrance poster or seat stickers. Students self-scan via mobile camera within vehicle proximity.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[11px] font-black uppercase tracking-wider hidden sm:inline ${
                        currentLocks.staticQr ? "text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-zinc-500"
                      }`}>
                        {currentLocks.staticQr ? "Active" : "Disabled"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={currentLocks.staticQr}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLock("staticQr");
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                          currentLocks.staticQr ? "bg-amber-600" : "bg-gray-300 dark:bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            currentLocks.staticQr ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SettingsCard>
        </div>

        {/* ─── Card 1: Walking Distance & Stop Assignment ─── */}
        <SettingsCard
          icon={<MapPin className="w-5 h-5 text-emerald-600" />}
          title="Walking Distance & Stop Assignment"
          description="Maximum distance a student can walk from home to their assigned bus stop."
        >
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                Max Walking Distance (km)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={settings.maxWalkDistanceKm}
                  onChange={e => updateSetting("maxWalkDistanceKm", parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <div className="min-w-[72px] px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center">
                  <span className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                    {settings.maxWalkDistanceKm}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-500 ml-0.5">km</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Students beyond this distance will be flagged for manual review.
                Walking time at 5 km/h: ~{Math.round((settings.maxWalkDistanceKm / 5) * 60)} minutes.
              </p>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-blue-700 dark:text-blue-300">
                  When a student saves their home location, the system auto-assigns the nearest bus stop within this radius.
                  The switch request evaluator also uses this value to approve/deny bus change requests.
                </p>
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* ─── Card 2: Route & Ride Constraints ─── */}
        <SettingsCard
          icon={<Route className="w-5 h-5 text-cyan-600" />}
          title="Route & Ride Constraints"
          description="Maximum ride time and route efficiency parameters."
        >
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                Max Ride Time Per Route
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="30"
                  max="120"
                  step="5"
                  value={settings.maxRideTimeMins}
                  onChange={e => updateSetting("maxRideTimeMins", parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                />
                <div className="min-w-[72px] px-3 py-2 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 rounded-xl text-center">
                  <span className="text-lg font-black text-cyan-700 dark:text-cyan-400">
                    {settings.maxRideTimeMins}
                  </span>
                  <span className="text-[10px] text-cyan-600 dark:text-cyan-500 ml-0.5">min</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Dynamic route generator won&apos;t create routes exceeding this duration.
                Current: {Math.round(settings.maxRideTimeMins / 60 * 10) / 10} hours.
              </p>
            </div>
          </div>
        </SettingsCard>

        {/* ─── Card 3: Switch Request Policy ─── */}
        <SettingsCard
          icon={<ArrowRightLeft className="w-5 h-5 text-rose-600" />}
          title="Bus Switch Request Policy"
          description="Thresholds for automatic approval of student bus switch requests."
          fullWidth
        >
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                Auto-Approve Below Bus Capacity
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={settings.switchAutoApproveBelowPct}
                  onChange={e => updateSetting("switchAutoApproveBelowPct", parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-rose-600"
                />
                <div className="min-w-[60px] px-3 py-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-center">
                  <span className="text-lg font-black text-rose-700 dark:text-rose-400">
                    {settings.switchAutoApproveBelowPct}
                  </span>
                  <span className="text-[10px] text-rose-600 dark:text-rose-500 ml-0.5">%</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Switch requests to buses below this fill % are auto-approved instantly.
                Above this threshold → routed to transport manager for review.
              </p>
            </div>

            {/* Decision Matrix Preview */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Policy Decision Matrix</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DecisionPreview
                  icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
                  title="Auto-Approved"
                  description={`All 4 checks pass. Target bus < ${settings.switchAutoApproveBelowPct}% full. Walking distance < ${settings.maxWalkDistanceKm}km.`}
                  color="green"
                />
                <DecisionPreview
                  icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
                  title="Needs Manager Review"
                  description={`Some concerns (e.g., bus ${settings.switchAutoApproveBelowPct}-100% full, or walk distance ${settings.maxWalkDistanceKm}-${settings.maxWalkDistanceKm + 1}km).`}
                  color="amber"
                />
                <DecisionPreview
                  icon={<Shield className="w-4 h-4 text-red-500" />}
                  title="Auto-Denied"
                  description={`Bus fully booked, walk > ${settings.maxWalkDistanceKm + 1}km, or compliance failure. Manager can override.`}
                  color="red"
                />
              </div>
            </div>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SettingsCard({
  icon,
  title,
  description,
  children,
  fullWidth,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 ${
        fullWidth ? "lg:col-span-2" : ""
      }`}
    >
      <div className="flex items-center gap-2.5 mb-1">
        {icon}
        <h3 className="text-sm font-black text-gray-900 dark:text-white">{title}</h3>
      </div>
      <p className="text-[10px] text-gray-400 mb-5">{description}</p>
      {children}
    </div>
  );
}

function DecisionPreview({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: "green" | "amber" | "red";
}) {
  const bgMap = {
    green: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    amber: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    red: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
  };

  return (
    <div className={`p-3 rounded-lg border ${bgMap[color]}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[10px] font-black text-gray-800 dark:text-gray-200">{title}</span>
      </div>
      <p className="text-[9px] text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}
