"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { store } from "@/lib/store";
import { Booking, Student, Trip } from "@/lib/types";
import {
  QrCode,
  Camera,
  CameraOff,
  CheckCircle2,
  AlertTriangle,
  Search,
  ShieldCheck,
  Volume2,
  VolumeX,
  UserCheck,
  UserX,
  Keyboard,
  XCircle,
  RefreshCw,
  User,
  ShieldAlert,
  BadgeCheck,
  Footprints,
  ArrowLeft,
  ScanFace,
} from "lucide-react";
import Link from "next/link";
import { getSafePhotoUrl } from "@/lib/image-utils";
import jsQR from "jsqr";

interface QRPassScannerProps {
  trip: Trip;
  bookings: Booking[];
  students: Student[];
  onAttendanceSuccess: (studentName: string, method: string) => void;
  fullScreenMode?: boolean;
  backHref?: string;
}

// Synthesize audio confirmation chimes using Web Audio API
function playChime(type: "success" | "error" | "duplicate") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === "success") {
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.35);
    } else if (type === "duplicate") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(550, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {
    // Ignore
  }
}

function triggerHaptic(type: "success" | "warning" | "error") {
  try {
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      if (type === "success") window.navigator.vibrate([60, 40, 60]);
      else if (type === "warning") window.navigator.vibrate([100, 50, 100]);
      else window.navigator.vibrate(200);
    }
  } catch {
    // Ignore
  }
}

