"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { store } from "@/lib/store";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { useAttendancePolicy, PolicyStandbyScreen } from "@/lib/attendance";

type SignedPass = { type: "DYNAMIC_PASS"; studentId: string; window: number; sig: string; refreshInMs: number };

/**
 * Live boarding pass. The QR payload is signed by the server (GET /api/students/pass-token)
 * and verified by the conductor scanner, so it cannot be forged or replayed after ~2 minutes.
 */
export default function ShowQRPage() {
  const { locks } = useAttendancePolicy();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeStudent, setActiveStudent] = useState<any>(null);
  const [photoError, setPhotoError] = useState(false);
  const [pass, setPass] = useState<SignedPass | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  const resolveStudent = useCallback(() => {
    const user = store.getCurrentUser();
    setCurrentUser(user);
    if (!user) return;
    const student =
      store.getStudents().find(
        (s) => (user.studentId && s.id === user.studentId) || s.userId === user.id || s.email?.toLowerCase() === user.email?.toLowerCase()
      ) || null;
    setActiveStudent(student);
  }, []);

  useEffect(() => {
    resolveStudent();
    return store.subscribe(resolveStudent);
  }, [resolveStudent]);

  // Fetch a signed pass, then refresh exactly when the server says the window rolls over.
  useEffect(() => {
    if (!locks.dynamicQr) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const res = await fetch("/api/students/pass-token", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.success) throw new Error(data.error || "Could not load your pass.");
        setPass(data.pass);
        setPassError(null);
        setExpiresAt(Date.now() + data.pass.refreshInMs);
        timer = setTimeout(load, data.pass.refreshInMs + 250);
      } catch (e: any) {
        if (cancelled) return;
        setPassError(e.message || "Could not load your pass.");
        timer = setTimeout(load, 5000);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locks.dynamicQr]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const studentName = activeStudent?.fullName || currentUser?.fullName || "Student";
  const studentIdCode = activeStudent?.studentIdCode || "Not set";
  const safePhotoUrl = useMemo(
    () => getSafePhotoUrl(activeStudent?.photoUrl || currentUser?.photoUrl || null),
    [activeStudent?.photoUrl, currentUser?.photoUrl]
  );
  const qrValue = useMemo(
    () => (pass ? JSON.stringify({ type: pass.type, studentId: pass.studentId, window: pass.window, sig: pass.sig }) : ""),
    [pass]
  );
  const secondsRemaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  if (!locks.dynamicQr) {
    return (
      <div className="min-h-[60dvh] p-4 flex flex-col justify-center items-center">
        <PolicyStandbyScreen
          pageTitle="QR Pass"
          pageFeature="Showing a QR pass to the conductor"
          requiredModeDescription="The QR pass is switched off by your transport office. Board using the method shown on your commute screen."
          activeMode={locks.faceId ? "FACE_ID" : locks.rfid ? "RFID" : "STATIC_QR"}
          returnHref="/portal"
          returnLabel="Go to My Commute"
        />
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 flex flex-col items-center">
      <div className="w-full max-w-sm space-y-5 flex flex-col items-center">
        <Link
          href="/portal/qr"
          className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="bg-white dark:bg-gray-800/80 rounded-[2rem] p-6 sm:p-8 shadow-2xl border border-gray-200 dark:border-gray-800/60 flex flex-col items-center text-center space-y-5 w-full">
          <div className="flex items-center justify-between w-full gap-2">
            <div className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Your boarding pass</div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE</span>
            </div>
          </div>

          <div className="relative">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-700 border-2 border-emerald-500/70 flex items-center justify-center">
              {safePhotoUrl && !photoError ? (
                <img src={safePhotoUrl} alt={studentName} className="w-full h-full object-cover" onError={() => setPhotoError(true)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xl">
                  {studentName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-0.5 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="p-4 bg-white rounded-3xl border border-gray-100 w-full max-w-[260px] aspect-square flex items-center justify-center">
            {pass ? (
              <QRCodeSVG value={qrValue} size={220} level="M" includeMargin={false} style={{ width: "100%", height: "100%" }} />
            ) : passError ? (
              <div className="flex flex-col items-center gap-2 text-rose-600 text-xs font-semibold px-2">
                <AlertTriangle className="w-6 h-6" />
                <span>{passError}</span>
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            )}
          </div>

          {pass && (
            <div className="w-full space-y-1.5">
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-gray-500 dark:text-gray-400">
                <RefreshCw className="w-3 h-3 text-blue-500" />
                <span>
                  Refreshes in <strong className="font-mono text-blue-600 dark:text-blue-400">{secondsRemaining}s</strong>
                </span>
              </div>
              <div className="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${Math.min(100, (secondsRemaining / 60) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="space-y-1 min-w-0 w-full">
            <div className="text-xl font-black tracking-tight text-gray-900 dark:text-white truncate">{studentName}</div>
            <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 truncate">STUDENT ID: {studentIdCode}</div>
          </div>

          <p className="text-[11px] font-bold text-gray-400 max-w-[240px] leading-relaxed">
            Show this screen to the conductor. The code changes every minute, so screenshots stop working.
          </p>
        </div>
      </div>
    </div>
  );
}
