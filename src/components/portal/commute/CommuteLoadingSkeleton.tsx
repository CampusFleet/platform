"use client";

import React from "react";
import { BusFront } from "lucide-react";

export function CommuteLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6">
        {/* Header pill skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="h-6 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
          <div className="h-4 w-28 bg-zinc-100 dark:bg-zinc-800/60 rounded-md" />
        </div>

        {/* Title & subtitle skeleton */}
        <div className="space-y-3">
          <div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
          <div className="h-4 w-96 max-w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-lg" />
        </div>

        {/* Metric cards grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 space-y-2"
            >
              <div className="h-3.5 w-20 bg-zinc-200 dark:bg-zinc-700 rounded" />
              <div className="h-5 w-28 bg-zinc-300 dark:bg-zinc-600 rounded" />
            </div>
          ))}
        </div>

        {/* Live map placeholder */}
        <div className="h-56 rounded-2xl bg-zinc-100/70 dark:bg-zinc-800/30 border border-zinc-200/60 dark:border-zinc-800 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 flex items-center justify-center">
              <BusFront className="w-5 h-5 animate-pulse" />
            </div>
            <span className="text-xs text-zinc-400 font-medium">Syncing live transit telemetry...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

