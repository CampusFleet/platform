"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Users, Footprints, ShieldAlert } from "lucide-react";

interface Occupancy {
  onboard: number;
  roaming: number;
  alighted: number;
  unregisteredOnboard: number;
  updatedAt: string;
}

/** Live passenger count from door cameras (refreshes on every gate event via SSE). */
export function GateOccupancyCard({ busId, capacity }: { busId: number; capacity?: number }) {
  const [occ, setOcc] = useState<Occupancy | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/gate/occupancy?busId=${busId}`, { cache: "no-store" });
    if (res.ok) setOcc(await res.json());
  }, [busId]);

  useEffect(() => {
    load();
    let source: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      source = new EventSource(`/api/ops/stream?busId=${busId}`);
      source.addEventListener("GATE", () => load());
    }
    const t = setInterval(load, 60000);
    return () => {
      clearInterval(t);
      source?.close();
    };
  }, [busId, load]);

  if (!occ) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
          <Users className="w-3.5 h-3.5" /> Onboard (cameras)
        </div>
        <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">
          {occ.onboard}
          {capacity ? <span className="text-xs text-slate-400 font-normal"> / {capacity}</span> : null}
        </div>
      </div>
      <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
          <Footprints className="w-3.5 h-3.5" /> Stepped out
        </div>
        <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">{occ.roaming}</div>
      </div>
      <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">
          <ShieldAlert className="w-3.5 h-3.5" /> Unregistered
        </div>
        <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">{occ.unregisteredOnboard}</div>
      </div>
    </div>
  );
}
