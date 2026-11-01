import React from "react";
import BusLoadingScreen from "@/components/common/BusLoadingScreen";
import { Sparkles, BusFront, ShieldCheck, MapPin } from "lucide-react";

export default function PortalLoading() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
      {/* ── Top Hero Animated Telematics Stage ────────────────────────────── */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-100 dark:border-gray-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
        {/* Subtle background ambient glow */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-500/10 dark:bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <BusLoadingScreen
          message="Loading Commute & Telematics..."
          subtitle="Graphic Era Hill University • Smart Fleet Gateway"
          fullScreen={false}
        />
      </div>

      {/* ── Commute Cockpit Skeleton Blueprint (Prevents Layout Shift) ──── */}
      <div className="space-y-5 opacity-70">
        {/* Header Greeting Placeholder */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-white/60 dark:bg-gray-900/60 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/15 dark:bg-blue-400/15 flex items-center justify-center text-blue-600 dark:text-blue-400 animate-pulse">
              <BusFront className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <div className="h-5 w-48 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse" />
              <div className="h-3 w-32 bg-gray-100 dark:bg-gray-800/60 rounded-md animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-28 bg-emerald-500/10 border border-emerald-500/20 rounded-full animate-pulse" />
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
          </div>
        </div>

        {/* Primary Pass / Telematics Card Skeleton */}
        <div className="bg-white/80 dark:bg-gray-900/80 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 sm:p-8 shadow-lg space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-3.5 w-24 bg-blue-100 dark:bg-blue-950/60 rounded-full animate-pulse" />
              <div className="h-7 w-56 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
            </div>
            <div className="h-10 w-24 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/80 space-y-2">
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              <div className="h-6 w-28 bg-gray-300 dark:bg-gray-700 rounded-md animate-pulse" />
            </div>
            <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/80 space-y-2">
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              <div className="h-6 w-32 bg-gray-300 dark:bg-gray-700 rounded-md animate-pulse" />
            </div>
            <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/80 space-y-2">
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              <div className="h-6 w-24 bg-gray-300 dark:bg-gray-700 rounded-md animate-pulse" />
            </div>
          </div>

          <div className="h-14 w-full bg-gradient-to-r from-blue-50 dark:from-blue-950/20 via-gray-100 dark:via-gray-800/40 to-blue-50 dark:to-blue-950/20 rounded-2xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
