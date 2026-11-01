"use client";

import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  Search,
  QrCode,
  Radio,
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  RotateCcw,
  RefreshCw,
  FileText,
  UserCheck,
  Hash,
} from "lucide-react";
import { Student, Bus, Route, AttendanceRecord } from "@/lib/types";
import { getSafePhotoUrl } from "@/lib/image-utils";

interface AuditTabProps {
  attendanceRecords: AttendanceRecord[];
  students: Student[];
  bus?: Bus;
  route?: Route;
  onRefresh?: () => void;
  isSyncing?: boolean;
}

export function AuditTab({
  attendanceRecords,
  students,
  bus,
  route,
  onRefresh,
  isSyncing,
}: AuditTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<"ALL" | "QR_SCAN" | "RFID" | "MANUAL">("ALL");

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach(s => {
      if (s.id) map.set(s.id, s);
      if (s.userId) map.set(s.userId, s);
    });
    return map;
  }, [students]);

  // Aggregate stats
  const stats = useMemo(() => {
    let total = attendanceRecords.length;
    let qrCount = 0;
    let rfidCount = 0;
    let manualCount = 0;

    attendanceRecords.forEach(r => {
      const m = (r.method || "").toUpperCase();
      if (m.includes("QR")) qrCount++;
      else if (m.includes("RFID")) rfidCount++;
      else manualCount++;
    });

    return { total, qrCount, rfidCount, manualCount };
  }, [attendanceRecords]);

  // Filter records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return attendanceRecords.filter(r => {
      const s = studentMap.get(r.studentId);
      const methodStr = (r.method || "").toUpperCase();

      // Method filter
      if (methodFilter === "QR_SCAN" && !methodStr.includes("QR")) return false;
      if (methodFilter === "RFID" && !methodStr.includes("RFID")) return false;
      if (methodFilter === "MANUAL" && (methodStr.includes("QR") || methodStr.includes("RFID"))) return false;

      // Search query
      if (!q) return true;

      const fullName = (s?.fullName || r.userName || "").toLowerCase();
      const studentIdCode = (s?.studentIdCode || "").toLowerCase();
      const token = (r.signatureToken || "").toLowerCase();
      const notes = (r.notes || "").toLowerCase();
      const id = (r.studentId || "").toLowerCase();

      return (
        fullName.includes(q) ||
        studentIdCode.includes(q) ||
        token.includes(q) ||
        notes.includes(q) ||
        id.includes(q)
      );
    });
  }, [attendanceRecords, methodFilter, searchQuery, studentMap]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ── TOP STATS HERO ── */}
      <div className="bg-zinc-950 dark:bg-black border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 flex items-center justify-center font-bold shadow-md shadow-emerald-500/10">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-lg text-white">
                Institutional Attendance Audit Trail
              </h3>
              <p className="text-xs text-zinc-400">
                Cryptographically signed records of all optical QR scans, RFID tap-ins, and manual overrides.
              </p>
            </div>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition-all cursor-pointer disabled:opacity-50 self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-emerald-400" : ""}`} />
              <span>{isSyncing ? "Syncing..." : "Live Refresh"}</span>
            </button>
          )}
        </div>

        {/* Breakdown Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Total Verified</div>
            <div className="text-2xl font-black text-white font-mono">{stats.total}</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <QrCode className="w-3 h-3" /> QR Scans
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono">{stats.qrCount}</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
            <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
              <Radio className="w-3 h-3" /> RFID Taps
            </div>
            <div className="text-2xl font-black text-indigo-400 font-mono">{stats.rfidCount}</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
            <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" /> Manual Desk
            </div>
            <div className="text-2xl font-black text-blue-400 font-mono">{stats.manualCount}</div>
          </div>
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ── */}
      <div className="bg-zinc-950 dark:bg-black border border-zinc-800 rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Method Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setMethodFilter("ALL")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                methodFilter === "ALL"
                  ? "bg-white text-zinc-950 font-black shadow-sm"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white"
              }`}
            >
              All Events ({attendanceRecords.length})
            </button>

            <button
              onClick={() => setMethodFilter("QR_SCAN")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                methodFilter === "QR_SCAN"
                  ? "bg-emerald-600 text-white font-black shadow-sm"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-emerald-400"
              }`}
            >
              Optical QR ({stats.qrCount})
            </button>

            <button
              onClick={() => setMethodFilter("RFID")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                methodFilter === "RFID"
                  ? "bg-indigo-600 text-white font-black shadow-sm"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-indigo-400"
              }`}
            >
              RFID Door Card ({stats.rfidCount})
            </button>

            <button
              onClick={() => setMethodFilter("MANUAL")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                methodFilter === "MANUAL"
                  ? "bg-blue-600 text-white font-black shadow-sm"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-blue-400"
              }`}
            >
              Manual Override ({stats.manualCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Name, Roll ID, Token..."
              className="w-full text-xs pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-2xl text-white placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-sans transition-all"
            />
          </div>
        </div>

        {/* ── AUDIT EVENT LOGS ── */}
        <div className="divide-y divide-zinc-900">
          {filteredRecords.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-500 font-mono space-y-2">
              <FileText className="w-8 h-8 mx-auto text-zinc-700" />
              <div>No attendance audit records match the selected filter.</div>
            </div>
          ) : (
            filteredRecords.map(record => {
              const s = studentMap.get(record.studentId);
              const fullName = s?.fullName || record.userName || "Student Passenger";
              const studentCollegeId = s?.studentIdCode || "";
              const photo = s?.photoUrl || "";
              const method = (record.method || "QR_SCAN").toUpperCase();
              const isBoarded = record.status === "BOARDED";

              return (
                <div
                  key={record.id}
                  className="p-3.5 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Photo or Avatar */}
                    {photo ? (
                      <div className="relative w-10 h-12 rounded-xl overflow-hidden border border-emerald-500/70 bg-black shrink-0">
                        <img
                          src={getSafePhotoUrl(photo)}
                          alt={fullName}
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-xs shrink-0">
                        {fullName.substring(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-bold text-sm text-white flex items-center gap-2 flex-wrap">
                        <span className="truncate">{fullName}</span>

                        {studentCollegeId && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.2 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                            ID: {studentCollegeId}
                          </span>
                        )}

                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.2 rounded-full ${
                            isBoarded
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {record.status}
                        </span>
                      </div>

                      <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2 flex-wrap">
                        <span className="text-zinc-300">
                          Method: <strong>{record.method}</strong>
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span>Verified by: {record.verifiedBy || "Conductor"}</span>
                        {record.signatureToken && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span className="text-zinc-500 font-mono text-[10px]">
                              Sig: {record.signatureToken}
                            </span>
                          </>
                        )}
                      </div>

                      {record.notes && (
                        <div className="text-[11px] text-zinc-400 italic border-l-2 border-zinc-700 pl-2 mt-1">
                          {record.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timestamp badge */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-900">
                    <span className="text-[11px] font-mono font-bold text-emerald-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-xl">
                      {new Date(record.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 mt-1">
                      {new Date(record.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
