"use client";

import React from "react";
import Link from "next/link";
import {
  Footprints,
  CheckCircle2,
  Navigation,
  BusFront,
  Zap,
  ExternalLink,
  UserCheck,
  RefreshCw,
  Radio,
  ArrowRight,
  Hand,
  Clock,
} from "lucide-react";
import type { Stop, Route } from "@/lib/types";
import type { FirstMileMetrics } from "@/lib/commute/types";

interface CommuteWalkingStageProps {
  assignedStop: Stop | null;
  assignedRoute?: Route | null;
  stops: Stop[];
  metrics: FirstMileMetrics;
  telematicsLocation: any;
  assignedBusNumber: string;
  assignedBusId?: string | number;
  userCoords?: { latitude: number; longitude: number } | null;
  deviceGpsCoords?: { latitude: number; longitude: number } | null;
  userAddress?: string | null;
  onArrivedAtStop: () => void;
  onSelectSeatAheadOfTime: () => void;
}

export function CommuteWalkingStage({
  assignedStop,
  assignedRoute,
  stops,
  metrics,
  telematicsLocation,
  assignedBusNumber,
  assignedBusId,
  userCoords,
  deviceGpsCoords,
  userAddress,
  onArrivedAtStop,
  onSelectSeatAheadOfTime,
}: CommuteWalkingStageProps) {
  const radarBusParam = assignedBusId || assignedBusNumber;
  const isReasonableWalkingDist = metrics.userToStopDistMeters !== null && metrics.userToStopDistMeters <= 2500;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-7 border border-zinc-200/90 dark:border-zinc-800 shadow-sm space-y-6 animate-in fade-in duration-300">
      {/* ─── 1. Header with First-Mile Guidance & Quick Actions ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
            <Footprints className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                First-Mile Guidance
              </span>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {isReasonableWalkingDist ? `${metrics.userToStopDistMeters}m to stop` : "Corridor Boarding Stop"}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              Walk to {assignedStop?.name || "Designated Stop"}
            </h2>
          </div>
        </div>

        {/* Action Buttons: Full Screen Radar + Arrived at Stop */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <Link
            href={`/portal/radar?busId=${radarBusParam}`}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer group"
          >
            <Navigation className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
            <span>See in Full Screen Radar</span>
          </Link>

          <button
            type="button"
            onClick={onArrivedAtStop}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>I've Arrived at Stop</span>
          </button>
        </div>
      </div>

      {/* ─── 2. First-Mile Pedestrian Walk Card (Uber/Transit Standard) ─── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-slate-900 to-zinc-950 text-white p-5 sm:p-6 shadow-xl border border-emerald-500/20 space-y-4">
        {/* Glow backdrop decorative effect */}
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-emerald-400" />
                <span>First-Mile Walk Active</span>
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/10">
                {isReasonableWalkingDist ? `${metrics.userToStopDistMeters}m to stop` : "Designated Boarding Corridor"}
              </span>
            </div>

            <div className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <span>Walk to {assignedStop?.name || "Pickup Stop"}</span>
            </div>

            <p className="text-xs text-zinc-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Estimated Walk: <strong className="text-white font-mono">~{metrics.walkingEtaMins} mins</strong>
              </span>
              {assignedStop?.landmark && (
                <span className="text-zinc-400">
                  • Near {assignedStop.landmark}
                </span>
              )}
            </p>
          </div>

          {/* Action CTAs: Full Radar Launcher & Emergency Hold */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href={`/portal/radar?busId=${radarBusParam}&action=sos`}
              className="px-4 py-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 text-rose-200 border border-rose-400/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm group"
              title="Running Late? Request a 2-minute bus hold"
            >
              <Hand className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
              <span>Hold Bus (2 min)</span>
            </Link>

            <Link
              href={`/portal/radar?busId=${radarBusParam}`}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white text-xs font-bold shadow-lg transition-all flex items-center gap-2 cursor-pointer group border border-white/20"
              title="Open full-screen live radar & pedestrian turn-by-turn navigation"
            >
              <Navigation className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              <span>Open Live Radar & Walk Navigation</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-80 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>

      {/* ─── 3. Walking & Arrival Topography Metrics ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
          <div className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
            <Footprints className="w-3.5 h-3.5 text-emerald-600" />
            <span>Your Walk Time</span>
          </div>
          <div className="text-base font-black text-zinc-900 dark:text-white font-mono">
            {isReasonableWalkingDist ? `~${metrics.walkingEtaMins} mins` : "Walking Mode"}
          </div>
          <p className="text-[11px] text-zinc-500">
            {isReasonableWalkingDist && metrics.userToStopDistMeters ? `${metrics.userToStopDistMeters}m at 4.8 km/h` : "Designated boarding point"}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
          <div className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
            <BusFront className="w-3.5 h-3.5 text-blue-600" />
            <span>Bus {assignedBusNumber} Arrival</span>
          </div>
          <div className="text-base font-black text-zinc-900 dark:text-white font-mono">
            {metrics.busEtaMins ? `~${metrics.busEtaMins} mins` : "In Transit"}
          </div>
          <p className="text-[11px] text-zinc-500">
            {metrics.busToStopDistMeters ? `${metrics.busToStopDistMeters}m from your stop` : "Awaiting bus GPS"}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
          <div className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Walking Cushion</span>
          </div>
          <div className="text-base font-black text-zinc-900 dark:text-white font-mono">
            {metrics.arrivalCushionMins !== null ? (
              metrics.arrivalCushionMins >= 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">+{metrics.arrivalCushionMins}m lead</span>
              ) : (
                <span className="text-rose-600 dark:text-rose-400">Hurry ({Math.abs(metrics.arrivalCushionMins)}m late)</span>
              )
            ) : (
              "Synchronizing"
            )}
          </div>
          <p className="text-[11px] text-zinc-500">
            {metrics.arrivalCushionMins !== null && metrics.arrivalCushionMins >= 0
              ? "You will reach before the bus"
              : "Bus may reach before you"}
          </p>
        </div>
      </div>

      {/* ─── 4. Navigation & Companion Actions ─── */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-100 dark:border-zinc-800">
        {metrics.googleMapsWalkingUrl ? (
          <a
            href={metrics.googleMapsWalkingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 text-zinc-700 dark:text-zinc-200 font-semibold text-xs transition-colors flex items-center justify-center gap-2"
          >
            <span>Open in Google Maps Navigation</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </a>
        ) : <div />}

        <button
          type="button"
          onClick={onSelectSeatAheadOfTime}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          <UserCheck className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>View Bus Seat Map Ahead of Time ↓</span>
        </button>
      </div>
    </div>
  );
}
