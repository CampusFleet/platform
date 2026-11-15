"use client";

import React, { useMemo, useState } from "react";
import { FileText, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Student, Bus, Route, AttendanceRecord } from "@/lib/types";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Segmented, Stat } from "@/components/ui";

interface AuditTabProps {
  attendanceRecords: AttendanceRecord[];
  students: Student[];
  bus?: Bus;
  route?: Route;
  onRefresh?: () => void;
  isSyncing?: boolean;
}

type Method = "FACE_ID" | "QR_SCAN" | "RFID" | "MANUAL";

const METHODS: Record<Method, { label: string; tone: "green" | "blue" | "neutral" }> = {
  FACE_ID: { label: "Face ID", tone: "green" },
  QR_SCAN: { label: "QR", tone: "blue" },
  RFID: { label: "RFID card", tone: "blue" },
  MANUAL: { label: "Manual", tone: "neutral" },
};

function methodOf(raw?: string): Method {
  const m = (raw || "").toUpperCase();
  if (m.includes("FACE") || m.includes("BIOMETRIC")) return "FACE_ID";
  if (m.includes("QR")) return "QR_SCAN";
  if (m.includes("RFID")) return "RFID";
  return "MANUAL";
}

export function AuditTab({ attendanceRecords, students, onRefresh, isSyncing }: AuditTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<"ALL" | Method>("ALL");

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((s) => {
      if (s.id) map.set(s.id, s);
      if (s.userId) map.set(s.userId, s);
    });
    return map;
  }, [students]);

  const counts = useMemo(() => {
    const c: Record<Method, number> = { FACE_ID: 0, QR_SCAN: 0, RFID: 0, MANUAL: 0 };
    attendanceRecords.forEach((r) => c[methodOf(r.method)]++);
    return c;
  }, [attendanceRecords]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return attendanceRecords.filter((r) => {
      if (methodFilter !== "ALL" && methodOf(r.method) !== methodFilter) return false;
      if (!q) return true;
      const s = studentMap.get(r.studentId);
      return [s?.fullName || r.userName, s?.studentIdCode, r.signatureToken, r.notes, r.studentId].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [attendanceRecords, methodFilter, searchQuery, studentMap]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<ShieldCheck className="w-5 h-5" />}
          title="Boarding log"
          subtitle="Every scan, card tap and manual mark on this run"
          action={
            onRefresh && (
              <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isSyncing}>
                <RefreshCw className={isSyncing ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                {isSyncing ? "Refreshing" : "Refresh"}
              </Button>
            )
          }
        />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Total" value={attendanceRecords.length} />
          {(Object.keys(METHODS) as Method[]).map((m) => (
            <Stat key={m} label={METHODS[m].label} value={counts[m]} />
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <Segmented<"ALL" | Method>
          value={methodFilter}
          onChange={setMethodFilter}
          options={[
            { value: "ALL", label: `All (${attendanceRecords.length})` },
            ...(Object.keys(METHODS) as Method[]).map((m) => ({ value: m, label: `${METHODS[m].label} (${counts[m]})` })),
          ]}
        />
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search name, ID, token" className="pl-10" />
        </div>

        {filteredRecords.length === 0 ? (
          <EmptyState className="border-0" icon={<FileText className="w-6 h-6" />} title="No records">
            Nothing matches this filter.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {filteredRecords.map((record) => {
              const s = studentMap.get(record.studentId);
              const name = s?.fullName || record.userName || "Name not set";
              const photo = s?.photoUrl || "";
              const method = METHODS[methodOf(record.method || "QR_SCAN")];
              const at = new Date(record.timestamp);
              return (
                <li key={record.id} className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 flex items-start gap-3 min-w-0">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={getSafePhotoUrl(photo)} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-zinc-900 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">
                      {name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-black truncate">{name}</p>
                      <Badge tone={record.status === "BOARDED" ? "green" : "neutral"} className="shrink-0">
                        {record.status.toLowerCase().replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      <Badge tone={method.tone}>{method.label}</Badge>
                      {s?.studentIdCode && <span>{s.studentIdCode}</span>}
                      <span>By {record.verifiedBy || "Not set"}</span>
                    </div>
                    {record.notes && <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 dark:border-zinc-700 pl-2">{record.notes}</p>}
                    {record.signatureToken && <p className="text-[11px] text-gray-400 font-mono truncate">Token {record.signatureToken}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
                    <p className="text-[11px] text-gray-500">{at.toLocaleDateString()}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
