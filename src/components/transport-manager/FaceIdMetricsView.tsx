"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import type { FaceMetrics } from "@/lib/biometrics-metrics";

const fmtPct = (v: number | null) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
const fmtMs = (v: number | null) => (v === null ? "—" : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);

export function FaceIdMetricsView() {
  const [days, setDays] = useState(14);
  const [busIds, setBusIds] = useState("");
  const [data, setData] = useState<{ metrics: FaceMetrics; evaluation: { go: boolean; checks: { name: string; ok: boolean; value: any }[] } } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/biometrics/metrics?days=${days}&busIds=${encodeURIComponent(busIds)}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [days, busIds]);

  useEffect(() => {
    load();
  }, [load]);

  const m = data?.metrics;
  const card = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1">{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Face ID pilot metrics</h1>
          <p className="text-xs text-slate-500">Door-camera accuracy, speed and device health. Use these numbers for the go / no-go decision.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs">
            {[1, 7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} day{d > 1 ? "s" : ""}</option>)}
          </select>
          <input value={busIds} onChange={(e) => setBusIds(e.target.value)} placeholder="Pilot bus ids, e.g. 3,7" className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs w-40" />
          <button type="button" onClick={load} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </div>

      {m && (
        <>
          <div className={`p-4 rounded-2xl border ${data!.evaluation.go ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800" : "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"}`}>
            <div className="text-sm font-black">{data!.evaluation.go ? "GO — criteria met for fleet roll-out" : "NO-GO yet — see failing criteria"}</div>
            <ul className="mt-2 grid sm:grid-cols-2 gap-1 text-xs">
              {data!.evaluation.checks.map((c) => (
                <li key={c.name} className="flex items-center gap-1.5">
                  {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                  {c.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {card("Door crossings", m.captures, `${m.decided} decided`)}
            {card("Match rate", fmtPct(m.matchRate), `${fmtPct(m.rosterMatchShare)} found in bus roster`)}
            {card("Unregistered faces", fmtPct(m.unknownRate), `${m.unauthorizedIncidents} intruder alerts`)}
            {card("False alerts reported", m.falseAlertReports, `${fmtPct(m.falseAlertRate)} of intruder alerts`)}
            {card("Spoof attempts blocked", m.spoofRejected)}
            {card("Unusable frames", m.rejectedLowQuality, "blurred / too small / side-on")}
            {card("Decision time p50 / p95", `${fmtMs(m.latencyP50Ms)} / ${fmtMs(m.latencyP95Ms)}`)}
            {card("Uploaded from offline buffer", fmtPct(m.offlineUploadShare))}
            {card("Devices online", `${m.devices.online}/${m.devices.total}`, `${m.devices.staleQueues} with a queue older than 1 h`)}
            {card("Unprocessed captures", m.failedPending)}
            {card("Match threshold", m.threshold ? m.threshold.threshold : "—", m.threshold?.calibratedAt ? `calibrated, FNMR ${fmtPct(m.threshold.fnmr)}` : "provisional — run calibration")}
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-xs font-bold mb-2">Outcomes</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(m.outcomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <span key={k} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono">{k.replace(/_/g, " ")}: {v}</span>
              ))}
              {Object.keys(m.outcomes).length === 0 && <span className="text-slate-500">No door crossings in this window yet.</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
