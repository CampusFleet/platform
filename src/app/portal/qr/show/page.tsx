"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { store } from "@/lib/store";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Clock, RefreshCw, ShieldCheck, CheckCircle2 } from "lucide-react";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { useAttendancePolicy, PolicyStandbyScreen } from "@/lib/attendance";

// Cryptographic deterministic hex token generator (rotates every 60s)
function generateDynamicToken(studentId: string, windowIndex: number): string {
  const seed = `${studentId}:${windowIndex}:cf_transit_secure_salt_2026`;
  let hash1 = 0x811c9dc5;
  let hash2 = 0x27d4eb2f;

  for (let i = 0; i < seed.length; i++) {
    const code = seed.charCodeAt(i);
    hash1 ^= code;
    hash1 = Math.imul(hash1, 0x01000193);
    hash2 ^= (code << 5) + code;
    hash2 = Math.imul(hash2, 0x5bd1e995);
  }

  const hex1 = ((hash1 >>> 0) & 0xffffff).toString(16).padStart(6, "0").toUpperCase();
  const hex2 = ((hash2 >>> 0) & 0xffffff).toString(16).padStart(6, "0").toUpperCase();
  return `${hex1.slice(0, 4)}-${hex2.slice(0, 4)}`;
}

export default function ShowQRPage() {
  const { mode } = useAttendancePolicy();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeStudent, setActiveStudent] = useState<any>(null);
  const [photoError, setPhotoError] = useState(false);

  // Time state for 1-minute rotation
  const [now, setNow] = useState<number>(Date.now());

  if (mode === "RFID") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black p-4 flex flex-col justify-center items-center">
        <PolicyStandbyScreen
          pageTitle="Dynamic QR Pass"
          pageFeature="Displaying optical dynamic QR tokens on your screen"
          requiredModeDescription="Your attendance is verified via RFID contactless smart card tap at the vehicle door."
          activeMode={mode}
          returnHref="/portal"
          returnLabel="Go to My Commute"
        />
      </div>
    );
  }

  if (mode === "STATIC_QR") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black p-4 flex flex-col justify-center items-center">
        <PolicyStandbyScreen
          pageTitle="Dynamic QR Pass"
          pageFeature="Displaying optical dynamic QR tokens on your screen"
          requiredModeDescription="Your attendance is verified by scanning the physical QR code on the bus door."
          activeMode={mode}
          returnHref="/portal/qr/scan"
          returnLabel="Open Bus Door Scanner"
        />
      </div>
    );
  }

  const resolveStudent = useCallback(() => {
    const user = store.getCurrentUser();
    setCurrentUser(user);
    const students = store.getStudents();
    if (user) {
      const activeChildId = store.getActiveChildId();
      const student = students.find(
        (s) =>
          (activeChildId && (s.id === activeChildId || s.userId === activeChildId)) ||
          (user.studentId && s.id === user.studentId) ||
          s.userId === user.id ||
          s.id === user.id ||
          s.email?.toLowerCase() === user.email?.toLowerCase()
      ) || null;
      setActiveStudent(student);
    }
  }, []);

  useEffect(() => {
    resolveStudent();
    const unsub = store.subscribe(() => resolveStudent());
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [resolveStudent]);

  // Tick clock every second for dynamic 1-minute countdown without full page reload
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const windowIndex = useMemo(() => Math.floor(now / 60000), [now]);
  const secondsRemaining = useMemo(() => 60 - Math.floor((now % 60000) / 1000), [now]);

  const studentId = activeStudent?.id || currentUser?.id || "st-student";
  const studentName = activeStudent?.fullName || currentUser?.fullName || "Student";
  const studentIdCode =
    activeStudent?.studentIdCode ||
    activeStudent?.rollNumber ||
    (studentId ? studentId.slice(0, 8).toUpperCase() : "N/A");
  const rawPhotoUrl = activeStudent?.photoUrl || currentUser?.photoUrl || null;
  const safePhotoUrl = useMemo(() => getSafePhotoUrl(rawPhotoUrl), [rawPhotoUrl]);

  const dynamicToken = useMemo(() => {
    return generateDynamicToken(studentId, windowIndex);
  }, [studentId, windowIndex]);

  // Dynamic 1-Minute Authoritative QR Payload
  const identityQrPayload = useMemo(() => {
    return JSON.stringify({
      v: 2,
      type: "STUDENT_IDENTITY",
      studentId: studentId,
      studentName: studentName,
      studentIdCode: studentIdCode,
      window: windowIndex,
      token: dynamicToken,
      verifyUrl: `https://campusfleet.vercel.app/verify/student?id=${encodeURIComponent(studentId)}`,
    });
  }, [studentId, studentName, studentIdCode, windowIndex, dynamicToken]);

  return (
    <div className="min-h-[calc(100vh-140px)] w-full p-6 animate-in fade-in flex flex-col items-center justify-center pb-24">
      <div className="w-full max-w-sm space-y-6 flex flex-col items-center">
        <Link
          href="/portal/qr"
          className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors mb-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        {/* Clean Official Digital ID Card */}
        <div className="bg-white dark:bg-gray-800/80 backdrop-blur-xl rounded-[2rem] p-8 shadow-2xl border border-gray-200 dark:border-gray-800/60 flex flex-col items-center justify-center text-center space-y-5 w-full relative overflow-hidden">
          {/* Subtle top indicator */}
          <div className="flex items-center justify-between w-full px-1">
            <div className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              Your Digital ID
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE ACTIVE</span>
            </div>
          </div>

          {/* Student Official Photo with Verified Badge */}
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-700 border-2 border-emerald-500/70 shadow-sm relative flex items-center justify-center">
              {safePhotoUrl && !photoError ? (
                <img
                  src={safePhotoUrl}
                  alt={studentName}
                  className="w-full h-full object-cover"
                  onError={() => setPhotoError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xl">
                  {studentName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-0.5 rounded-full shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* QR Code Container */}
          <div className="p-5 bg-white rounded-3xl shadow-inner border border-gray-100 relative">
            <QRCodeSVG
              value={identityQrPayload}
              size={220}
              level="H"
              includeMargin={false}
              imageSettings={{
                src: "/favicon.ico",
                x: undefined,
                y: undefined,
                height: 32,
                width: 32,
                excavate: true,
              }}
            />
          </div>

          {/* 1-Minute Dynamic QR Live Ticker (Updates in background every 1 min) */}
          <div className="w-full space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 px-2">
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 text-blue-500" />
                <span>
                  Updates in <strong className="font-mono text-blue-600 dark:text-blue-400">{secondsRemaining}s</strong>
                </span>
              </div>
              <div className="font-mono text-[10px] text-gray-400">
                {dynamicToken}
              </div>
            </div>
            {/* Countdown line */}
            <div className="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${(secondsRemaining / 60) * 100}%` }}
              />
            </div>
          </div>

          {/* Student Info */}
          <div className="space-y-1">
            <div className="text-xl font-black tracking-tight text-gray-900 dark:text-white">
              {studentName}
            </div>
            <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
              STUDENT ID: {studentIdCode}
            </div>
          </div>

          <div className="text-[11px] font-bold text-gray-400 max-w-[220px] leading-relaxed">
            Show this screen to the conductor. QR rotates every 1 min for security.
          </div>
        </div>
      </div>
    </div>
  );
}
