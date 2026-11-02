"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import jsQR from "jsqr";
import { store } from "@/lib/store";
import { Bus, Trip, Route, Shift, AttendanceRecord } from "@/lib/types";
import { getBestTripForBus } from "@/lib/trip-resolver";
import {
  BusFront,
  QrCode,
  Camera,
  CameraOff,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  Sparkles,
  MapPin,
  Clock,
  Users,
  ShieldCheck,
  ArrowRight,
  Flame,
} from "lucide-react";

interface CrewBusSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: "driver" | "conductor";
  initialTab?: "CARDS" | "SCANNER";
  currentUser?: any;
  currentTripId?: string;
  onSelectBusAndTrip: (busId: number, tripId?: string) => void;
  onAttendanceMarked?: (record: AttendanceRecord) => void;
}

export function CrewBusSelectorModal({
  isOpen,
  onClose,
  role,
  initialTab = "CARDS",
  currentUser,
  currentTripId,
  onSelectBusAndTrip,
  onAttendanceMarked,
}: CrewBusSelectorModalProps) {
  const [activeTab, setActiveTab] = useState<"CARDS" | "SCANNER">(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);
  const [searchQuery, setSearchQuery] = useState("");
  const [buses, setBuses] = useState<Bus[]>(store.getBuses());
  const [trips, setTrips] = useState<Trip[]>(store.getTrips());
  const [routes, setRoutes] = useState<Route[]>(store.getRoutes());
  const [shifts, setShifts] = useState<Shift[]>(store.getShifts());

  // QR Scanner State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setBuses(store.getBuses());
      setTrips(store.getTrips());
      setRoutes(store.getRoutes());
      setShifts(store.getShifts());
    });
    return unsub;
  }, []);

  // Filter out historical completed trips from older days
  const todayStr = new Date().toISOString().slice(0, 10);
  const activeAndScheduledTrips = trips.filter(
    (t) => t.status === "IN_PROGRESS" || t.status === "SCHEDULED" || t.tripDate === todayStr
  );

  // Group bus entries with their corresponding trip & route
  const busEntries = buses
    .map((bus) => {
      // Find active trip or scheduled operational shift for this bus
      const activeTrip = getBestTripForBus(bus.id, trips, shifts);

      const route = routes.find((r) => r.id === (activeTrip?.routeId || bus.currentRouteId));
      const shift = shifts.find((s) => s.id === activeTrip?.shiftId);

      return {
        bus,
        trip: activeTrip,
        route,
        shift,
      };
    })
    .filter(({ trip }) => {
      if (!trip) return true;
      if (store.isTripSpecial(trip)) {
        const user = currentUser || store.getCurrentUser();
        const userId = user?.id;
        if (role === "driver") {
          return Boolean(userId && trip.driverId === userId);
        }
        if (role === "conductor") {
          return Boolean(userId && (trip.conductorId === userId || trip.conductorId === user?.fullName));
        }
        return false;
      }
      return true;
    });

  const filteredEntries = busEntries.filter(({ bus, route }) => {
    const q = searchQuery.toLowerCase();
    return (
      String(bus.busNumber).includes(q) ||
      bus.registrationNo.toLowerCase().includes(q) ||
      (route && route.name.toLowerCase().includes(q))
    );
  });

  // Handle camera start/stop
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    setIsCameraActive(false);
  }, []);

  const scanTick = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          handleQrDetected(code.data);
          return;
        }
      }
    }
    requestRef.current = requestAnimationFrame(scanTick);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setScanSuccess(null);
    setIsCameraActive(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        requestRef.current = requestAnimationFrame(scanTick);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("Camera permission denied or camera device unavailable.");
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === "SCANNER") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  const handleSelectBusCard = async (bus: Bus, trip?: Trip) => {
    const user = currentUser || store.getCurrentUser();
    const userId = user?.id || `user-${role}`;
    const userName = user?.fullName || (role === "driver" ? "Bus Driver" : "Bus Conductor");

    // Record attendance via card selection
    const res = await store.recordUserAttendance({
      userId,
      userName,
      userRole: role,
      busId: bus.id,
      tripId: trip?.id,
      method: "MANUAL_SELECT",
      notes: `Duty checked-in via fleet bus card selector`,
    });

    if (onAttendanceMarked && res.record) {
      onAttendanceMarked(res.record);
    }

    onSelectBusAndTrip(bus.id, trip?.id);
    onClose();
  };

  const handleQrDetected = async (rawCode: string) => {
    stopCamera();
    try {
      let busId = "";
      try {
        const parsed = JSON.parse(rawCode);
        busId = parsed.busId || parsed.id || "";
      } catch {
        busId = rawCode.trim();
      }

      const matchedBus =
        buses.find((b) => b.id === Number(busId) || String(b.busNumber).toLowerCase() === String(busId).toLowerCase() || b.registrationNo.toLowerCase() === String(busId).toLowerCase()) ||
        buses[0];

      if (!matchedBus) {
        setCameraError(`Unrecognized Bus QR code: "${rawCode}". Please scan the QR code on the bus door or console.`);
        return;
      }

      const user = currentUser || store.getCurrentUser();
      const userId = user?.id || `user-${role}`;
      const userName = user?.fullName || (role === "driver" ? "Bus Driver" : "Bus Conductor");

      const activeTrip =
        trips.find((t) => t.busId === matchedBus.id && t.status === "IN_PROGRESS") ||
        trips.find((t) => t.busId === matchedBus.id && t.status === "SCHEDULED") ||
        trips.find((t) => t.busId === matchedBus.id);

      if (activeTrip && store.isTripSpecial(activeTrip)) {
        const isAllocated =
          role === "driver"
            ? Boolean(user?.id && activeTrip.driverId === user.id)
            : Boolean(user?.id && (activeTrip.conductorId === user.id || activeTrip.conductorId === user.fullName));

        if (!isAllocated) {
          setCameraError("Access Restricted: This vehicle is operating an exclusive special transit run. You are not allocated as crew for this run.");
          return;
        }
      }

      const res = await store.recordUserAttendance({
        userId,
        userName,
        userRole: role,
        busId: matchedBus.id,
        tripId: activeTrip?.id,
        method: "BUS_QR_SCAN",
        notes: `Duty attendance verified at bus door via physical QR scan`,
      });

      setScanSuccess(`✓ Verified! Attendance recorded for Bus ${matchedBus.busNumber}. Starting duty...`);

      if (onAttendanceMarked && res.record) {
        onAttendanceMarked(res.record);
      }

      setTimeout(() => {
        onSelectBusAndTrip(matchedBus.id, activeTrip?.id);
        onClose();
      }, 1200);
    } catch (e: any) {
      setCameraError(e?.message || "Failed to process QR code.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <BusFront className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <span>Select Your Vehicle & Mark Duty Attendance</span>
              </h2>
              <p className="text-xs text-gray-500">
                Choose the vehicle you are operating today or scan the bus door QR code to verify attendance.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2.5 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle: Cards View vs Scan Bus QR */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-200 dark:bg-gray-800 p-1 rounded-2xl">
            <button
              onClick={() => {
                stopCamera();
                setActiveTab("CARDS");
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "CARDS"
                  ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              <BusFront className="w-4 h-4" />
              <span>Fleet Bus Cards</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("SCANNER");
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "SCANNER"
                  ? "bg-white dark:bg-gray-900 text-green-600 dark:text-green-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>📷 Scan Bus QR to Check In</span>
            </button>
          </div>

          {activeTab === "CARDS" && (
            <div className="relative flex-1 sm:w-64 max-w-sm">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bus name or route..."
                className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none"
              />
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {activeTab === "SCANNER" ? (
            <div className="max-w-md mx-auto space-y-4 py-4 text-center">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300">
                <p className="font-bold flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  Same Bus QR Code Used by Students
                </p>
                <p className="text-[11px] text-blue-700/80 dark:text-blue-400/80 mt-0.5">
                  Point your camera at the physical QR code sticker on the bus door or conductor cockpit.
                </p>
              </div>

              {/* Viewfinder */}
              <div className="relative w-full aspect-square max-w-xs mx-auto rounded-3xl overflow-hidden bg-black border-4 border-blue-500/80 shadow-2xl flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Scanning Frame / Crosshair overlay */}
                <div className="absolute inset-8 border-2 border-dashed border-white/60 rounded-2xl pointer-events-none flex items-center justify-center">
                  <div className="w-12 h-1 bg-green-400/80 rounded-full animate-pulse" />
                </div>

                {!isCameraActive && !cameraError && (
                  <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center p-4 text-white space-y-3">
                    <Camera className="w-10 h-10 text-gray-400 animate-bounce" />
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold"
                    >
                      Start Camera
                    </button>
                  </div>
                )}

                {scanSuccess && (
                  <div className="absolute inset-0 bg-green-600/95 flex flex-col items-center justify-center p-4 text-white space-y-2 animate-in zoom-in">
                    <CheckCircle2 className="w-12 h-12 text-white" />
                    <p className="font-black text-sm">{scanSuccess}</p>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-2xl text-xs text-red-600 dark:text-red-300 font-medium">
                  {cameraError}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEntries.map(({ bus, trip, route, shift }) => {
                const isCurrentActive = trip?.id === currentTripId;

                return (
                  <div
                    key={bus.id}
                    onClick={() => handleSelectBusCard(bus, trip)}
                    className={`relative overflow-hidden p-5 rounded-3xl border transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-4 hover:scale-[1.02] shadow-sm hover:shadow-xl ${
                      isCurrentActive
                        ? "bg-blue-50/50 dark:bg-blue-950/40 border-2 border-blue-500 shadow-blue-500/10"
                        : "bg-white dark:bg-gray-800/90 border-gray-200 dark:border-gray-700/80 hover:border-blue-400"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <BusFront className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-xs font-mono font-black text-blue-600 dark:text-blue-400">
                              {bus.registrationNo}
                            </span>
                            <h3 className="font-black text-sm text-gray-900 dark:text-white leading-tight">
                              Bus {bus.busNumber}
                            </h3>
                          </div>
                        </div>

                        {trip?.status ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              trip.status === "IN_PROGRESS"
                                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                            }`}
                          >
                            {trip.status}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            STANDBY
                          </span>
                        )}
                      </div>

                      {/* Route & Corridor details */}
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{route?.name || "Corridor Unallocated"}</span>
                        </div>
                        {shift && (
                          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                            <span>{shift.name} ({shift.startTime} - {shift.endTime})</span>
                          </div>
                        )}
                      </div>

                      {/* Capacity & Seating Grid info */}
                      <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl text-[11px] font-medium text-gray-600 dark:text-gray-400">
                        <span>Chassis Seating:</span>
                        <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                          {bus.capacity} Seats ({bus.seatLayout !== "NONE" ? bus.seatLayout : "Standard"})
                        </span>
                      </div>
                    </div>

                    {/* Duty Action Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectBusCard(bus, trip);
                      }}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all ${
                        isCurrentActive
                          ? "bg-green-600 text-white shadow-green-600/20"
                          : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
                      }`}
                    >
                      <span>
                        {isCurrentActive
                          ? "✓ Currently Operating"
                          : role === "driver"
                          ? "Drive This Bus"
                          : "Conduct This Bus"}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
