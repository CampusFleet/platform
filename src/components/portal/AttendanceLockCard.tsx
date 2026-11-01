"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Lock,
  Unlock,
  Radio,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  CreditCard,
  Bus,
  ShieldCheck,
  Zap,
  Eye,
} from "lucide-react";

interface AttendanceLockCardProps {
  busId?: number | string;
  studentId?: string;
  busNumber?: number | string;
  gpsDeviceId?: string;
  onUnlocked?: () => void;
  onStatusChange?: (status: "LOCKED" | "UNLOCKED") => void;
  onPeekSeats?: () => void;
  className?: string;
}

export function AttendanceLockCard({
  busId,
  studentId,
  busNumber,
  gpsDeviceId,
  onUnlocked,
  onStatusChange,
  onPeekSeats,
  className = "",
}: AttendanceLockCardProps) {
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [lockStatus, setLockStatus] = useState<"LOCKED" | "UNLOCKED">("LOCKED");
  const [unlockedBy, setUnlockedBy] = useState<"LOCATION_DISTANCE" | "RFID" | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [thresholdMeters, setThresholdMeters] = useState(1);
  const [rfidCardId, setRfidCardId] = useState<string | null>(null);
  const [targetBusNumber, setTargetBusNumber] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isBusGpsLive, setIsBusGpsLive] = useState<boolean | null>(null);
  const [driverActive, setDriverActive] = useState<boolean | null>(null);
  const [isDeviceGpsOff, setIsDeviceGpsOff] = useState<boolean>(false);

  // Fetch current lock status without blocking on device GPS satellite lock
  const fetchLockStatus = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const q = new URLSearchParams();
      if (busId !== undefined) q.set("busId", String(busId));
      if (studentId) q.set("studentId", studentId);
      if (busNumber !== undefined) q.set("busNumber", String(busNumber));
      if (gpsDeviceId) q.set("gpsDeviceId", gpsDeviceId);

      const res = await fetch(`/api/attendance/lock?${q.toString()}`);
      const data = await res.json();

      if (data.success) {
        setLockStatus(data.lockStatus);
        setUnlockedBy(data.unlockedBy || null);
        if (data.allowedThresholdMeters) setThresholdMeters(data.allowedThresholdMeters);
        if (data.rfidCardId) setRfidCardId(data.rfidCardId);
        if (data.busNumber) setTargetBusNumber(data.busNumber);
        if (data.message) setMessage(data.message);
        if (data.isBusGpsLive !== undefined) setIsBusGpsLive(data.isBusGpsLive);
        if (data.driverActive !== undefined) setDriverActive(data.driverActive);

        if (typeof data.currentDistanceMeters === "number") {
          setDistanceMeters(data.currentDistanceMeters);
        }

        if (onStatusChange) onStatusChange(data.lockStatus);
        if (data.lockStatus === "UNLOCKED" && onUnlocked) {
          onUnlocked();
        }
      }
    } catch (e: any) {
      console.warn("Could not check attendance lock status:", e);
    } finally {
      setLoading(false);
    }
  }, [busId, studentId, busNumber, gpsDeviceId, onUnlocked, onStatusChange]);

  useEffect(() => {
    fetchLockStatus();

    // Auto-refresh lock status every 10s to catch hardware RFID taps and driver GPS in real time
    const interval = setInterval(fetchLockStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchLockStatus]);

  // Execute Location Distance Unlock
  const handleLocationDistanceUnlock = async () => {
    if (isBusGpsLive === false) {
      setErrorMessage("Bus live GPS is offline: The driver has not started the trip or vehicle telematics are not broadcasting. Distance unlock is unavailable until the bus GPS is active.");
      return;
    }

    if (typeof window === "undefined" || !navigator.geolocation) {
      setErrorMessage("Geolocation is not supported by your mobile browser. Please enable GPS.");
      return;
    }

    setUnlocking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0,
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const acc = position.coords.accuracy;

      if (!lat || !lng || (lat === 0 && lng === 0)) {
        setIsDeviceGpsOff(true);
        setDistanceMeters(null);
        setErrorMessage("Device GPS is currently off or has no satellite fix. Please turn on Location in your device settings.");
        setUnlocking(false);
        return;
      }
      setIsDeviceGpsOff(false);

      const res = await fetch("/api/attendance/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "LOCATION_DISTANCE",
          latitude: lat,
          longitude: lng,
          accuracy: acc ? Math.round(acc) : undefined,
          busId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || "Location Distance Unlock (<2m) failed.");
        if (typeof data.distanceMeters === "number") {
          setDistanceMeters(data.distanceMeters);
        }
        if (data.isBusGpsLive !== undefined) {
          setIsBusGpsLive(data.isBusGpsLive);
        }
        return;
      }

      setLockStatus("UNLOCKED");
      setUnlockedBy("LOCATION_DISTANCE");
      setDistanceMeters(data.distanceMeters);
      setSuccessMessage(data.message || "✓ Attendance successfully unlocked via live GPS proximity!");

      if (onStatusChange) onStatusChange("UNLOCKED");
      if (onUnlocked) onUnlocked();
    } catch (err: any) {
      console.error("Distance unlock error:", err);
      setIsDeviceGpsOff(true);
      setDistanceMeters(null);
      setErrorMessage("Device GPS is turned off or location permission was denied. Please turn on Location services in your device settings to verify distance.");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div
      className={`rounded-3xl border transition-all duration-300 overflow-hidden shadow-lg ${
        lockStatus === "UNLOCKED"
          ? "bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-800/60"
          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
      } ${className}`}
    >
      <div className="p-5 sm:p-6 space-y-4">
        {/* Header Badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                lockStatus === "UNLOCKED"
                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/60"
                  : "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/60"
              }`}
            >
              {lockStatus === "UNLOCKED" ? (
                <Unlock className="w-5 h-5 animate-in zoom-in-75 duration-300" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Attendance Security
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                    lockStatus === "UNLOCKED"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800"
                      : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800"
                  }`}
                >
                  {lockStatus === "UNLOCKED" ? "UNLOCKED ✓" : "LOCKED 🔒"}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {lockStatus === "UNLOCKED"
                  ? unlockedBy === "RFID"
                    ? "Unlocked via Physical RFID Tap"
                    : "Unlocked via Location Distance"
                  : "Proximity Verification Required"}
              </div>
            </div>
          </div>

          <button
            onClick={fetchLockStatus}
            disabled={loading}
            title="Refresh Attendance Lock Status"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-slate-700 dark:text-slate-300" : ""}`} />
          </button>
        </div>

        {/* Status Body */}
        {lockStatus === "UNLOCKED" ? (
          <div className="space-y-3 pt-1">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-xs font-medium space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Security Clearance:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  VERIFIED & UNLOCKED ✓
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Verification Method:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  {unlockedBy === "RFID" ? (
                    <>
                      <CreditCard className="w-3.5 h-3.5" />
                      In-Bus RFID Card Tap
                    </>
                  ) : (
                    <>
                      <MapPin className="w-3.5 h-3.5" />
                      Live GPS Proximity ({distanceMeters !== null ? `${distanceMeters}m` : "<2m"})
                    </>
                  )}
                </span>
              </div>

              {rfidCardId && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">RFID Card UID:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {rfidCardId}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Seat Selection:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  READY TO SELECT ✓
                </span>
              </div>
            </div>

            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold text-center">
              ✓ Attendance security check passed. Please select your seat on the layout below.
            </p>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              To prevent attendance fraud, seat selection remains locked until you are verified physically near the bus or tap your RFID card.
            </p>

            {/* Bus GPS Telematics Status Indicator */}
            {isBusGpsLive === false && (
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold">Bus GPS Offline (Driver Inactive)</div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-normal">
                    The driver has not started the trip or vehicle telematics are offline. Distance unlock requires the bus GPS to be live. You can tap your physical RFID card on the bus reader once boarding starts.
                  </div>
                </div>
              </div>
            )}

            {/* Error / Distance warning */}
            {errorMessage && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Distance indicator */}
            {!errorMessage && isBusGpsLive !== false && (
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  Estimated Proximity to Bus:
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {isDeviceGpsOff
                    ? "Device GPS Off / No Fix"
                    : distanceMeters !== null
                    ? `${distanceMeters} meters`
                    : "Detecting Proximity..."}
                </span>
              </div>
            )}

            {/* Unlock Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {/* Option 1: Location Distance Unlock */}
              <button
                type="button"
                onClick={handleLocationDistanceUnlock}
                disabled={unlocking || isBusGpsLive === false}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-xs shadow-sm transition-all active:scale-98 disabled:opacity-50 cursor-pointer ${
                  isBusGpsLive === false
                    ? "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed"
                    : "bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white"
                }`}
              >
                {unlocking ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Distance...</span>
                  </>
                ) : isBusGpsLive === false ? (
                  <>
                    <Radio className="w-4 h-4 text-slate-400" />
                    <span>Bus GPS Offline (Driver Inactive)</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4" />
                    <span>Distance Unlock (&lt;2m)</span>
                  </>
                )}
              </button>

              {/* Option 2: RFID Unlock Info */}
              <div
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs text-center select-none"
                title="Tap your registered physical RFID smart card on the bus entrance reader"
              >
                <CreditCard className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Tap RFID Card on Bus</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">
                Hardware RFID reader at bus door instantly unlocks.
              </span>

              {onPeekSeats && (
                <button
                  type="button"
                  onClick={onPeekSeats}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Peek Seats</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
