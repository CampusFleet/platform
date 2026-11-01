import React from "react";
import { BusFront, Clock, MapPin, QrCode } from "lucide-react";

export default function PortalLoading() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* ── Modern Shimmer Commute Skeleton (1:1 with UnifiedCommuteHub) ──── */}
      <div className="space-y-5">
        {/* Header Greeting Placeholder */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-white dark:bg-gray-950 rounded-2xl border border-gray-200/80 dark:border-gray-800/80 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <BusFront className="w-5 h-5 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <div className="h-4.5 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
              <div className="h-3 w-32 bg-gray-100 dark:bg-gray-850 rounded-md animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-28 bg-emerald-500/10 border border-emerald-500/20 rounded-full animate-pulse" />
            <div className="h-7 w-20 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Primary Live Commute & Dispatch Card Skeleton */}
        <div className="bg-white dark:bg-gray-950 rounded-3xl border border-gray-200/80 dark:border-gray-800/80 p-5 sm:p-7 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="h-4 w-28 bg-blue-100 dark:bg-blue-950/60 rounded-full animate-pulse" />
              <div className="h-6 w-64 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
            </div>
            <div className="h-9 w-32 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse self-start sm:self-auto" />
          </div>

          {/* 3 Metric Mini Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 space-y-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              </div>
              <div className="h-5 w-24 bg-gray-300 dark:bg-gray-700 rounded-md animate-pulse" />
            </div>
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 space-y-2">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              </div>
              <div className="h-5 w-28 bg-gray-300 dark:bg-gray-700 rounded-md animate-pulse" />
            </div>
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 space-y-2">
              <div className="flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-gray-400" />
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              </div>
              <div className="h-5 w-20 bg-gray-300 dark:bg-gray-700 rounded-md animate-pulse" />
            </div>
          </div>

          {/* Progress / Status Bar Skeleton */}
          <div className="h-12 w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl animate-pulse" />
        </div>

        {/* Secondary Card (Stops & Timetable Blueprint) */}
        <div className="bg-white dark:bg-gray-950 rounded-3xl border border-gray-200/80 dark:border-gray-800/80 p-5 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-4.5 w-36 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 dark:bg-gray-850 rounded animate-pulse" />
          </div>
          <div className="space-y-2.5 pt-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-xl bg-gray-50/70 dark:bg-gray-900/70 border border-gray-100 dark:border-gray-800/60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500/60 animate-ping" />
                  <div className="h-3.5 w-40 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                </div>
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
