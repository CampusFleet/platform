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
        videoRef.current.play();
        requestRef.current = requestAnimationFrame(scanTick);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setHasPermission(false);
      setErrorMsg("Camera access denied or unavailable.");
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

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const processQrCode = async (rawCode: string) => {
    setIsProcessing(true);
    stopCamera();
    
    try {
      let payload: any = null;
      let isRollingQr = false;

      const trimmed = rawCode.trim();
      if (trimmed.startsWith("cf://b/")) {
        // Compact Rolling Bus URI: cf://b/{busId}?t={timeBlock}&k={token}
        try {
          const url = new URL(trimmed.replace("cf://", "http://cf.local/"));
          const pathParts = url.pathname.split("/").filter(Boolean);
          const busId = pathParts[1] || "";
          const timeBlock = parseInt(url.searchParams.get("t") || "0", 10);
          const token = url.searchParams.get("k") || "";
          payload = { type: "ROLLING_BUS_QR", busId, timeBlock, token, rawCode: trimmed };
          isRollingQr = true;
        } catch {
          throw new Error("Invalid rolling QR URI structure.");
        }
      } else {
        try {
          payload = JSON.parse(trimmed);
          if (payload.type === "ROLLING_BUS_QR" || payload.token || payload.k) {
            isRollingQr = true;
          }
        } catch {
          throw new Error("Invalid QR format. Please scan an authentic bus display or seat QR.");
        }
      }

      // Flow 1: Scanned a static BUS_QR -> Redirect to Seat Selection Map
      if (!isRollingQr && payload.type === "BUS_QR" && payload.busId) {
        setSuccessMsg("Bus identified! Opening seat selection map...");
        setTimeout(() => {
          window.location.href = `/portal?busId=${payload.busId}`;
        }, 1200);
        return;
      }

      // Flow 2: Scanned an ESP32 Dynamic Rolling Cryptographic Bus QR Display (Zero-RFID)
      // or Flow 3: Scanned a SEAT_QR -> Direct Boarding Attendance
      if (!isRollingQr && payload.type !== "SEAT_QR") {
        throw new Error("Invalid QR format. Please scan a valid Bus Display QR or Seat QR.");
      }

      // 1. Get Geolocation
      if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by your browser. Please enable GPS.");
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      // 2. Fetch live bus location from store (WebSocket synced)
      const liveBusLoc = store.getLiveLocation();
      const busLat = liveBusLoc.busId === payload.busId ? liveBusLoc.latitude : undefined;
      const busLng = liveBusLoc.busId === payload.busId ? liveBusLoc.longitude : undefined;

      // 3. Call our API with seatId or rolling dynamic QR proof
      const res = await fetch("/api/students/board-self-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId: payload.busId,
          seatId: payload.seatId,
          latitude: lat,
          longitude: lng,
          busLatitude: busLat,
          busLongitude: busLng,
          rollingPayload: isRollingQr ? (payload.rawCode || rawCode) : undefined,
          rollingToken: isRollingQr ? payload.token : undefined,
        })
      });

      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to board.");
      }

      setSuccessMsg(
        isRollingQr
          ? "✓ Rolling Encrypted QR Verified! Boarding attendance cleared without RFID."
          : `Success! You have boarded Seat ${payload.seatId}.`
      );
      setTimeout(() => {
        onSuccess();
      }, 2000);

    } catch (err: any) {
      setErrorMsg(err.message || "Invalid QR Code or Geolocation failed.");
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
        return; // Stop ticking
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
            Self-Boarding Scanner
          </div>
          
          <p className="text-xs text-gray-500 max-w-sm">
            Scan the QR code pasted on the bus door to instantly verify your boarding pass. GPS must be enabled to verify you are at the authorized stop.
          </p>
        </>
      )}

      {successMsg ? (
        <div className={`p-6 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-3xl text-green-600 dark:text-green-400 flex flex-col items-center gap-3 w-full ${fullScreenMode ? 'absolute z-10 mx-6 w-auto' : ''}`}>
          <CheckCircle2 className="w-12 h-12" />
          <div className="font-bold">{successMsg}</div>
        </div>
      ) : errorMsg ? (
        <div className={`p-6 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-3xl text-red-600 dark:text-red-400 flex flex-col items-center gap-3 w-full ${fullScreenMode ? 'absolute z-10 mx-6 w-auto' : ''}`}>
          <XCircle className="w-12 h-12" />
          <div className="font-bold text-sm">{errorMsg}</div>
          <button 
            onClick={() => { setErrorMsg(null); startCamera(); }}
            className="mt-2 px-4 py-2 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 rounded-xl text-xs font-bold transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : isProcessing ? (
        <div className={`p-10 flex flex-col items-center gap-4 text-blue-500 ${fullScreenMode ? 'absolute z-10 bg-black/50 rounded-3xl backdrop-blur-md' : ''}`}>
          <RefreshCw className="w-10 h-10 animate-spin" />
          <div className="text-sm font-bold animate-pulse">Verifying Location & Pass...</div>
        </div>
      ) : (
        <div className={fullScreenMode ? "absolute inset-0 w-full h-full bg-black z-0" : "relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 shadow-inner"}>
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          
          {!isActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 p-6 z-10">
              <CameraOff className="w-10 h-10 text-gray-400 mb-4" />
              <button 
                onClick={startCamera}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Tap to Start Scanner
              </button>
            </div>
          )}

          {isActive && (
            <div className={`absolute pointer-events-none border-[3px] border-blue-500/50 rounded-3xl z-10 ${fullScreenMode ? 'inset-10' : 'inset-0 m-6'}`}>
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-2xl -m-[3px]" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-2xl -m-[3px]" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-2xl -m-[3px]" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-2xl -m-[3px]" />
            </div>
          )}
          
          {fullScreenMode && (
            <div className="absolute top-6 left-0 w-full flex justify-center z-20 px-6">
               <div className="flex items-center gap-2 text-white bg-black/50 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg font-black text-sm">
                 <QrCode className="w-5 h-5 text-blue-400" />
                 Scan to Board
               </div>
            </div>
          )}
        </div>
      )}

      {!fullScreenMode && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg w-full justify-center">
          <MapPin className="w-3 h-3" />
          Geolocation required for scan
        </div>
      )}
      
      {fullScreenMode && (
        <div className="absolute bottom-6 left-0 w-full flex justify-center z-20 px-6">
          <div className="flex items-center gap-2 text-[10px] font-mono text-gray-300 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl">
            <MapPin className="w-3 h-3" />
            Geolocation required for check-in
          </div>
        </div>
      )}
    </div>
  );
}