export function QRPassScanner({
  trip,
  bookings,
  students,
  onAttendanceSuccess,
  fullScreenMode = false,
  backHref = "/conductor",
}: QRPassScannerProps) {
  const [activeTab, setActiveTab] = useState<"CAMERA" | "MANUAL">("CAMERA");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const [pendingVerification, setPendingVerification] = useState<{
    student: any;
    booking: any;
    rawCode: string;
    method: string;
  } | null>(null);
  const [quickConfirmMode, setQuickConfirmMode] = useState(false);
  const [quickConfirmCountdown, setQuickConfirmCountdown] = useState<number | null>(null);

  const [lastResult, setLastResult] = useState<{
    status: "APPROVED" | "DUPLICATE" | "REJECTED" | "WRONG_BUS";
    studentName?: string;
        seatNumber?: string;
    photoUrl?: string;
    department?: string;
    boardedAt?: string;
    method?: string;
    message: string;
    timestamp?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScannedCodeRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  const tripBookings = bookings.filter(b => b.tripId === trip.id);
  const pendingBookings = tripBookings.filter(b => b.status === "CONFIRMED" || b.status === "WAITLISTED");

  const verifyPassCode = useCallback(
    async (rawCode: string, method: "Optical QR Scanner" | "Manual Secure Entry" = "Optical QR Scanner") => {
      if (!rawCode || isProcessing) return;

      const now = Date.now();
      if (lastScannedCodeRef.current.code === rawCode && now - lastScannedCodeRef.current.time < 2500) {
        return;
      }
      lastScannedCodeRef.current = { code: rawCode, time: now };

      setIsProcessing(true);

      // Call authoritative backend API with PREVIEW_VERIFY action first
      try {
        const res = await fetch("/api/boarding/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "PREVIEW_VERIFY",
            qrData: rawCode,
            tripId: trip.id,
            busId: trip.busId,
            conductorName: "Conductor Terminal",
          }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          if (soundEnabled) playChime("error");
          triggerHaptic("error");

          if (data.code === "ACTIVE_CLASS_RESTRICTION" || data.status === "CLASS_RESTRICTION") {
            setLastResult({
              status: "REJECTED",
              studentName: data.activeClass?.studentName || data.studentName || "Student",
                            message: data.message || `❌ BOARDING DENIED: Student has a scheduled lecture (${data.activeClass?.subject || data.subject || "Lecture"}) at this time.`,
              timestamp: new Date().toLocaleTimeString(),
            });
          } else if (data.code === "ALREADY_BOARDED" || data.status === "DUPLICATE") {
            if (soundEnabled) playChime("duplicate");
            triggerHaptic("warning");
            setLastResult({
              status: "DUPLICATE",
              studentName: data.student?.fullName || data.studentName || "Commuter",
                            seatNumber: data.booking?.seatNumber || data.seatNumber || "Seat Assigned",
              photoUrl: data.student?.photoUrl || data.photoUrl || "",
              department: data.student?.department || data.department || "",
              boardedAt: data.booking?.boardedAt || data.boardedAt || "",
              message: data.message || `DUPLICATE REPLAY: Pass belongs to ${data.student?.fullName || "Student"} , who was ALREADY checked in earlier today. Each student can board strictly once per shift.`,
              timestamp: new Date().toLocaleTimeString(),
            });
          } else {
            setLastResult({
              status: "REJECTED",
              message: data.message || "UNVERIFIED PASS: Boarding rejected by server.",
              timestamp: new Date().toLocaleTimeString(),
            });
          }
          setIsProcessing(false);
          return;
        }

        // Server responded READY_FOR_CONFIRMATION with verified student and photo details
        const studentInfo = data.student || { fullName: "Student" };
        const bookingInfo = data.booking || {};

        setPendingVerification({
          student: studentInfo,
          booking: bookingInfo,
          rawCode,
          method,
        });
        setIsProcessing(false);
        return;
      } catch {
        // Never verify passes locally: an unsigned code must not board if the server is unreachable.
        if (soundEnabled) playChime("error");
        triggerHaptic("error");
        setLastResult({
          status: "REJECTED",
          message: "Could not reach the server. Check the connection and scan again.",
          timestamp: new Date().toLocaleTimeString(),
        });
        setIsProcessing(false);
      }
    },
    [tripBookings, students, bookings, trip.id, trip.busId, soundEnabled, isProcessing]
  );

  // Conductor marks attendance after confirming identity against passport photo
  const handleConfirmBoarding = useCallback(async () => {
    if (!pendingVerification) return;
    const { student, booking, rawCode, method } = pendingVerification;
    setIsProcessing(true);

    try {
      const res = await fetch("/api/boarding/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CONFIRM_BOARDING",
          qrData: rawCode,
          tripId: trip.id,
          busId: trip.busId,
          conductorName: "Conductor Terminal",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === "ALREADY_BOARDED" || data.status === "DUPLICATE") {
          if (soundEnabled) playChime("duplicate");
          triggerHaptic("warning");
          setLastResult({
            status: "DUPLICATE",
            studentName: student.fullName,
                        seatNumber: booking.seatNumber || booking.seat_number,
            photoUrl: student.photoUrl,
            department: student.department,
            boardedAt: booking.boardedAt,
            message: `DUPLICATE REPLAY: Pass belongs to ${student.fullName} , who was ALREADY checked in earlier today. Duplicate scan blocked.`,
            timestamp: new Date().toLocaleTimeString(),
          });
        } else {
          if (soundEnabled) playChime("error");
          setLastResult({
            status: "REJECTED",
            message: data.message || "Failed to finalize attendance on server.",
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        setIsProcessing(false);
        setPendingVerification(null);
        return;
      }
    } catch (e) {
      console.warn("Backend confirm scan failed, recording locally", e);
    }

    const isStanding = booking.passengerType === "STANDING_TILL_MERGE" || booking.passenger_type === "STANDING_TILL_MERGE";

    store.recordAttendance(
      student.id || booking.studentId || "unknown",
      trip.id,
      "QR_SCAN",
      "BOARDED",
      `Verified via Conductor ${method} (Photo ID Match Confirmed)`
    );

    if (soundEnabled) playChime("success");
    triggerHaptic("success");

    setLastResult({
      status: "APPROVED",
      studentName: student.fullName,
            seatNumber: isStanding ? "STAND" : (booking.seatNumber || booking.seat_number || "Seat Assigned"),
      method,
      message: isStanding
        ? `⚡ Attendance Marked! Standing Passenger Authorized Till ${booking.mergeStopName || "Merge Stop"}.`
        : `Attendance Marked & Verified! Allocated Seat: ${booking.seatNumber || booking.seat_number || "Seat Assigned"}`,
      timestamp: new Date().toLocaleTimeString(),
    });

    onAttendanceSuccess(student.fullName, method);
    setIsProcessing(false);
    setPendingVerification(null);
    setManualInput("");
  }, [pendingVerification, trip.id, trip.busId, soundEnabled, onAttendanceSuccess]);

  // Conductor marks seat held for student to freely roam campus until bus fills
  const handleConfirmRoaming = useCallback(async () => {
    if (!pendingVerification) return;
    const { student, booking, method } = pendingVerification;
    setIsProcessing(true);

    try {
      const res = await fetch("/api/boarding/roaming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CHECK_IN_ROAMING",
          studentId: student.id || booking.studentId,
          bookingId: booking.id,
          tripId: trip.id,
          busId: trip.busId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (soundEnabled) playChime("success");
        triggerHaptic("success");

        setLastResult({
          status: "APPROVED",
          studentName: student.fullName,
                    seatNumber: booking.seatNumber || booking.seat_number || "Seat Held",
          method,
          message: `🎒 SEAT HELD & ROAMING ACTIVE: ${student.fullName} (Seat ${booking.seatNumber || booking.seat_number || "Held"}) is free to roam campus without keeping a physical bag on the seat. Audible departure alert will ring when bus fills.`,
          timestamp: new Date().toLocaleTimeString(),
        });

        // Also record in local store for immediate UI reactivity
        store.recordAttendance(
          student.id || booking.studentId || "unknown",
          trip.id,
          "QR_SCAN",
          "BOARDED",
          `Seat held digitally (Roaming Campus) - verified via Conductor ${method}`
        );

        onAttendanceSuccess(student.fullName, "Seat Hold & Campus Roam");
        setIsProcessing(false);
        setPendingVerification(null);
        setManualInput("");
        return;
      }
    } catch (e) {
      console.warn("Failed to check-in roaming on server, falling back to regular boarding", e);
    }

    handleConfirmBoarding();
  }, [pendingVerification, trip.id, trip.busId, soundEnabled, onAttendanceSuccess, handleConfirmBoarding]);

  const handleRejectMismatch = useCallback(() => {
    if (!pendingVerification) return;
    const { student } = pendingVerification;

    if (soundEnabled) playChime("error");
    triggerHaptic("error");

    setLastResult({
      status: "REJECTED",
      studentName: student.fullName,
            message: `❌ BOARDING DENIED: Identity verification failed. Commuter face does not match official passport photo for ${student.fullName}.`,
      timestamp: new Date().toLocaleTimeString(),
    });

    setPendingVerification(null);
    setIsProcessing(false);
    setManualInput("");
  }, [pendingVerification, soundEnabled]);

  const scanVideoFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isCameraActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        verifyPassCode(code.data, "Optical QR Scanner");
      }
    }

    if (isCameraActive) {
      animationFrameRef.current = requestAnimationFrame(scanVideoFrame);
    }
  }, [isCameraActive, verifyPassCode]);

  const startCamera = async (facing: "environment" | "user" = cameraFacing) => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError("Camera stream not supported in this browser. Use Manual Code entry.");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
      }

      streamRef.current = stream;
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn("Camera init error:", err);
      setCameraError(err?.message || "Camera permission denied or camera in use. Please allow camera permissions in browser.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const toggleCameraFacing = () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(nextFacing);
    if (isCameraActive) {
      startCamera(nextFacing);
    }
  };

  useEffect(() => {
    if (isCameraActive && streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.setAttribute("playsinline", "true");
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive]);

  useEffect(() => {
    if (isCameraActive) {
      animationFrameRef.current = requestAnimationFrame(scanVideoFrame);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCameraActive, scanVideoFrame]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    verifyPassCode(manualInput.trim(), "Manual Secure Entry");
  };

  return (
    <div className={fullScreenMode 
      ? "fixed inset-0 z-[100] bg-black text-white flex flex-col overflow-hidden select-none"
      : "bg-white dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-md dark:shadow-2xl space-y-5 text-gray-900 dark:text-white transition-colors"
    }>
      {/* Top Header / HUD for Full Screen Mode */}
      {fullScreenMode ? (
        <header className="relative z-30 flex items-center justify-between p-4 border-b border-white/10 bg-black/70 backdrop-blur-md shrink-0 w-full">
          <div className="flex items-center gap-3">
            <Link
              href={backHref || "/conductor"}
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/10 shadow-sm"
              title="Return to Hub"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-white">
                  {(() => {
                    const bus = store.getBuses().find(b => b.id === trip?.busId);
                    const shift = store.getShifts().find(s => s.id === trip?.shiftId);
                    const busLabel = bus?.busNumber ? `Bus ${bus.busNumber}` : (trip?.busId ? `Bus ${trip.busId}` : "Vehicle");
                    const shiftLabel = shift?.name || (trip?.tripCode?.includes("-") ? trip.tripCode.split("-").slice(0, 2).join("-") : trip?.tripCode || "Live Scanner");
                    return `${busLabel} • ${shiftLabel}`;
                  })()}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  MANUAL BACKUP
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                {(() => {
                  const shift = store.getShifts().find(s => s.id === trip?.shiftId);
                  return shift?.startTime ? `Departure ${shift.startTime} • ` : "";
                })()}Autonomous Gate Active • Exception Fallback Scanner
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isCameraActive && (
              <button
                type="button"
                onClick={toggleCameraFacing}
                className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-gray-200 hover:text-white transition-colors cursor-pointer border border-white/10"
                title="Flip Camera Lens"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2.5 rounded-2xl border transition-colors cursor-pointer ${
                soundEnabled
                  ? "bg-green-500/20 border-green-500/40 text-green-400"
                  : "bg-white/10 border-white/10 text-gray-400"
              }`}
              title={soundEnabled ? "Chime Audio ON" : "Chime Muted"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {isCameraActive && (
              <button
                type="button"
                onClick={stopCamera}
                className="px-3 py-2 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Stop
              </button>
            )}
          </div>
        </header>
      ) : null}

      {/* Mode Tabs */}
      {fullScreenMode ? (
        <div className="relative z-30 flex flex-col items-center py-2 px-4 bg-black/40 backdrop-blur-xs shrink-0 w-full gap-2">
          {/* Subtle exception notice */}
          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-sans">
            <ScanFace className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Autonomous Face ID active. Scan here only for exceptions or unverified commuters.</span>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-white/10 rounded-2xl border border-white/10 max-w-sm w-full">
            <button
              onClick={() => {
                setActiveTab("CAMERA");
                setLastResult(null);
              }}
              className={`flex-1 py-2 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === "CAMERA"
                  ? "bg-green-500 text-gray-950 shadow-md font-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Optical QR</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("MANUAL");
                stopCamera();
                setLastResult(null);
              }}
              className={`flex-1 py-2 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === "MANUAL"
                  ? "bg-blue-600 text-white shadow-md font-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>Roll ID / Code</span>
            </button>
          </div>
        </div>
      ) : (
        /* Regular Modal / Card Mode Tabs */
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-950/80 rounded-2xl w-full sm:w-auto border border-gray-200 dark:border-gray-800">
            <button
              onClick={() => {
                setActiveTab("CAMERA");
                setLastResult(null);
              }}
              className={`flex-1 sm:flex-none py-2 px-4 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === "CAMERA"
                  ? "bg-green-600 dark:bg-green-500 text-white dark:text-gray-950 shadow-md"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Optical QR Radar</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("MANUAL");
                stopCamera();
                setLastResult(null);
              }}
              className={`flex-1 sm:flex-none py-2 px-4 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === "MANUAL"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>Code Entry</span>
            </button>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              soundEnabled
                ? "bg-green-50 dark:bg-green-950/80 border-green-200 dark:border-green-700/80 text-green-800 dark:text-green-300 shadow-xs"
                : "bg-gray-100 dark:bg-gray-950/60 border-gray-200 dark:border-gray-800 text-gray-500"
            }`}
            title="Toggle Boarding Audio Confirmation Chimes"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundEnabled ? "Chime ON" : "Muted"}</span>
          </button>
        </div>
      )}

      {/* Center Viewport Area */}
      <div className={fullScreenMode ? "flex-1 relative flex flex-col items-center justify-center min-h-0 w-full overflow-hidden" : "space-y-4"}>
        {activeTab === "CAMERA" && (
          <div className={fullScreenMode ? "absolute inset-0 w-full h-full flex flex-col items-center justify-center overflow-hidden" : "space-y-4"}>
            {/* Live Camera Viewfinder */}
            <div className={fullScreenMode
              ? `absolute inset-0 w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden text-white ${isCameraActive ? "block" : "hidden"}`
              : `relative aspect-[4/3] sm:aspect-video min-h-[300px] sm:min-h-[360px] w-full rounded-3xl bg-black flex flex-col items-center justify-center overflow-hidden border border-gray-800 shadow-2xl text-white ${isCameraActive ? "block" : "hidden"}`
            }>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />

              <canvas ref={canvasRef} className="hidden" />

              {/* Glowing Laser Scan Beam */}
              <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent shadow-[0_0_20px_#2dd4bf] animate-bounce z-20 pointer-events-none" />

              {/* Viewfinder Precision Reticle */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="w-56 h-56 sm:w-64 sm:h-64 border-2 border-dashed border-green-400/80 rounded-3xl shadow-[0_0_40px_rgba(45,212,191,0.25)] flex flex-col items-center justify-between p-3.5">
                  <div className="w-full flex justify-between">
                    <div className="w-6 h-6 border-t-3 border-l-3 border-green-400 rounded-tl-xl" />
                    <div className="w-6 h-6 border-t-3 border-r-3 border-green-400 rounded-tr-xl" />
                  </div>
                  <span className="text-[10px] text-green-300 font-mono font-black tracking-wider bg-black/75 px-3 py-1 rounded-full backdrop-blur border border-green-500/30">
                    SCAN STUDENT QR PASS
                  </span>
                  <div className="w-full flex justify-between">
                    <div className="w-6 h-6 border-b-3 border-l-3 border-green-400 rounded-bl-xl" />
                    <div className="w-6 h-6 border-b-3 border-r-3 border-green-400 rounded-br-xl" />
                  </div>
                </div>
              </div>

              {!fullScreenMode && (
                <div className="absolute top-3 inset-x-3 flex items-center justify-between z-30">
                  <span className="text-[10px] font-bold text-green-300 bg-black/70 px-3 py-1.5 rounded-xl backdrop-blur border border-gray-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                    60 FPS Live Scanner
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      className="text-[10px] font-bold text-green-300 hover:text-white bg-black/70 px-3 py-1.5 rounded-xl backdrop-blur border border-gray-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Flip Lens
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="text-[10px] font-bold text-red-300 hover:text-white bg-red-950/80 px-3 py-1.5 rounded-xl backdrop-blur border border-red-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CameraOff className="w-3.5 h-3.5" /> Stop
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Standby State: Vertically and Horizontally Centered */}
            {!isCameraActive && (
              <div className={fullScreenMode 
                ? "flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm sm:max-w-md mx-auto space-y-6 z-20 my-auto text-white" 
                : "w-full rounded-3xl bg-gray-950 border border-gray-800 shadow-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-4 text-white"
              }>
                <div className="w-20 h-20 rounded-3xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 shadow-2xl shadow-green-500/20">
                  <QrCode className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <h4 className="font-black text-white text-xl sm:text-2xl tracking-tight">Optical QR Radar</h4>
                  <p className="text-xs sm:text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
                    Point camera at student pass to authenticate seat reservation and verify attendance.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => startCamera(cameraFacing)}
                  className="w-full sm:w-auto px-8 py-4 bg-green-500 hover:bg-green-400 text-gray-950 font-black text-sm rounded-2xl shadow-xl shadow-green-500/25 flex items-center justify-center gap-2.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Camera className="w-5 h-5" />
                  <span>Start Live Camera Scanner</span>
                </button>

                <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                  <ShieldCheck className="w-4 h-4 text-green-500" />
                  <span>Radar Standby • Anti-Replay Active</span>
                </div>
              </div>
            )}

            {/* Error Message for Camera Access */}
            {cameraError && (
              <div className="absolute inset-x-6 bottom-6 z-50 max-w-md mx-auto">
                <div className="p-4 rounded-2xl bg-red-950/90 border border-red-800 text-red-300 text-xs font-bold text-center flex flex-col items-center gap-2 shadow-xl">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                  <span>{cameraError}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual Mode View */}
        {activeTab === "MANUAL" && (
          <div className={fullScreenMode ? "flex-1 flex flex-col items-center justify-center p-6 w-full max-w-md mx-auto z-20 my-auto" : ""}>
            <div className={fullScreenMode ? "w-full p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl shadow-2xl space-y-4" : ""}>
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    Enter Pass Booking Code / Student ID / Name
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        value={manualInput}
                        onChange={e => setManualInput(e.target.value)}
                        placeholder="e.g. GEHU-PASS-01 or student name"
                        className="w-full text-xs pl-10 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white outline-none focus:border-green-500 font-mono shadow-inner"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-5 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-blue-600/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Verify</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Conductor Visual Identity Confirmation Card */}
      {pendingVerification && (
        <div className={fullScreenMode ? "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in" : ""}>
          <div className="p-5 rounded-3xl bg-gray-900 border-2 border-green-500/80 shadow-2xl space-y-4 animate-in zoom-in-95 text-white max-w-lg w-full">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping" />
                <span className="text-xs font-black uppercase tracking-wider text-green-400 flex items-center gap-1.5">
                  <BadgeCheck className="w-4 h-4 text-green-400" />
                  Step 2: Visual Identity Verification
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-green-950 text-green-300 border border-green-800">
                Anti-Impersonation Guard
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {/* Passport Photo Frame */}
              <div className="relative flex-shrink-0">
                {pendingVerification.student.photoUrl ? (
                  <div className="relative group">
                    <img
                      src={getSafePhotoUrl(pendingVerification.student.photoUrl)}
                      alt={pendingVerification.student.fullName}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        if (pendingVerification?.student?.photoUrl && e.currentTarget.src !== pendingVerification.student.photoUrl) {
                          e.currentTarget.src = pendingVerification.student.photoUrl;
                        }
                      }}
                      className="w-28 h-36 sm:w-32 sm:h-40 object-cover rounded-2xl border-2 border-green-400/80 shadow-lg bg-gray-950"
                    />
                    <div className="absolute -bottom-2 inset-x-0 mx-auto w-max px-2 py-0.5 rounded-full bg-green-600 text-[9px] font-black text-white uppercase tracking-wider shadow flex items-center gap-1">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      <span>Official ID Photo</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-28 h-36 sm:w-32 sm:h-40 rounded-2xl border-2 border-dashed border-red-500/80 bg-red-950/40 flex flex-col items-center justify-center text-red-400 p-2 text-center">
                    <ShieldAlert className="w-9 h-9 mb-1 text-red-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase text-red-300">Photo Missing</span>
                    <span className="text-[8px] text-red-400/90 font-bold mt-1 leading-tight">
                      Inspect Physical College ID
                    </span>
                  </div>
                )}
              </div>

              {/* Student Details */}
              <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                <div>
                  <div className="text-base sm:text-lg font-black text-white flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                    <span>{pendingVerification.student.fullName}</span>
                    {pendingVerification.student.studentIdCode && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-gray-800 text-green-300 border border-gray-700">
                        ID: {pendingVerification.student.studentIdCode}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-green-300 flex items-center justify-center sm:justify-start gap-2">
                    {pendingVerification.student.semester && (
                      <span className="opacity-70">• {pendingVerification.student.semester}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-gray-800/80 border border-gray-700/60">
                    <div className="text-[10px] uppercase font-bold text-gray-400">Allocated Seat</div>
                    <div className="font-mono font-black text-white text-sm">
                      {pendingVerification.booking.passengerType === "STANDING_TILL_MERGE"
                        ? "STAND (Merge)"
                        : (pendingVerification.booking.seatNumber || pendingVerification.booking.seat_number || "Seat Confirmed")}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-gray-800/80 border border-gray-700/60">
                    <div className="text-[10px] uppercase font-bold text-gray-400">Department</div>
                    <div className="font-semibold text-white truncate text-[11px]">
                      {pendingVerification.student.department || "Academic Department"}
                    </div>
                  </div>
                </div>

                <p className={`text-[11px] font-medium flex items-center justify-center sm:justify-start gap-1.5 pt-1 ${
                  pendingVerification.student.photoUrl
                    ? "text-yellow-300/90"
                    : "text-red-400 font-bold"
                }`}>
                  <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" />
                  <span>
                    {pendingVerification.student.photoUrl
                      ? "Conductor: Confirm commuter face matches official registered passport photo before boarding."
                      : "⚠️ COMPULSORY PHOTO MISSING: Demand physical institutional ID card & verify student face before boarding."}
                  </span>
                </p>
              </div>
            </div>

            {/* Action Buttons: Confirm Boarded vs Hold Seat Roaming vs Reject */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleConfirmBoarding}
                disabled={isProcessing}
                className="w-full py-3.5 px-3 rounded-2xl bg-green-500 hover:bg-green-400 text-gray-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-green-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isProcessing
                    ? "Processing..."
                    : pendingVerification.student.photoUrl
                    ? "Confirm & Board ✓"
                    : "Verify Physical ID & Board ✓"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleConfirmRoaming}
                disabled={isProcessing}
                className="w-full py-3.5 px-3 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-yellow-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="Hold seat digitally; student can roam campus without bags on seats"
              >
                <Footprints className="w-4 h-4" />
                <span>{isProcessing ? "Holding..." : "Hold Seat & Roam"}</span>
              </button>

              <button
                type="button"
                onClick={handleRejectMismatch}
                disabled={isProcessing}
                className="w-full py-3.5 px-3 rounded-2xl bg-red-950/80 hover:bg-red-900 border border-red-700/80 text-red-300 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                <UserX className="w-4 h-4" />
                <span>Reject Mismatch</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Verification Alert Box */}
      {lastResult && (
        <div
          className={fullScreenMode
            ? `fixed top-20 inset-x-4 max-w-md mx-auto z-50 p-4 rounded-3xl border transition-all animate-in slide-in-from-top-4 shadow-2xl ${
                lastResult.status === "APPROVED"
                  ? "bg-green-950/95 border-green-500 text-green-200"
                  : lastResult.status === "DUPLICATE"
                  ? "bg-yellow-950/95 border-yellow-500 text-yellow-200"
                  : "bg-red-950/95 border-red-500 text-red-200"
              }`
            : `p-4 rounded-3xl border transition-all animate-in fade-in ${
                lastResult.status === "APPROVED"
                  ? "bg-green-50 dark:bg-green-950/80 border-green-300 dark:border-green-500/80 text-green-950 dark:text-green-200 shadow-md"
                  : lastResult.status === "DUPLICATE"
                  ? "bg-yellow-50 dark:bg-yellow-950/80 border-yellow-300 dark:border-yellow-500/80 text-yellow-950 dark:text-yellow-200 shadow-md"
                  : "bg-red-50 dark:bg-red-950/80 border-red-300 dark:border-red-500/80 text-red-950 dark:text-red-200 shadow-md"
              }`
          }
        >
          <div className="flex items-start gap-3">
            {lastResult.status === "APPROVED" ? (
              <div className="w-9 h-9 rounded-2xl bg-green-600 dark:bg-green-500 text-white dark:text-gray-950 flex items-center justify-center flex-shrink-0 font-bold shadow-md">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            ) : lastResult.status === "DUPLICATE" ? (
              <div className="w-9 h-9 rounded-2xl bg-yellow-600 dark:bg-yellow-500 text-white dark:text-gray-950 flex items-center justify-center flex-shrink-0 font-bold shadow-md">
                <AlertTriangle className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-2xl bg-red-600 dark:bg-red-500 text-white flex items-center justify-center flex-shrink-0 font-bold shadow-md">
                <XCircle className="w-5 h-5" />
              </div>
            )}

            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <div className="font-black text-sm text-gray-900 dark:text-white">
                  {lastResult.studentName ? (
                    <span>
                      {lastResult.studentName}{" "}
                      <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-gray-200 dark:bg-white/15 ml-1 border border-gray-300 dark:border-white/20 text-gray-800 dark:text-white">
                        Seat {lastResult.seatNumber}
                      </span>
                    </span>
                  ) : (
                    "Verification Response"
                  )}
                </div>
                {lastResult.timestamp && (
                  <span className="text-[10px] opacity-70 font-mono">{lastResult.timestamp}</span>
                )}
              </div>

              <div className="text-xs font-semibold">{lastResult.message}</div>

              {lastResult.status === "DUPLICATE" && lastResult.studentName && (
                <div className="mt-3 p-3 rounded-2xl bg-yellow-100/70 dark:bg-yellow-950/60 border border-yellow-300 dark:border-yellow-700/80 flex items-center gap-3">
                  {lastResult.photoUrl ? (
                    <div className="relative flex-shrink-0">
                      <img
                        src={getSafePhotoUrl(lastResult.photoUrl)}
                        alt={lastResult.studentName}
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          if (lastResult?.photoUrl && e.currentTarget.src !== lastResult.photoUrl) {
                            e.currentTarget.src = lastResult.photoUrl;
                          }
                        }}
                        className="w-14 h-18 sm:w-16 sm:h-20 object-cover rounded-xl border-2 border-yellow-500 shadow-md bg-gray-900"
                      />
                      <div className="absolute -bottom-1.5 inset-x-0 mx-auto w-max px-1.5 py-0.5 rounded-full bg-yellow-600 text-[8px] font-black text-white uppercase tracking-wider shadow">
                        QR Owner
                      </div>
                    </div>
                  ) : (
                    <div className="w-14 h-18 sm:w-16 sm:h-20 rounded-xl border-2 border-dashed border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 flex flex-col items-center justify-center flex-shrink-0 text-yellow-700 dark:text-yellow-300">
                      <User className="w-6 h-6" />
                      <span className="text-[8px] font-bold mt-0.5">No Photo</span>
                    </div>
                  )}

                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="text-[10px] uppercase font-black tracking-wider text-yellow-800 dark:text-yellow-300 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                      Registered QR Pass Commuter
                    </div>
                    <div className="font-black text-sm text-gray-900 dark:text-white truncate">
                      {lastResult.studentName}
                    </div>
                    {lastResult.department && (
                      <div className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                        {lastResult.department}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-bold">
                      {lastResult.seatNumber && (
                        <span className="px-2 py-0.5 rounded-lg bg-yellow-200/80 dark:bg-yellow-900/60 text-yellow-950 dark:text-yellow-100 font-mono">
                          Allocated Seat: {lastResult.seatNumber}
                        </span>
                      )}
                      {lastResult.boardedAt && (
                        <span className="px-2 py-0.5 rounded-lg bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-200">
                          Checked-In: {new Date(lastResult.boardedAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {lastResult.method && (
                <div className="text-[10px] font-mono opacity-80 text-green-700 dark:text-green-300">
                  Verified via {lastResult.method} • Synchronized to university attendance database
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1-Tap Passenger Quick Boarding Queue */}
      <div className={fullScreenMode ? "relative z-30 p-3 bg-black/75 backdrop-blur-md border-t border-white/10 shrink-0 w-full max-w-xl mx-auto space-y-2" : "space-y-2.5 pt-3 border-t border-gray-200 dark:border-gray-800"}>
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="font-black uppercase tracking-wider text-[10px]">
            Passenger Queue ({pendingBookings.length} Awaiting Check-in)
          </span>
          <span className="text-[10px] text-green-400 font-semibold">1-Tap Boarding</span>
        </div>

        {pendingBookings.length === 0 ? (
          <div className="p-3 text-center text-xs text-gray-400 bg-white/5 rounded-2xl border border-white/10">
            ✓ All passengers on this vehicle are checked in.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
            {pendingBookings.slice(0, 6).map(b => {
              const s = students.find(stud => stud.id === b.studentId || stud.userId === b.studentId);
              const queueSeatCode = b.seatNumber || (b.waitlistPosition ? `WL-${b.waitlistPosition}` : "PASS");
              return (
                <button
                  key={b.id}
                  onClick={() => verifyPassCode(b.bookingCode || b.id, "Manual Secure Entry")}
                  className="p-2.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-green-500 text-left flex items-center justify-between transition-colors group cursor-pointer"
                >
                  <div className="truncate mr-2">
                    <div className="text-xs font-bold text-white truncate group-hover:text-green-300">
                      {s?.fullName || "Commuter"}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">
                      Seat {queueSeatCode} • {b.bookingCode || b.id.slice(0, 8)}
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-green-500 hover:bg-green-400 text-gray-950 shadow-xs transition-transform active:scale-95 shrink-0">
                    Board ✓
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
