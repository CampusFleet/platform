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
import { useAttendancePolicy } from "@/lib/attendance";
import { getFaceLandmarker } from "@/lib/face-landmarker-loader";
import { boxFromLandmarks, cropFaceJpeg, SteadyFaceTrigger, type FaceBox } from "@/lib/gate/phone-capture";

interface DriverGateCameraConsoleProps {
  busId: number;
  busNumber?: string;
  tripId?: string | null;
  capacity?: number;
  currentStopName?: string;
  latitude: number;
  longitude: number;
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
  busNumber = "",
  tripId,
  capacity = 50,
  currentStopName = "Current Stop",
  latitude,
  longitude,
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

  const { mode: policyMode, rules: policyRules } = useAttendancePolicy();
  const [isDiagnosticOverride, setIsDiagnosticOverride] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  // ── Hybrid capture: the phone only finds + crops the face; the server templates, matches and decides ──
  const landmarkerRef = useRef<any>(null);
  const triggerRef = useRef(new SteadyFaceTrigger());
  const inFlightRef = useRef(false);
  const [autoScan, setAutoScan] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const pollDecision = async (captureId: string) => {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 600 : 1000));
      const res = await fetch(`/api/gate/captures/${captureId}`, { cache: "no-store" });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.status === "DECIDED" || d.status === "REJECTED") return d;
    }
    return null;
  };

  const showDecision = (gate: BusGateType, d: any) => {
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const known = Boolean(d?.student);
    const outcome: string = d?.outcome || "PENDING";
    if (outcome === "DUPLICATE" || outcome === "LOW_QUALITY") return; // silent: already counted / unusable frame
    const ok = ["BOARDED", "ALIGHTED", "ROAMING"].includes(outcome);
    playSound(ok ? (gate === "GATE_IN" ? "BOARDED" : "ALIGHTED") : "INTRUDER");
    triggerHaptic(ok ? "success" : "alert");
    if (outcome === "BOARDED") setOccupancyCount((p) => Math.min(capacity, p + 1));
    if (outcome === "ALIGHTED") setOccupancyCount((p) => Math.max(0, p - 1));
    const titles: Record<string, string> = {
      BOARDED: `✓ ${d.student?.name} BOARDED`,
      ALIGHTED: `✓ ${d.student?.name} ALIGHTED`,
      ROAMING: `⚠ ${d.student?.name} stepped out before departure`,
      WRONG_BUS: `⚠ ${d.student?.name} is booked on another bus`,
      UNAUTHORIZED: "⚠ SECURITY ALERT: UNREGISTERED PERSON",
      UNKNOWN_DEBOARDER: "⚠ Unregistered person left the bus",
      INTRUDER_LEFT: "✓ Flagged person left the bus",
      SPOOF_REJECTED: "⚠ Photo / screen spoof attempt",
      UNKNOWN_LEFT_AT_START: "Unregistered person left at start stop",
    };
    setActiveAlert({
      type: ok || outcome === "INTRUDER_LEFT" ? "SUCCESS" : "INTRUDER",
      title: titles[outcome] || "Gate event recorded",
      subtitle: known
        ? `${d.student.studentIdCode || ""} • ${d.confidence ?? "–"}% match • ${currentStopName}`
        : `${currentStopName} • reported to Transport Manager`,
    });
    setRecentEvents((prev) => [
      {
        id: d?.id || String(Date.now()),
        gateType: gate,
        studentName: d?.student?.name || "Unregistered person",
        studentIdCode: d?.student?.studentIdCode || "UNKNOWN",
        isAuthorized: ok,
        confidence: d?.confidence ?? 0,
        stopName: currentStopName,
        timestamp: now,
      },
      ...prev.slice(0, 14),
    ]);
  };

  const submitCapture = useCallback(
    async (box: FaceBox | null) => {
      const video = videoRef.current;
      if (!video || inFlightRef.current) return;
      const image = cropFaceJpeg(video, box);
      if (!image) return;
      inFlightRef.current = true;
      setIsScanning(true);
      setLastError(null);
      const gate = activeGate;
      try {
        const res = await fetch("/api/gate/captures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            captures: [
              {
                idempotencyKey: `ph-${crypto.randomUUID()}`,
                door: gate === "GATE_IN" ? "IN" : "OUT",
                capturedAt: new Date().toISOString(),
                latitude: Number.isFinite(latitude) ? latitude : null,
                longitude: Number.isFinite(longitude) ? longitude : null,
                image,
              },
            ],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Capture upload failed");
        const accepted = data.accepted?.[0];
        if (!accepted) throw new Error(data.rejected?.[0]?.error || "Capture rejected");
        const decision = await pollDecision(accepted.captureId);
        if (decision) showDecision(gate, decision);
        else setLastError("Decision pending — it will appear in the manifest when the server finishes.");
      } catch (err: any) {
        setLastError(err?.message || "Scan failed");
      } finally {
        inFlightRef.current = false;
        setIsScanning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeGate, latitude, longitude, currentStopName, capacity]
  );

  // Automatic scanning: detect a steady, large-enough face, then capture once per person (cooldown).
  useEffect(() => {
    if (!isCameraActive || !autoScan) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      landmarkerRef.current = landmarkerRef.current || (await getFaceLandmarker());
    })();
    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (video && lm && video.readyState >= 2 && !inFlightRef.current) {
        try {
          const res = lm.detectForVideo(video, performance.now());
          const box = boxFromLandmarks(res?.faceLandmarks?.[0] || [], video.videoWidth, video.videoHeight);
          if (triggerRef.current.update(box, video.videoWidth)) void submitCapture(box);
        } catch {
          // transient detector error — try next tick
        }
      }
      timer = setTimeout(tick, 250);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isCameraActive, autoScan, submitCapture]);

  // Crew-confirmed manual scan (e.g. passenger cannot face the camera steadily)
  const handleTriggerGateScan = async () => {
    setActiveAlert(null);
    const video = videoRef.current;
    let box: FaceBox | null = null;
    try {
      const lm = landmarkerRef.current || (await getFaceLandmarker());
      landmarkerRef.current = lm;
      if (video && lm) box = boxFromLandmarks(lm.detectForVideo(video, performance.now())?.faceLandmarks?.[0] || [], video.videoWidth, video.videoHeight);
    } catch {}
    await submitCapture(box);
  };

  const occupancyPercent = Math.min(100, Math.round((occupancyCount / capacity) * 100));

  // Power-Saving Hardware Standby when attendance policy does not require live gate cameras
  if (!policyRules.isDriverGateCameraActive && !isDiagnosticOverride) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 shrink-0">
              <ScanFace className="w-6 h-6 text-zinc-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                  Gate Camera Standby
                </span>
                <span className="text-xs font-mono font-bold text-slate-500">
                  Policy: {policyRules.modeLabel}
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                Dual-Gate Telematics Idle
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {policyRules.driverCameraStandbyReason}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDiagnosticOverride(true)}
            className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 active:scale-95 flex items-center gap-1.5"
            title="Run Camera Diagnostic Test"
          >
            <Camera className="w-3.5 h-3.5 text-blue-500" />
            <span>Hardware Test</span>
          </button>
        </div>
      </div>
    );
  }

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
            onClick={() => setAutoScan((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
              autoScan
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            }`}
            title="Scan automatically when a face is steady in front of the camera"
          >
            {autoScan ? "Auto: ON" : "Auto: OFF"}
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
            <span>Scan now</span>
          </button>
        </div>
      </div>

      {lastError && (
        <div className="px-4 py-2.5 rounded-2xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
          {lastError}
        </div>
      )}

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
                  Tap &quot;Start Cam&quot;. Faces are scanned automatically when someone stands in front of the camera.
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
