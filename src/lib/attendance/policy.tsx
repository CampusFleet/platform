"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ScanFace,
  QrCode,
  Radio,
  ScanLine,
  Layers,
  ArrowRight,
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import type { TransitAttendanceMode, ValidationLocksConfig } from "@/lib/types";
import { DEFAULT_VALIDATION_LOCKS } from "@/lib/types";

/**
 * Universal Feature & Page Activation Matrix based on Institutional Attendance Policy.
 */
export interface ModalityPageRules {
  mode: TransitAttendanceMode;
  locks: ValidationLocksConfig;
  modeLabel: string;
  modeDescription: string;

  // Student Portal
  studentPassBadge: "FACE_ID" | "DYNAMIC_QR" | "RFID" | "STATIC_QR" | "HYBRID";
  isStudentDoorScannerActive: boolean; // /portal/qr/scan
  isStudentShowQrActive: boolean;      // /portal/qr/show
  studentQrConnectLabel: string;       // Bottom nav and portal hub label

  // Conductor Cockpit
  isConductorBusQrActive: boolean;     // /conductor/bus-qr (print static/rolling bus door poster)
  conductorScannerRole: "PRIMARY" | "BACKUP_EXCEPTION" | "HYBRID";
  conductorGateMirroringEnabled: boolean; // Manifest APC HUD

  // Driver Cockpit
  isDriverGateCameraActive: boolean;   // <DriverGateCameraConsole>
  driverCameraStandbyReason?: string;

  // Transport Admin Desk
  isRfidIssuancePrimary: boolean;      // /transport-admin/rfid
  isEsp32ProvisioningPrimary: boolean; // /transport-admin/esp32
}

/**
 * Resolves active validation locks, falling back to legacy single mode if needed.
 */
export function resolveValidationLocks(
  mode?: TransitAttendanceMode,
  locks?: ValidationLocksConfig
): ValidationLocksConfig {
  if (locks && typeof locks === "object") {
    return {
      faceId: Boolean(locks.faceId),
      dynamicQr: Boolean(locks.dynamicQr),
      rfid: Boolean(locks.rfid),
      staticQr: Boolean(locks.staticQr),
    };
  }

  switch (mode) {
    case "DYNAMIC_QR":
      return { faceId: false, dynamicQr: true, rfid: false, staticQr: false };
    case "RFID":
      return { faceId: false, dynamicQr: false, rfid: true, staticQr: false };
    case "STATIC_QR":
      return { faceId: false, dynamicQr: false, rfid: false, staticQr: true };
    case "FACE_ID":
      return { faceId: true, dynamicQr: false, rfid: false, staticQr: false };
    case "ALL":
    default:
      return { faceId: true, dynamicQr: true, rfid: true, staticQr: true };
  }
}

/**
 * Evaluates the authoritative page activation rules for a given transit attendance mode and lock config.
 */
