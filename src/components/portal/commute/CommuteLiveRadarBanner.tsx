"use client";

import React from "react";
import Link from "next/link";
import { Radio, Navigation, ChevronRight, Zap } from "lucide-react";
import type { Bus } from "@/lib/types";

interface CommuteLiveRadarBannerProps {
  assignedBus: Bus;
  telematicsLocation: any;
  isTelematicsLive: boolean;
  liveEtaText: string;
}

export function CommuteLiveRadarBanner({
  assignedBus,
  telematicsLocation,
  isTelematicsLive,
  liveEtaText,
}: CommuteLiveRadarBannerProps) {
  const displayBusNum = assignedBus.busNumber ? `Bus ${assignedBus.busNumber}` : `Bus #${assignedBus.id}`;
  const speed = telematicsLocation?.speed ? Math.round(telematicsLocation.speed) : 0;
  const isMoving = speed > 2;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 shadow-xl border border-indigo-900/60 transition-all">
      <div className="absolute -right-12 -top-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center shrink-0 shadow-inner">
            <Radio className="w-6 h-6 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Radar
              </span>
              <span className="text-xs font-bold text-slate-300">{displayBusNum}</span>
              {isTelematicsLive && isMoving && (
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/60">
                  {speed} km/h • In Motion
                </span>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
              {liveEtaText}
            </h3>
          </div>
        </div>

        <Link
          href={`/portal/radar?busId=${assignedBus.id}`}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs transition-all shadow-md active:scale-95 shrink-0 cursor-pointer group"
        >
          <Navigation className="w-4 h-4 text-indigo-600 group-hover:rotate-12 transition-transform" />
          <span>Track Live on Radar</span>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
