"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, Input } from "@/components/ui";
import { TeacherBusSettings } from "@/components/teacher/TeacherBusSettings";

interface Row { userId: string; name: string; email: string | null; routeName: string | null; stopName: string | null; active: boolean }

/** Transport manager → teachers on the bus: see who rides where, and edit a teacher's bus settings. */
export default function TeacherRidesView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);

  const load = () =>
    fetch("/api/transport-manager/teacher-rides", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(d.success ? d.teachers : []))
      .catch(() => setRows([]));
  useEffect(() => {
    void load();
  }, []);

  if (editing) {
    return (
      <div className="max-w-2xl mx-auto space-y-3">
        <button type="button" onClick={() => { setEditing(null); void load(); }} className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-600">
          <ArrowLeft className="w-4 h-4" /> All teachers
        </button>
        <h2 className="text-lg font-black">{editing.name}</h2>
        <TeacherBusSettings userId={editing.userId} />
      </div>
    );
  }

  const shown = (rows || []).filter((r) => !q || `${r.name} ${r.email || ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <Card>
        <CardHeader icon={<GraduationCap className="w-5 h-5" />} title="Teachers on the bus" subtitle="Teachers are seated first, in the front teacher seats" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teacher" />
      </Card>
      {!rows && <div className="h-24 rounded-2xl bg-gray-100 dark:bg-zinc-900 animate-pulse" />}
      {rows && shown.length === 0 && <Card><EmptyState title="No teachers found" /></Card>}
      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.userId}>
            <button type="button" onClick={() => setEditing(r)} className="w-full text-left p-3 rounded-2xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 flex items-center gap-3 min-w-0 hover:border-blue-500">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black truncate">{r.name}</p>
                <p className="text-xs text-gray-500 truncate">{r.routeName ? `${r.routeName} · ${r.stopName || "stop not set"}` : "No bus set"}</p>
              </div>
              {r.routeName ? <Badge tone={r.active ? "green" : "neutral"}>{r.active ? "Rides" : "Paused"}</Badge> : <Badge>Not set</Badge>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
