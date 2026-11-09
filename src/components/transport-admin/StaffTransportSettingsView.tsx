"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Settings2,
  MapPin,
  Bus,
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
  Armchair,
  ScanFace,
  QrCode,
  Radio,
  CreditCard,
  Layers,
  ScanLine,
} from "lucide-react";
import type { TransportSettings, SeatSelectionMode, TransitAttendanceMode } from "@/lib/types";
import { broadcastAttendanceModeChange } from "@/lib/attendance";
import { store } from "@/lib/store";

// ─── Default settings (before DB load) ──────────────────────────────────────

const DEFAULT_SETTINGS: TransportSettings = {
  id: "",
  maxWalkDistanceKm: 3.0,
  autoAssignmentEnabled: true,
  seatSelectionMode: "AT_ATTENDANCE",
  attendanceMode: "FACE_ID",
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
          broadcastAttendanceModeChange(data.settings.attendanceMode);
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
            Configure AI auto-assignment, walking distance limits, seat selection mode, and bus consolidation thresholds.
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

        {/* ─── Card 0: Attendance & Gate Validation Policy ─── */}
        <div className="lg:col-span-2">
          <SettingsCard
            icon={<ScanFace className="w-5 h-5 text-indigo-600" />}
            title="Institutional Attendance & Gate Validation Policy"
            description="Select the fleet's active commuter validation mechanism. Commuter passes and vehicle cockpits dynamically adapt to eliminate visual clutter."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div
                onClick={() => updateSetting("attendanceMode", "FACE_ID")}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  settings.attendanceMode === "FACE_ID"
                    ? "border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20"
                    : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                      <ScanFace className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-gray-900 dark:text-white">
                          Autonomous Face ID Biometrics
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        Zero-touch dual-camera gate telematics. Auto-recognizes commuters, binds driver GPS, tracks live headcount, and intercepts unauthorized intruders. No physical cards or phone battery required.
                      </p>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                    settings.attendanceMode === "FACE_ID" ? "border-indigo-600 bg-indigo-600" : "border-gray-300 dark:border-gray-600"
                  }`}>
                    {settings.attendanceMode === "FACE_ID" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
              </div>

              <div
                onClick={() => updateSetting("attendanceMode", "DYNAMIC_QR")}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  settings.attendanceMode === "DYNAMIC_QR"
                    ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20"
                    : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        Dynamic Rotating QR Code Pass
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        Time-based rotating cryptographic token on the student&apos;s mobile screen (HMAC-SHA256, 1-minute anti-screenshot expiration) scanned by conductor.
                      </p>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                    settings.attendanceMode === "DYNAMIC_QR" ? "border-blue-600 bg-blue-600" : "border-gray-300 dark:border-gray-600"
                  }`}>
                    {settings.attendanceMode === "DYNAMIC_QR" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
              </div>

              <div
                onClick={() => updateSetting("attendanceMode", "RFID")}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  settings.attendanceMode === "RFID"
                    ? "border-purple-600 bg-purple-50/60 dark:bg-purple-950/40 ring-2 ring-purple-500/20"
                    : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        Contactless RFID Smart Cards
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        Physical MIFARE / NFC card tap against IoT door terminals (ESP32/RC522) with local offline cache and cloud sync.
                      </p>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                    settings.attendanceMode === "RFID" ? "border-purple-600 bg-purple-600" : "border-gray-300 dark:border-gray-600"
                  }`}>
                    {settings.attendanceMode === "RFID" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
              </div>

              <div
                onClick={() => updateSetting("attendanceMode", "STATIC_QR")}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  settings.attendanceMode === "STATIC_QR"
                    ? "border-amber-600 bg-amber-50/60 dark:bg-amber-950/40 ring-2 ring-amber-500/20"
                    : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                      <ScanLine className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        Static Bus Door QR (Self-Scan)
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        Conductor displays bus entrance QR code. Students self-scan with GPS geofence proximity verification.
                      </p>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                    settings.attendanceMode === "STATIC_QR" ? "border-amber-600 bg-amber-600" : "border-gray-300 dark:border-gray-600"
                  }`}>
                    {settings.attendanceMode === "STATIC_QR" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
              </div>

              <div
                onClick={() => updateSetting("attendanceMode", "ALL")}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  settings.attendanceMode === "ALL"
                    ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20"
                    : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        Multi-Modal Hybrid (All Methods Active)
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        Accepts Face ID, dynamic QR, RFID card taps, and static seat QR simultaneously across fleet vehicles.
                      </p>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                    settings.attendanceMode === "ALL" ? "border-emerald-600 bg-emerald-600" : "border-gray-300 dark:border-gray-600"
                  }`}>
                    {settings.attendanceMode === "ALL" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
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

        {/* ─── Card 2: Autonomous Seat Allocation Policy ─── */}
        <SettingsCard
          icon={<Armchair className="w-5 h-5 text-indigo-600" />}
          title="Autonomous Seat Allocation Engine"
          description="Seats are dynamically assigned by the AI optimization engine based on commuter profile preferences."
        >
          <div className="space-y-3.5">
            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-black text-indigo-900 dark:text-indigo-200">
                  Student Preference-Driven
                </span>
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  Autonomous
                </span>
              </div>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
                Seats are automatically assigned by the allocation engine based on each student&apos;s configured coach preferences (Window vs Aisle, Front/Middle/Back zones) and companion partner matching in their profile settings.
              </p>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
              <span>Manual seat picking: <strong className="text-gray-700 dark:text-gray-300">Disabled (Auto-Assigned)</strong></span>
              <span>Companion proximity: <strong className="text-emerald-600">Enabled</strong></span>
            </div>
          </div>
        </SettingsCard>

        {/* ─── Card 3: AI Auto-Assignment ─── */}
        <SettingsCard
          icon={<Bus className="w-5 h-5 text-amber-600" />}
          title="AI Bus Auto-Assignment"
          description="Automatic bus allocation based on student profile, home location, and timetable."
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Auto-Assignment Engine</p>
                <p className="text-[10px] text-gray-400">
                  {settings.autoAssignmentEnabled
                    ? "AI assigns optimal bus nightly based on demand + proximity"
                    : "Manual assignment by transport manager only"}
                </p>
              </div>
              <button
                onClick={() => updateSetting("autoAssignmentEnabled", !settings.autoAssignmentEnabled)}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  settings.autoAssignmentEnabled
                    ? "bg-amber-500"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${
                    settings.autoAssignmentEnabled ? "translate-x-7" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                Min Bus Fill Before Consolidation
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="20"
                  max="90"
                  step="5"
                  value={settings.minFillPercent}
                  onChange={e => updateSetting("minFillPercent", parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-600"
                />
                <div className="min-w-[60px] px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-center">
                  <span className="text-lg font-black text-amber-700 dark:text-amber-400">
                    {settings.minFillPercent}
                  </span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-500 ml-0.5">%</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                If demand fills buses below this %, routes are consolidated into fewer buses for fuel efficiency.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                Capacity Buffer (Reserve)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="25"
                  step="5"
                  value={settings.capacityBufferPercent}
                  onChange={e => updateSetting("capacityBufferPercent", parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-600"
                />
                <div className="min-w-[60px] px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-center">
                  <span className="text-lg font-black text-amber-700 dark:text-amber-400">
                    {settings.capacityBufferPercent}
                  </span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-500 ml-0.5">%</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Reserve this % of seats on each bus for last-minute additions and switch approvals.
              </p>
            </div>
          </div>
        </SettingsCard>

        {/* ─── Card 4: Route & Ride Constraints ─── */}
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
                Dynamic route generator won't create routes exceeding this duration.
                Current: {Math.round(settings.maxRideTimeMins / 60 * 10) / 10} hours.
              </p>
            </div>
          </div>
        </SettingsCard>

        {/* ─── Card 5: Switch Request Policy ─── */}
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
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">AI Decision Matrix</p>
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
