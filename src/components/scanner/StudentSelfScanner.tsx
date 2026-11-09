"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, QrCode, MapPin, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { store } from "@/lib/store";

export function StudentSelfScanner({ onSuccess, fullScreenMode = false }: { onSuccess: () => void, fullScreenMode?: boolean }) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>();

  const startCamera = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      setHasPermission(true);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        requestRef.current = requestAnimationFrame(scanTick);
      }
    } catch (err) {
      console.warn("Camera auto-start error:", err);
      setHasPermission(false);
      setErrorMsg("Camera access denied or unavailable. Tap below to retry.");
      setIsActive(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    setIsActive(false);
  }, []);

  // Automatically start camera on mount for immediate scanning
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const processQrCode = async (rawCode: string) => {
    setIsProcessing(true);
    stopCamera();
    
    try {
      let busId: string = "";
      let seatId: string | undefined = undefined;
      let isRollingQr = false;
      let rollingPayload: string | undefined = undefined;
      let rollingToken: string | undefined = undefined;

      const trimmed = rawCode.trim();

      // Case 1: Dynamic Rolling Bus URI (ESP32 Display): cf://b/{busId}?t={timeBlock}&k={token}
      if (trimmed.toLowerCase().startsWith("cf://b/")) {
        try {
          const normalized = "http://cf.local/" + trimmed.slice(trimmed.indexOf("b/"));
          const url = new URL(normalized);
          const pathParts = url.pathname.split("/").filter(Boolean);
          busId = pathParts[1] || "";
          rollingToken = url.searchParams.get("k") || "";
          rollingPayload = trimmed;
          isRollingQr = true;
        } catch {
          throw new Error("Invalid rolling QR URI structure.");
        }
      } 
      // Case 2: JSON formatted payload
      else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const json = JSON.parse(trimmed);
          busId = String(json.busId || json.b || json.bus_id || json.bus || "");
          seatId = json.seatId || json.seat || undefined;
          if (json.type === "ROLLING_BUS_QR" || json.token || json.k) {
            isRollingQr = true;
            rollingToken = json.token || json.k;
            rollingPayload = trimmed;
          }
        } catch {
          throw new Error("Invalid QR JSON format. Please point camera at the bus screen.");
        }
      }
      // Case 3: URL containing busId parameter (e.g. https://.../portal?busId=42)
      else if (trimmed.includes("busId=") || trimmed.includes("bus_id=")) {
        try {
          const url = new URL(trimmed);
          busId = url.searchParams.get("busId") || url.searchParams.get("bus_id") || "";
        } catch {
          const match = trimmed.match(/busId=([a-zA-Z0-9]+)/i);
          busId = match ? match[1] : "";
        }
      }
      // Case 4: Plain text bus identifier (e.g. "42", "Bus 42", "BUS-42")
      else if (/^(bus[\s\-_]*)?\d+$/i.test(trimmed)) {
        const digits = trimmed.match(/\d+/);
        busId = digits ? digits[0] : trimmed;
      } else {
        throw new Error("Unrecognized QR code. Please scan the authentic Bus display QR.");
      }

      if (!busId) {
        throw new Error("Could not detect vehicle ID from QR. Please try again.");
      }

      // 1. Graceful Geolocation Retrieval (Fast 4s timeout so indoor metal buses never stall)
      let lat: number | undefined = undefined;
      let lng: number | undefined = undefined;

      try {
        if (navigator.geolocation) {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 4000,
              maximumAge: 30000,
            });
          });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        }
      } catch (geoErr) {
        console.warn("GPS lookup timeout or denied:", geoErr);
      }

      // 2. Fetch live bus location from store if available
      const liveBusLoc = store.getLiveLocation();
      const busLat = String(liveBusLoc.busId) === String(busId) ? liveBusLoc.latitude : undefined;
      const busLng = String(liveBusLoc.busId) === String(busId) ? liveBusLoc.longitude : undefined;

      // 3. Directly call self-service boarding attendance API
      const res = await fetch("/api/students/board-self-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId,
          seatId,
          latitude: lat,
          longitude: lng,
          busLatitude: busLat,
          busLongitude: busLng,
          rollingPayload,
          rollingToken,
        })
      });

      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to mark attendance.");
      }

      // 4. Attendance Marked Successfully!
      setSuccessMsg(
        data.message || (
          isRollingQr
            ? "✓ Rolling Dynamic QR Verified! Attendance marked & seat confirmed."
            : `✓ Bus ${data.busNumber || busId} Attendance marked! Welcome aboard.`
        )
      );

      setTimeout(() => {
        onSuccess();
      }, 1500);

    } catch (err: any) {
      setErrorMsg(err.message || "Attendance verification failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const scanTick = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert"
      });

      if (code && code.data) {
        processQrCode(code.data);
        return; // Stop ticking once a code is picked up
      }
    }
    
    if (isActive) {
      requestRef.current = requestAnimationFrame(scanTick);
    }
  };

  return (
    <div className={
      fullScreenMode 
        ? "relative w-full h-full bg-black flex flex-col items-center justify-center text-center overflow-hidden" 
        : "bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden flex flex-col items-center text-center space-y-4 w-full"
    }>
      {!fullScreenMode && (
        <>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-black text-lg">
            <QrCode className="w-6 h-6" />
            Self-Boarding Attendance Scanner
          </div>
          
          <p className="text-xs text-gray-500 max-w-sm">
            Point camera at the live rolling bus display to instantly verify and mark your attendance.
          </p>
        </>
      )}

      {successMsg ? (
        <div className={`p-8 bg-green-500/10 border-2 border-green-500 rounded-3xl text-green-400 flex flex-col items-center gap-4 w-full max-w-sm backdrop-blur-xl animate-in zoom-in-95 ${fullScreenMode ? 'absolute z-10 mx-6 w-auto' : ''}`}>
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 border border-green-500/30">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <div className="font-black text-lg text-white">Attendance Marked!</div>
          <div className="font-semibold text-xs text-green-300 leading-relaxed">{successMsg}</div>
          <div className="text-[11px] text-gray-400 font-mono animate-pulse">Redirecting to commuter pass...</div>
        </div>
      ) : errorMsg ? (
        <div className={`p-6 bg-red-500/10 border-2 border-red-500/50 rounded-3xl text-red-400 flex flex-col items-center gap-3 w-full max-w-sm backdrop-blur-xl animate-in zoom-in-95 ${fullScreenMode ? 'absolute z-10 mx-6 w-auto' : ''}`}>
          <XCircle className="w-12 h-12 text-red-400" />
          <div className="font-black text-base text-white">Verification Failed</div>
          <div className="font-medium text-xs text-red-300">{errorMsg}</div>
          <button 
            onClick={() => { setErrorMsg(null); startCamera(); }}
            className="mt-3 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95"
          >
            Scan Again
          </button>
        </div>
      ) : isProcessing ? (
        <div className={`p-10 flex flex-col items-center gap-4 text-blue-400 ${fullScreenMode ? 'absolute z-10 bg-black/75 rounded-3xl backdrop-blur-xl border border-white/10 shadow-2xl' : ''}`}>
          <RefreshCw className="w-12 h-12 animate-spin text-blue-400" />
          <div className="text-base font-black text-white">Verifying QR Code...</div>
          <div className="text-xs text-blue-300/80 font-medium animate-pulse">Checking cryptographic proof & marking attendance...</div>
        </div>
      ) : (
        <div className={fullScreenMode ? "absolute inset-0 w-full h-full bg-black z-0" : "relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 shadow-inner"}>
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          
          {!isActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 p-6 z-10">
              <CameraOff className="w-10 h-10 text-gray-400 mb-4" />
              <button 
                onClick={startCamera}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Tap to Start Camera
              </button>
            </div>
          )}

          {isActive && (
            <div className={`absolute pointer-events-none border-2 border-blue-500/30 rounded-3xl z-10 ${fullScreenMode ? 'inset-10' : 'inset-0 m-6'}`}>
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-blue-500 rounded-tl-2xl -m-[2px]" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-blue-500 rounded-tr-2xl -m-[2px]" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-blue-500 rounded-bl-2xl -m-[2px]" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-blue-500 rounded-br-2xl -m-[2px]" />
              
              {/* Animated laser scan line */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_8px_#3b82f6] animate-[pulse_2s_ease-in-out_infinite]" />
            </div>
          )}
          
          {fullScreenMode && (
            <div className="absolute top-6 left-0 w-full flex justify-center z-20 px-6">
               <div className="flex items-center gap-2 text-white bg-black/60 backdrop-blur-xl border border-white/10 px-5 py-2.5 rounded-2xl shadow-xl font-black text-xs uppercase tracking-wider">
                 <QrCode className="w-4 h-4 text-blue-400" />
                 Scan Bus QR to Mark Attendance
               </div>
            </div>
          )}
        </div>
      )}

      {!fullScreenMode && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg w-full justify-center">
          <MapPin className="w-3 h-3 text-blue-400" />
          Zero-RFID Dynamic QR Attendance Ready
        </div>
      )}
      
      {fullScreenMode && (
        <div className="absolute bottom-8 left-0 w-full flex justify-center z-20 px-6">
          <div className="flex items-center gap-2 text-[11px] font-medium text-gray-300 bg-black/60 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Point camera at the live rolling screen on Bus
          </div>
        </div>
      )}
    </div>
  );
}
