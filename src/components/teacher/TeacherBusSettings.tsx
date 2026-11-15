"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BusFront } from "lucide-react";
import { Button, Card, CardHeader, Field, Select, cn } from "@/components/ui";

/**
 * Teacher Settings → bus. The teacher picks route, pickup stop, morning and evening shift and the
 * weekdays they ride. The boarding chart adds them to that bus and gives them a front seat first.
 */

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
type Day = (typeof DAYS)[number];

interface Options {
  ready: boolean;
  settings: { routeId: string | null; stopId: string | null; incomingShiftId: string | null; outgoingShiftId: string | null; days: string[]; isActive: boolean } | null;
  routes: { id: string; name: string; stops: { id: string; name: string }[] }[];
  incomingShifts: { id: string; name: string; startTime: string | null }[];
  outgoingShifts: { id: string; name: string; startTime: string | null }[];
}

export function TeacherBusSettings({ userId }: { userId?: string } = {}) {
  // Managers edit a teacher through /api/transport-manager/teacher-rides; teachers edit themselves.
  const endpoint = userId ? `/api/transport-manager/teacher-rides?userId=${encodeURIComponent(userId)}` : "/api/teacher/ride-settings";
  const [opt, setOpt] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const [inId, setInId] = useState("");
  const [outId, setOutId] = useState("");
  const [days, setDays] = useState<Day[]>(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(endpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setOpt(d);
        const s = d.settings;
        if (s) {
          setRouteId(s.routeId || "");
          setStopId(s.stopId || "");
          setInId(s.incomingShiftId || "");
          setOutId(s.outgoingShiftId || "");
          if (s.days?.length) setDays(s.days);
          setActive(s.isActive);
        }
      })
      .catch((e) => setError(e.message || "Could not load bus settings."));
  }, [endpoint]);

  const stops = useMemo(() => opt?.routes.find((r) => r.id === routeId)?.stops || [], [opt, routeId]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(userId ? "/api/transport-manager/teacher-rides" : "/api/teacher/ride-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(userId ? { userId } : {}), routeId, stopId, incomingShiftId: inId || null, outgoingShiftId: outId || null, days, isActive: active }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg({ ok: Boolean(d.success), text: d.message || d.error || (d.success ? "Saved." : "Could not save.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={<BusFront className="w-5 h-5" />} title="My bus" subtitle="Teachers get the front seats on the bus." />
      {error && <p className="text-sm text-gray-500">{error}</p>}
      {!opt && !error && <div className="h-24 rounded-xl bg-gray-100 dark:bg-zinc-900 animate-pulse" />}
      {opt && !opt.ready && <p className="text-sm text-amber-700 dark:text-amber-400">Bus booking for teachers is being set up. Please check again later.</p>}
      {opt && opt.ready && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Route">
              <Select value={routeId} onChange={(e) => { setRouteId(e.target.value); setStopId(""); }}>
                <option value="">Choose route</option>
                {opt.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Pickup stop">
              <Select value={stopId} disabled={!routeId} onChange={(e) => setStopId(e.target.value)}>
                <option value="">Choose stop</option>
                {stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Morning bus (to campus)">
              <Select value={inId} onChange={(e) => setInId(e.target.value)}>
                <option value="">I don't take it</option>
                {opt.incomingShifts.map((s) => <option key={s.id} value={s.id}>{s.startTime ? `${s.startTime} · ${s.name}` : s.name}</option>)}
              </Select>
            </Field>
            <Field label="Bus home (from campus)">
              <Select value={outId} onChange={(e) => setOutId(e.target.value)}>
                <option value="">I don't take it</option>
                {opt.outgoingShifts.map((s) => <option key={s.id} value={s.id}>{s.startTime ? `${s.startTime} · ${s.name}` : s.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Days</p>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))}
                    className={cn("px-3 py-2 rounded-xl text-xs font-bold border", on ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800")}
                  >
                    {d.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            I use the bus
          </label>
          {msg && <p className={`text-xs font-semibold ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{msg.text}</p>}
          <Button onClick={save} loading={saving} disabled={!routeId || !stopId || (!inId && !outId) || days.length === 0}>
            Save bus settings
          </Button>
        </div>
      )}
    </Card>
  );
}