export function getModalityPageRules(
  mode: TransitAttendanceMode = "FACE_ID",
  customLocks?: ValidationLocksConfig
): ModalityPageRules {
  const effectiveMode = mode || "FACE_ID";
  const locks = resolveValidationLocks(effectiveMode, customLocks);
  const activeCount = [locks.faceId, locks.dynamicQr, locks.rfid, locks.staticQr].filter(Boolean).length;

  let badge: "FACE_ID" | "DYNAMIC_QR" | "RFID" | "STATIC_QR" | "HYBRID" = "HYBRID";
  if (activeCount === 1) {
    if (locks.faceId) badge = "FACE_ID";
    else if (locks.dynamicQr) badge = "DYNAMIC_QR";
    else if (locks.rfid) badge = "RFID";
    else if (locks.staticQr) badge = "STATIC_QR";
  }

  let studentQrConnectLabel = "Backup Pass";
  if (locks.dynamicQr && locks.staticQr) {
    studentQrConnectLabel = "QR & Passes";
  } else if (locks.dynamicQr) {
    studentQrConnectLabel = "QR Pass";
  } else if (locks.staticQr) {
    studentQrConnectLabel = "Scan Bus QR";
  } else if (locks.rfid) {
    studentQrConnectLabel = "Smart Card";
  }

  let driverCameraStandbyReason: string | undefined = undefined;
  if (!locks.faceId) {
    if (locks.dynamicQr && activeCount === 1) {
      driverCameraStandbyReason = "Institutional attendance policy is set to Dynamic QR Pass. Conductor handles boarding scans.";
    } else if (locks.rfid && activeCount === 1) {
      driverCameraStandbyReason = "Institutional attendance policy is set to RFID Smart Cards. Door reader handles tap-ins.";
    } else if (locks.staticQr && activeCount === 1) {
      driverCameraStandbyReason = "Institutional attendance policy is set to Bus Door QR. Students scan via phone within geofence.";
    } else {
      driverCameraStandbyReason = "Face ID Biometric lock is currently disabled in Transport Settings.";
    }
  }

  let label = "Multi-Modal Parallel Gate";
  let description = "Multiple gate validation locks active simultaneously across fleet vehicles.";
  if (activeCount === 4) {
    label = "Universal Parallel Gate (All 4 Active)";
    description = "Autonomous Face ID, Dynamic QR, RFID Smart Cards, and Bus Door QR active simultaneously.";
  } else if (activeCount === 1) {
    if (locks.faceId) {
      label = "Autonomous Face ID";
      description = "Ceiling-mounted dual-gate AI cameras autonomously log boardings and alightings.";
    } else if (locks.dynamicQr) {
      label = "Dynamic Rotating QR";
      description = "Students present rolling time-synced QR tokens on their phones; conductors scan at bus doors.";
    } else if (locks.rfid) {
      label = "RFID Smart Card";
      description = "Students tap physical Mifare/NFC smart cards on vehicle door readers.";
    } else if (locks.staticQr) {
      label = "Physical Bus & Seat QR";
      description = "Physical QR posters on bus doors and seats scanned by student phones within geofence.";
    }
  }

  return {
    mode: effectiveMode,
    locks,
    modeLabel: label,
    modeDescription: description,
    studentPassBadge: badge,
    isStudentDoorScannerActive: locks.staticQr,
    isStudentShowQrActive: locks.dynamicQr,
    studentQrConnectLabel,
    isConductorBusQrActive: locks.staticQr,
    conductorScannerRole: locks.dynamicQr ? (activeCount > 1 ? "HYBRID" : "PRIMARY") : "BACKUP_EXCEPTION",
    conductorGateMirroringEnabled: true,
    isDriverGateCameraActive: locks.faceId,
    driverCameraStandbyReason,
    isRfidIssuancePrimary: locks.rfid,
    isEsp32ProvisioningPrimary: locks.rfid || locks.faceId,
  };
}

const STORAGE_KEY = "campusfleet_attendance_mode";
const STORAGE_LOCKS_KEY = "campusfleet_validation_locks";
const CHANNEL_NAME = "campusfleet_attendance_policy";

/**
 * React hook to reactively subscribe to the active institutional attendance policy and validation locks.
 */
