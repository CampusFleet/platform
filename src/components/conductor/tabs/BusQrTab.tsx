"use client";

import React, { useState, useEffect } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  Download,
  Printer,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Clock,
  Radio,
  Lock,
  Zap,
} from "lucide-react";
import { Bus, Trip, Route } from "@/lib/types";
// Rolling tokens are minted server-side only (/api/boarding/rolling-token).
// Never import rolling-bus-crypto here: it would ship the HMAC secret to the browser.
interface RollingQrState {
  qrPayloadString: string;
  timestampSec: number;
  stepSeconds: number;
  token: string;
}

interface BusQrTabProps {
  activeTrip: Trip;
  bus?: Bus;
  route?: Route;
}

export function BusQrTab({ activeTrip, bus, route }: BusQrTabProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeView, setActiveView] = useState<"LIVE_ROLLING" | "DOOR_POSTER" | "SEAT_SHEET">("LIVE_ROLLING");
  const [rollingData, setRollingData] = useState<RollingQrState | null>(null);

  // Live rolling ticker: fetch a server-minted token, then refetch at the next step boundary.
  useEffect(() => {
    if (!bus || activeView !== "LIVE_ROLLING") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      let nextInMs = 1000;
      try {
        const res = await fetch(
          `/api/boarding/rolling-token?busId=${encodeURIComponent(String(bus.id))}&busNumber=${encodeURIComponent(String(bus.busNumber))}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!cancelled && data?.success && data.payload) {
          setRollingData({
            qrPayloadString: data.payload.qrPayloadString,
            timestampSec: data.payload.timestampSec,
            stepSeconds: data.payload.stepSeconds,
            token: data.payload.token,
          });
          nextInMs = Math.max(250, Number(data.remainingInStepSec || 1) * 1000 + 50);
        }
      } catch {
        // Retry on the next tick
      }
      if (!cancelled) timer = setTimeout(tick, nextInMs);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [bus, activeView]);

  if (!bus) return null;

  const handleDownload = () => {
    const canvas = document.getElementById("main-bus-qr") as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `Bus_${bus.busNumber}_Door_QR.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const staticQrPayload = JSON.stringify({
    type: "BUS_QR",
    busId: bus.id,
    busNumber: bus.busNumber,
    registrationNo: bus.registrationNo,
  });

  return (
    <div className={`space-y-6 animate-in fade-in duration-200 ${isFullscreen ? "fixed inset-0 z-50 bg-black p-4 sm:p-8 overflow-y-auto flex flex-col justify-center items-center" : ""}`}>
      
      {/* ── TOP ACTION HEADER (Hidden in Print & Minimized in Fullscreen) ── */}
      <div className={`bg-zinc-950 dark:bg-black border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden ${isFullscreen ? "w-full max-w-4xl mb-4" : ""}`}>
        <div>
          <h3 className="font-black text-lg text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-emerald-400" />
            <span>Bus Self-Boarding Dynamic QR Terminal</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Dynamic rolling cryptographic display for student self-boarding without RFID cards.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-2xl">
            <button
              onClick={() => setActiveView("LIVE_ROLLING")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeView === "LIVE_ROLLING"
                  ? "bg-emerald-500 text-zinc-950 shadow-md font-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-zinc-950" />
              <span>Live Rolling Screen</span>
            </button>
            <button
              onClick={() => setActiveView("DOOR_POSTER")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeView === "DOOR_POSTER"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Door Poster
            </button>
            <button
              onClick={() => setActiveView("SEAT_SHEET")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeView === "SEAT_SHEET"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Seat QRs ({bus.capacity})
            </button>
          </div>

          {activeView === "LIVE_ROLLING" ? (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>{isFullscreen ? "Exit Kiosk" : "Kiosk Fullscreen"}</span>
            </button>
          ) : (
            <>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Print Poster</span>
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── VIEW 1: LIVE ROLLING CRYPTOGRAPHIC DISPLAY (ESP32 / KIOSK SCREEN) ── */}
      {activeView === "LIVE_ROLLING" && rollingData ? (
        <div className="flex flex-col items-center justify-center p-2 sm:p-6 w-full">
          <div className="bg-zinc-950 border-2 border-emerald-500/40 rounded-[2.5rem] p-7 sm:p-10 shadow-2xl max-w-lg w-full text-center relative overflow-hidden backdrop-blur">
            
            {/* Ambient Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

            {/* Top Bar: Bus & Security Status */}
            <div className="border-b border-zinc-800/80 pb-5 mb-6 relative">
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                <span className="flex items-center gap-1.5 text-emerald-400 font-black">
                  <Radio className="w-3.5 h-3.5 animate-pulse" /> LIVE ROLLING TERMINAL
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800">
                  <Lock className="w-3 h-3 text-emerald-400" /> 32-CHAR HMAC
                </span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                <span>{bus.busNumber}</span>
                <span className="text-sm font-mono px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300">
                  {bus.registrationNo}
                </span>
              </h2>

              {route?.name && (
                <div className="text-xs font-bold text-zinc-400 mt-1">
                  Corridor: <span className="text-emerald-400">{route.name}</span>
                </div>
              )}
            </div>

            {/* Live Dynamic QR Code Container */}
            <div className="p-6 bg-white rounded-3xl inline-block shadow-2xl border-4 border-zinc-900 mx-auto relative group">
              <QRCodeSVG
                value={rollingData.qrPayloadString}
                size={260}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
                includeMargin={false}
              />

              {/* Center Watermark Chip */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 rounded-2xl bg-zinc-950 text-white flex items-center justify-center font-black text-xs shadow-xl border-2 border-white">
                  CF
                </div>
              </div>
            </div>

            {/* Dynamic Countdown & Cryptographic Details */}
            <div className="mt-6 space-y-3">
              
              {/* Rotating Second Ticker */}
              <div className="flex items-center justify-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 font-mono text-xs">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-zinc-400">Epoch:</span>
                  <span className="text-white font-bold">{rollingData.timestampSec}s</span>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 font-mono text-xs text-emerald-300">
                  <Zap className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                  <span>Cycle: {rollingData.stepSeconds}s</span>
                </div>
              </div>

              {/* Cryptographic Signature Token */}
              <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 font-mono text-xs flex items-center justify-between">
                <span className="text-zinc-500 text-[10px] uppercase font-black">HMAC-SHA256 Token:</span>
                <span className="font-bold text-emerald-400 tracking-wider">
                  {rollingData.token}
                </span>
              </div>

              {/* Anti-Screenshot Warning */}
              <div className="text-[11px] text-zinc-400 flex items-center justify-center gap-1.5 pt-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Anti-Screenshot Armed: Valid for 2s only. Point phone camera directly to check in.</span>
              </div>
            </div>

          </div>
        </div>
      ) : activeView === "DOOR_POSTER" ? (
        /* ── VIEW 2: STATIC PRINTABLE DOOR POSTER (A4) ── */
        <div className="flex flex-col items-center justify-center p-2 sm:p-6">
          <div
            id="printable-bus-poster"
            className="bg-white text-zinc-950 rounded-[2.5rem] p-8 sm:p-12 shadow-2xl max-w-xl w-full border-4 border-zinc-900 text-center relative overflow-hidden print:border-none print:shadow-none print:p-0 print:max-w-none print:w-full"
          >
            <div className="border-b-2 border-zinc-900 pb-5 mb-8">
              <div className="text-[11px] font-mono font-black uppercase tracking-widest text-zinc-600 mb-1">
                CAMPUS COMMUTE • BACKUP STATIC DOOR CHECK-IN
              </div>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-950">
                {bus.busNumber}
              </h2>
              <div className="inline-block mt-2 font-mono font-black text-xs px-3.5 py-1 rounded-lg bg-zinc-900 text-white">
                REG: {bus.registrationNo}
              </div>
              {route?.name && (
                <div className="text-xs font-bold text-zinc-600 mt-2">
                  Corridor: {route.name}
                </div>
              )}
            </div>

            <div className="p-6 bg-zinc-50 rounded-3xl inline-block border-2 border-zinc-200 shadow-inner mx-auto mb-8">
              <QRCodeCanvas
                id="main-bus-qr"
                value={staticQrPayload}
                size={280}
                bgColor="#f8fafc"
                fgColor="#000000"
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="bg-zinc-100 rounded-2xl p-4 sm:p-5 text-left text-xs space-y-2 border border-zinc-200">
              <div className="font-black text-zinc-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                How to Board:
              </div>
              <div className="flex items-start gap-2 text-zinc-700">
                <span className="w-5 h-5 rounded-full bg-zinc-900 text-white font-mono font-black text-[10px] flex items-center justify-center shrink-0">1</span>
                <span>Open your <strong>CampusFleet</strong> app on your phone.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-700">
                <span className="w-5 h-5 rounded-full bg-zinc-900 text-white font-mono font-black text-[10px] flex items-center justify-center shrink-0">2</span>
                <span>Point your camera at this QR code.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-700">
                <span className="w-5 h-5 rounded-full bg-zinc-900 text-white font-mono font-black text-[10px] flex items-center justify-center shrink-0">3</span>
                <span>Your attendance is logged and your seat is marked <strong>Boarded ✓</strong>.</span>
              </div>
            </div>

            <div className="text-[10px] font-mono text-zinc-400 mt-6 tracking-wider">
              AUTHORIZED BY CAMPUS FLEET TRANSIT OPERATIONS
            </div>
          </div>
        </div>
      ) : (
        /* ── VIEW 3: SEAT QRs BACKUP MATRIX ── */
        <div className="bg-zinc-950 dark:bg-black border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6">
          <div>
            <h4 className="text-base font-black text-white">Individual Seat Backup QR Stickers</h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              Backup codes for depot maintenance teams to print and stick to individual seat backs.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: bus.capacity }, (_, i) => i + 1).map(seatNum => (
              <div
                key={seatNum}
                className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 flex flex-col items-center text-center shadow-sm hover:border-zinc-700 transition-colors"
              >
                <div className="text-[11px] font-mono font-black text-zinc-300 mb-2.5 tracking-wider">
                  SEAT {seatNum}
                </div>
                <div className="bg-white p-2 rounded-xl shadow-inner">
                  <QRCodeSVG
                    value={JSON.stringify({
                      type: "SEAT_QR",
                      busId: bus.id,
                      seatId: seatNum,
                      busNumber: bus.busNumber,
                    })}
                    size={88}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="H"
                  />
                </div>
                <div className="text-[9px] font-mono text-zinc-500 mt-2 truncate max-w-full">
                  {bus.busNumber}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
