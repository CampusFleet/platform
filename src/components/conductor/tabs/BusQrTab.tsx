"use client";

import React, { useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { QrCode, Download, Printer, Maximize2, Minimize2, BusFront, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Bus, Trip, Route } from "@/lib/types";

interface BusQrTabProps {
  activeTrip: Trip;
  bus?: Bus;
  route?: Route;
}

export function BusQrTab({ activeTrip, bus, route }: BusQrTabProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeView, setActiveView] = useState<"DOOR_POSTER" | "SEAT_SHEET">("DOOR_POSTER");

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

  const qrPayload = JSON.stringify({
    type: "BUS_QR",
    busId: bus.id,
    busNumber: bus.busNumber,
    registrationNo: bus.registrationNo,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── TOP ACTION HEADER ── */}
      <div className="bg-zinc-950 dark:bg-black border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h3 className="font-black text-lg text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-emerald-400" />
            <span>Bus Self-Boarding QR & Depot Posters</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Display this QR code to boarding students or print official laminated posters for the bus entrance door.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-2xl">
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

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Print A4 Poster</span>
          </button>

          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download PNG</span>
          </button>
        </div>
      </div>

      {/* ── PRINT-READY & DISPLAY POSTER (A4 / Presentation) ── */}
      {activeView === "DOOR_POSTER" ? (
        <div className="flex flex-col items-center justify-center p-2 sm:p-6">
          <div
            id="printable-bus-poster"
            className="bg-white text-zinc-950 rounded-[2.5rem] p-8 sm:p-12 shadow-2xl max-w-xl w-full border-4 border-zinc-900 text-center relative overflow-hidden print:border-none print:shadow-none print:p-0 print:max-w-none print:w-full"
          >
            {/* Header branding */}
            <div className="border-b-2 border-zinc-900 pb-5 mb-8">
              <div className="text-[11px] font-mono font-black uppercase tracking-widest text-zinc-600 mb-1">
                CAMPUS COMMUTE • OFFICIAL BUS DOOR CHECK-IN
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

            {/* High-Resolution QR Code Container */}
            <div className="p-6 bg-zinc-50 rounded-3xl inline-block border-2 border-zinc-200 shadow-inner mx-auto mb-8">
              <QRCodeCanvas
                id="main-bus-qr"
                value={qrPayload}
                size={280}
                bgColor="#f8fafc"
                fgColor="#000000"
                level="H"
                includeMargin={true}
              />
            </div>

            {/* Instructions list */}
            <div className="bg-zinc-100 rounded-2xl p-4 sm:p-5 text-left text-xs space-y-2 border border-zinc-200">
              <div className="font-black text-zinc-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                How to Board:
              </div>
              <div className="flex items-start gap-2 text-zinc-700">
                <span className="w-5 h-5 rounded-full bg-zinc-900 text-white font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                  1
                </span>
                <span>Open your <strong>CampusFleet</strong> dynamic commuter pass on your phone.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-700">
                <span className="w-5 h-5 rounded-full bg-zinc-900 text-white font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                  2
                </span>
                <span>Tap <strong>&ldquo;Scan Bus Door&rdquo;</strong> and point your camera at this QR code.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-700">
                <span className="w-5 h-5 rounded-full bg-zinc-900 text-white font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                  3
                </span>
                <span>Your attendance is logged and your seat is marked <strong>Boarded ✓</strong>.</span>
              </div>
            </div>

            <div className="text-[10px] font-mono text-zinc-400 mt-6 tracking-wider">
              AUTHORIZED BY CAMPUS FLEET TRANSIT OPERATIONS • LAMINATE BEFORE INSTALLATION
            </div>
          </div>
        </div>
      ) : (
        /* ── SEAT QRs BACKUP MATRIX ── */
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