export function useAttendancePolicy() {
  const [mode, setMode] = useState<TransitAttendanceMode>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) as TransitAttendanceMode | null;
        if (saved && ["FACE_ID", "DYNAMIC_QR", "RFID", "STATIC_QR", "ALL"].includes(saved)) {
          return saved;
        }
      } catch {}
    }
    return "ALL";
  });

  const [locks, setLocks] = useState<ValidationLocksConfig>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedLocks = localStorage.getItem(STORAGE_LOCKS_KEY);
        if (savedLocks) {
          const parsed = JSON.parse(savedLocks);
          if (parsed && typeof parsed === "object") {
            return resolveValidationLocks(undefined, parsed);
          }
        }
      } catch {}
    }
    return DEFAULT_VALIDATION_LOCKS;
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // 1. Fetch current settings from backend
    async function syncPolicy() {
      try {
        const res = await fetch("/api/fleet/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.settings) {
          const remoteMode = (data.settings.attendanceMode || "ALL") as TransitAttendanceMode;
          const remoteLocks = resolveValidationLocks(remoteMode, data.settings.validationLocks);

          if (isMounted) {
            setMode(remoteMode);
            setLocks(remoteLocks);
            try {
              localStorage.setItem(STORAGE_KEY, remoteMode);
              localStorage.setItem(STORAGE_LOCKS_KEY, JSON.stringify(remoteLocks));
            } catch {}
          }
        }
      } catch {} finally {
        if (isMounted) setLoading(false);
      }
    }

    syncPolicy();

    // 2. Cross-tab real-time BroadcastChannel sync
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (event) => {
          if (!isMounted || !event?.data) return;

          if (event.data.mode) {
            setMode(event.data.mode);
            try {
              localStorage.setItem(STORAGE_KEY, event.data.mode);
            } catch {}
          }

          if (event.data.locks) {
            const resolved = resolveValidationLocks(event.data.mode, event.data.locks);
            setLocks(resolved);
            try {
              localStorage.setItem(STORAGE_LOCKS_KEY, JSON.stringify(resolved));
            } catch {}
          }
        };
      }
    } catch {}

    return () => {
      isMounted = false;
      if (channel) channel.close();
    };
  }, []);

  const rules = getModalityPageRules(mode, locks);
  return { mode, locks, rules, loading };
}

/**
 * Dispatches a policy change broadcast across all browser tabs.
 */
export function broadcastAttendanceModeChange(
  mode: TransitAttendanceMode,
  locks?: ValidationLocksConfig
) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, mode);
      const cleanLocks = resolveValidationLocks(mode, locks);
      localStorage.setItem(STORAGE_LOCKS_KEY, JSON.stringify(cleanLocks));

      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channel.postMessage({ mode, locks: cleanLocks });
        channel.close();
      }
    }
  } catch {}
}

interface PolicyStandbyScreenProps {
  pageTitle: string;
  pageFeature: string;
  requiredModeDescription: string;
  activeMode: TransitAttendanceMode;
  returnHref?: string;
  returnLabel?: string;
}

/**
 * Enterprise Page Gating Screen:
 * Displayed when an operator or commuter navigates to a route that is inactive
 * under the active institutional attendance policy.
 */
export function PolicyStandbyScreen({
  pageTitle,
  pageFeature,
  requiredModeDescription,
  activeMode,
  returnHref = "/conductor",
  returnLabel = "Return to Dashboard",
}: PolicyStandbyScreenProps) {
  const rules = getModalityPageRules(activeMode);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="max-w-md w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
        {/* Policy Icon */}
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-blue-600 dark:text-blue-400 shadow-sm">
          {activeMode === "FACE_ID" ? (
            <ScanFace className="w-8 h-8 text-emerald-500 animate-pulse" />
          ) : activeMode === "DYNAMIC_QR" ? (
            <QrCode className="w-8 h-8 text-blue-500" />
          ) : activeMode === "RFID" ? (
            <Radio className="w-8 h-8 text-indigo-500" />
          ) : (
            <Layers className="w-8 h-8 text-amber-500" />
          )}
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-black uppercase bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Active Policy: {rules.modeLabel}</span>
          </div>
          <h2 className="text-xl font-black text-zinc-900 dark:text-white pt-1">
            {pageTitle} Inactive
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
            {pageFeature} is currently in standby because the campus transport policy is set to{" "}
            <strong className="text-zinc-800 dark:text-zinc-200">{rules.modeLabel}</strong>. {requiredModeDescription}
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-left text-xs space-y-1 font-sans">
          <div className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Active Workflow Available</span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {rules.modeDescription}
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-2">
          <Link
            href={returnHref}
            className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{returnLabel}</span>
          </Link>
          <Link
            href="/transport-admin/transit"
            className="py-3 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs border border-zinc-200 dark:border-zinc-800 transition-all flex items-center justify-center gap-1"
            title="Transport Admin Settings"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
