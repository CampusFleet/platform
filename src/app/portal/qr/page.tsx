"use client";

import React from "react";
import Link from "next/link";
import { ScanLine, QrCode, ScanFace, Radio, CheckCircle2, ArrowRight } from "lucide-react";
import { useAttendancePolicy } from "@/lib/attendance";

export default function QRConnectPage() {
  const { mode, rules } = useAttendancePolicy();

  return (
    <div className="min-h-[calc(100vh-140px)] w-full p-6 animate-in fade-in zoom-in-95 flex flex-col items-center justify-center pb-24">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-2 mb-6">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-3xl flex items-center justify-center mx-auto mb-3">
            {mode === "FACE_ID" ? (
              <ScanFace className="w-8 h-8 text-emerald-500 animate-pulse" />
            ) : mode === "RFID" ? (
              <Radio className="w-8 h-8 text-indigo-500" />
            ) : (
              <QrCode className="w-8 h-8" />
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            {rules.modeLabel}
          </h1>
          <p className="text-xs font-bold text-gray-500">
            {rules.modeDescription}
          </p>
        </div>

        {/* Mode: Face ID Active Hero Notification */}
        {mode === "FACE_ID" && (
          <div className="p-5 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-3 text-left">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs uppercase tracking-wide">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Zero-Touch Gate Entry</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Your attendance is logged automatically by the vehicle&apos;s entrance camera. You do not need to present or scan a QR code.
            </p>
            <Link
              href="/portal"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition-all active:scale-95"
            >
              <span>View Verified Commuter Pass</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Mode: RFID Smart Card Active Hero Notification */}
        {mode === "RFID" && (
          <div className="p-5 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-3 text-left">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-wide">
              <Radio className="w-4 h-4 text-indigo-500" />
              <span>Physical Smart Card Required</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Tap your registered RFID campus card on the door reader upon entering the bus.
            </p>
            <Link
              href="/portal"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md transition-all active:scale-95"
            >
              <span>View Linked Card UID</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Dynamic QR: Show My QR Card */}
        {(rules.isStudentShowQrActive || mode === "FACE_ID") && (
          <Link 
            href="/portal/qr/show"
            className="w-full flex items-center gap-4 p-5 bg-white dark:bg-gray-800/60 backdrop-blur-xl border border-gray-200 dark:border-gray-800/60 rounded-3xl shadow-xl hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:scale-[1.02] active:scale-95 group cursor-pointer"
          >
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <QrCode className="w-7 h-7" />
            </div>
            <div className="text-left">
              <div className="text-lg font-black text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {mode === "FACE_ID" ? "Backup QR Token" : "Show My QR Pass"}
              </div>
              <div className="text-xs text-gray-500 font-semibold mt-0.5">
                {mode === "FACE_ID" ? "For exception scans by conductor" : "Let the conductor scan your screen"}
              </div>
            </div>
          </Link>
        )}

        {/* Static QR: Scan Bus QR Card */}
        {rules.isStudentDoorScannerActive && (
          <Link 
            href="/portal/qr/scan"
            className="w-full flex items-center gap-4 p-5 bg-white dark:bg-gray-800/60 backdrop-blur-xl border border-gray-200 dark:border-gray-800/60 rounded-3xl shadow-xl hover:border-green-500 dark:hover:border-green-500 transition-all hover:scale-[1.02] active:scale-95 group cursor-pointer"
          >
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-green-50 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 group-hover:bg-green-600 group-hover:text-white transition-colors">
              <ScanLine className="w-7 h-7" />
            </div>
            <div className="text-left">
              <div className="text-lg font-black text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                Scan Bus QR
              </div>
              <div className="text-xs text-gray-500 font-semibold mt-0.5">
                Self-check into your seat via phone
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
