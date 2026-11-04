"use client";

import React from "react";
import Link from "next/link";
import { BusFront, AlertCircle, RefreshCw, Settings } from "lucide-react";

interface CommuteNoBusStageProps {
  settingsHref: string;
  onRefresh: () => void;
}

export function CommuteNoBusStage({ settingsHref, onRefresh }: CommuteNoBusStageProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 sm:p-12 border border-zinc-200/80 dark:border-zinc-800 shadow-sm text-center space-y-6 animate-in fade-in duration-300">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
        <BusFront className="w-8 h-8" />
      </div>

      <div className="space-y-2 max-w-md mx-auto">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs font-bold">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Transit Dispatch Status</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
          No Bus Assigned Currently
        </h2>
        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          There is currently no transport vehicle assigned to your profile for today's commute. Your route administrator or automated fleet allocator will assign a bus prior to departure.
        </p>
      </div>

      <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Check For Assignment</span>
        </button>
        <Link
          href={settingsHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 text-xs font-bold transition-all shadow-2xs"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Review Home Stop in Settings</span>
        </Link>
      </div>
    </div>
  );
}

