"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ScanFace,
  DoorOpen,
  Camera,
  CameraOff,
  SwitchCamera,
  CheckCircle2,
  AlertTriangle,
  Users,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Zap,
  ZapOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { BusGateType, BusGateEvent } from "@/lib/types";

interface DriverGateCameraConsoleProps {
  busId: number;
  busNumber?: string;
  tripId?: string | null;
  capacity?: number;
  currentStopName?: string;
  latitude: number;
  longitude: number;
  filterRouteId?: string;
}

interface GateStreamEvent {
  id: string;
  gateType: BusGateType;
  studentName?: string;
  studentIdCode?: string;
  isAuthorized: boolean;
  confidence?: number;
  stopName?: string;
  timestamp: string;
}

export function DriverGateCameraConsole({
  busId,
  busNumber = "40",
  tripId,
  capacity = 50,
  currentStopName = "Current Stop",
  latitude,
  longitude,
  filterRouteId,
}: DriverGateCameraConsoleProps) {
  const [activeGate, setActiveGate] = useState<BusGateType>("GATE_IN");
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [occupancyCount, setOccupancyCount] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<GateStreamEvent[]>([]);
  const [activeAlert, setActiveAlert] = useState<{
    type: "SUCCESS" | "INTRUDER";
    title: string;
    subtitle: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout>();

  // Audio Alerts
  const playSound = useCallback((type: "BOARDED" | "ALIGHTED" | "INTRUDER") => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === "BOARDED") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(659.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === "ALIGHTED") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        // Intruder Siren Warning
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.2);
        osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      }
    } catch {}
  }, []);

  const triggerHaptic = useCallback((type: "success" | "alert" = "success") => {
    try {
      if (typeof window !== "undefined" && navigator?.vibrate) {
        if (type === "success") navigator.vibrate([50, 40, 70]);
        else navigator.vibrate([150, 80, 150, 80, 200]);
      }
    } catch {}
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = useCallback(async (facing: "environment" | "user" = facingMode) => {
    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err) {
      console.warn("Driver gate camera access error:", err);
      setIsCameraActive(false);
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    // Listen for Transport Manager intercept orders
    let alertChannel: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        alertChannel = new BroadcastChannel("campusfleet_driver_alerts");
        alertChannel.onmessage = (event) => {
          if (
            event?.data?.type === "SECURITY_INTERCEPT_ORDER" &&
            Number(event.data.busId) === Number(busId)
          ) {
            playSound("INTRUDER");
            triggerHaptic("alert");
            setActiveAlert({
              type: "INTRUDER",
              title: "🚨 DISPATCH ORDER: VERIFY COMMUTER ID",
              subtitle: event.data.message || "Transport Manager ordered manual ticket inspection.",
            });
          }
        };
      }
    } catch (e) {
      // fallback
    }

    return () => {
      stopCamera();
      if (alertChannel) alertChannel.close();
    };
  }, [busId, playSound, stopCamera]);

  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    if (isCameraActive) {
      await startCamera(nextFacing);
    }
  };

  // Generate 512-d feature vector from current frame
  const captureVectorFromVideo = (): number[] => {
    if (!videoRef.current || !canvasRef.current) {
      // Deterministic fallback vector
      return Array.from({ length: 512 }, () => 0.05);
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = 320;
    canvas.height = 240;

    const ctx = canvas.getContext("2d");
    if (!ctx) return Array.from({ length: 512 }, () => 0.05);

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const embedding = new Float32Array(512);
    const stepX = Math.floor(canvas.width / 32);
    const stepY = Math.floor(canvas.height / 16);

    let idx = 0;
    for (let y = 0; y < 16 && idx < 512; y++) {
      for (let x = 0; x < 32 && idx < 512; x++) {
        const p = (y * stepY * canvas.width + x * stepX) * 4;
        const lum = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000 / 255;
        embedding[idx] = (lum - 0.5) * 2.0;
        idx++;
      }
    }

    let sumSq = 0;
    for (let i = 0; i < 512; i++) sumSq += embedding[i] * embedding[i];
    const norm = Math.sqrt(sumSq) || 1.0;
    return Array.from(embedding).map((v) => Number((v / norm).toFixed(6)));
  };

  // Trigger Gate Verification Inference
  const handleTriggerGateScan = async () => {
    setIsScanning(true);
    setActiveAlert(null);

    try {
      const embedding = captureVectorFromVideo();

      const res = await fetch("/api/biometrics/verify-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId,
          tripId,
          gateType: activeGate,
          embedding,
          latitude,
          longitude,
          stopName: currentStopName,
          filterRouteId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Gate verification request failed");
      }

      if (data.matched && data.isAuthorized) {
        // Authorized Commuter
        const student = data.student;
        playSound(activeGate === "GATE_IN" ? "BOARDED" : "ALIGHTED");
        triggerHaptic("success");

        if (activeGate === "GATE_IN") {
          setOccupancyCount((prev) => Math.min(capacity, prev + 1));
          setActiveAlert({
            type: "SUCCESS",
            title: `✓ ${student.name} BOARDED`,
            subtitle: `${student.studentIdCode} • ${student.confidence}% Confidence • ${currentStopName}`,
          });
        } else {
          setOccupancyCount((prev) => Math.max(0, prev - 1));
          setActiveAlert({
            type: "SUCCESS",
            title: `✓ ${student.name} ALIGHTED`,
            subtitle: `${student.studentIdCode} • Alighted at ${currentStopName}`,
          });
        }

        const newEvent: GateStreamEvent = {
          id: String(Date.now()),
          gateType: activeGate,
          studentName: student.name,
          studentIdCode: student.studentIdCode,
          isAuthorized: true,
          confidence: student.confidence,
          stopName: currentStopName,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        };

        setRecentEvents((prev) => [newEvent, ...prev.slice(0, 14)]);
      } else {
        // Intruder / Unauthorized Person
        playSound("INTRUDER");
        triggerHaptic("alert");

        // Broadcast to Transport Manager dashboard instantly
        if (typeof window !== "undefined" && "BroadcastChannel" in window) {
          try {
            const secChannel = new BroadcastChannel("campusfleet_security_incidents");
            secChannel.postMessage({
              type: "NEW_INCIDENT",
              busId,
              busNumber,
              incidentId: data.incidentId,
              stopName: currentStopName,
              latitude,
              longitude,
              timestamp: new Date().toISOString(),
            });
            secChannel.close();
          } catch (e) {
            // non-fatal
          }
        }

        setActiveAlert({
          type: "INTRUDER",
          title: "⚠ SECURITY ALERT: UNAUTHORIZED COMMUTER",
          subtitle: `Unregistered face detected at ${currentStopName}. Incident auto-dispatched to Transport Manager.`,
        });

        const intruderEvent: GateStreamEvent = {
          id: String(Date.now()),
          gateType: activeGate,
          studentName: "Unauthorized Person",
          studentIdCode: "UNKNOWN",
          isAuthorized: false,
          confidence: 0,
          stopName: currentStopName,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        };

        setRecentEvents((prev) => [intruderEvent, ...prev.slice(0, 14)]);
      }
    } catch (err: any) {
      console.warn("Scan inference error:", err);
    } finally {
      setIsScanning(false);
    }
  };

  const occupancyPercent = Math.min(100, Math.round((occupancyCount / capacity) * 100));

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
      
      {/* ── TOP HEADER & OCCUPANCY METER ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 shrink-0">
            <ScanFace className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Autonomous Dual-Gate Camera Telematics
              </h3>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Zero-Touch Face ID Boarding & Alighting • Auto-Attendance & Intruder Shield
            </p>
          </div>
        </div>

        {/* Live Headcount Display */}
        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Onboard:</span>
          </div>
          <span className="font-mono text-base font-black text-slate-900 dark:text-white">
            {occupancyCount} <span className="text-xs text-slate-400 font-normal">/ {capacity}</span>
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              occupancyPercent > 90
                ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                : occupancyPercent > 70
                ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
            }`}
          >
            {occupancyPercent}% Load
          </span>
        </div>
      </div>

      {/* ── GATE SELECTION & CAMERA TOOLBAR ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Gate In vs Gate Out Switcher */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveGate("GATE_IN")}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeGate === "GATE_IN"
                ? "bg-blue-600 text-white shadow-md"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <ScanFace className="w-4 h-4" />
            <span>Gate In (Front Entry)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveGate("GATE_OUT")}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeGate === "GATE_OUT"
                ? "bg-purple-600 text-white shadow-md"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <DoorOpen className="w-4 h-4" />
            <span>Gate Out (Exit Door)</span>
          </button>
        </div>

        {/* Camera Quick Toggles */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => (isCameraActive ? stopCamera() : startCamera())}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
              isCameraActive
                ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                : "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400"
            }`}
          >
            {isCameraActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
            <span>{isCameraActive ? "Standby" : "Start Cam"}</span>
          </button>

          <button
            type="button"
            onClick={toggleCameraFacing}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Switch Front/Back Camera"
          >
            <SwitchCamera className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleTriggerGateScan}
            disabled={isScanning}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md flex items-center gap-1.5 transition-transform active:scale-95 ${
              activeGate === "GATE_IN"
                ? "bg-blue-600 hover:bg-blue-500"
                : "bg-purple-600 hover:bg-purple-500"
            }`}
          >
            {isScanning ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ScanFace className="w-3.5 h-3.5" />
            )}
            <span>{activeGate === "GATE_IN" ? "Test Boarding In" : "Test Alighting Out"}</span>
          </button>
        </div>
      </div>

      {/* ── LIVE HUD CAMERA VIEWPORT & STATUS OVERLAY ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Camera Viewport (Left 7 Cols) */}
        <div className="lg:col-span-7 relative aspect-[4/3] bg-black rounded-3xl overflow-hidden border-2 border-slate-200 dark:border-slate-800 shadow-inner flex items-center justify-center">
          
          <video
            ref={videoRef}
            className="w-full h-full object-cover select-none pointer-events-none"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Offline/Standby Overlay */}
          {!isCameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-6 space-y-3 z-10">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                <CameraOff className="w-7 h-7" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">Gate Camera In Standby</p>
                <p className="text-xs text-slate-500 max-w-xs mt-0.5">
                  Tap &quot;Start Cam&quot; or use &quot;Test Boarding In&quot; to simulate gate telematics.
                </p>
              </div>
              <button
                type="button"
                onClick={() => startCamera()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-transform active:scale-95"
              >
                Turn On Camera
              </button>
            </div>
          )}

          {/* Active Gate Reticle Overlay */}
          {isCameraActive && (
            <div className="absolute inset-6 border border-white/20 rounded-2xl pointer-events-none flex flex-col justify-between p-3 z-10">
              <div className="flex justify-between items-start">
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-black/60 text-white border border-white/10 backdrop-blur-md">
                  {activeGate === "GATE_IN" ? "● CAM 1: FRONT DOOR ENTRY" : "● CAM 2: REAR AISLE EXIT"}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-black/60 border border-emerald-500/30">
                  AI GATE TELEMATICS
                </span>
              </div>

              {/* Center Target Box */}
              <div className="self-center w-40 h-48 border-2 border-dashed border-blue-400/60 rounded-3xl flex items-center justify-center">
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-pulse" />
              </div>

              <div className="text-center">
                <span className="text-[10px] font-mono text-slate-300 bg-black/60 px-3 py-1 rounded-lg border border-white/10">
                  Stop: {currentStopName} • Driver GPS: {typeof latitude === "number" ? latitude.toFixed(4) : "--"}, {typeof longitude === "number" ? longitude.toFixed(4) : "--"}
                </span>
              </div>
            </div>
          )}

          {/* Active Alert Banner Overlay */}
          {activeAlert && (
            <div
              className={`absolute bottom-4 left-4 right-4 p-3.5 rounded-2xl backdrop-blur-md shadow-2xl flex items-center gap-3 z-20 animate-in slide-in-from-bottom-2 ${
                activeAlert.type === "SUCCESS"
                  ? "bg-emerald-950/90 border border-emerald-500/40 text-emerald-300"
                  : "bg-rose-950/90 border border-rose-500/50 text-rose-300"
              }`}
            >
              {activeAlert.type === "SUCCESS" ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 animate-bounce" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-black text-xs text-white truncate">{activeAlert.title}</p>
                <p className="text-[11px] opacity-90 truncate">{activeAlert.subtitle}</p>
              </div>
            </div>
          )}
        </div>

        {/* Live Gate Stream Event Feed (Right 5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Live Gate Stream
              </span>
              <span className="text-[10px] font-mono text-slate-400">Real-Time Events</span>
            </div>

            {recentEvents.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-600 text-xs font-mono space-y-1">
                <ScanFace className="w-8 h-8 mx-auto opacity-40 mb-2" />
                <p>Waiting for gate crossings...</p>
                <p className="text-[10px]">Tap &quot;Test Boarding In&quot; to trigger</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {recentEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                      evt.isAuthorized
                        ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                        : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          evt.isAuthorized
                            ? evt.gateType === "GATE_IN"
                              ? "bg-blue-500"
                              : "bg-purple-500"
                            : "bg-rose-500 animate-ping"
                        }`}
                      />
                      <div className="truncate">
                        <p className="font-bold text-slate-900 dark:text-white truncate">
                          {evt.studentName}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {evt.gateType === "GATE_IN" ? "Entered (Boarded)" : "Exited (Alighted)"} • {evt.stopName}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono text-slate-400 block">{evt.timestamp}</span>
                      {evt.confidence ? (
                        <span className="text-[10px] font-mono font-bold text-emerald-500">
                          {evt.confidence}%
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-bold text-rose-500">ALERT</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-500 flex items-center justify-between">
            <span>Bus {busNumber} • Dual Telematics Active</span>
            <span className="text-emerald-500 font-bold">● ONLINE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
