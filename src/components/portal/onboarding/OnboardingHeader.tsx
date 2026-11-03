"use client";

import React from "react";
import { ArrowLeft, BusFront, Lock } from "lucide-react";

interface OnboardingHeaderProps {
  onBack: () => void;
}

export function OnboardingHeader({ onBack }: OnboardingHeaderProps) {
  return (
    <div className="w-full bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-gray-200/80 dark:border-zinc-800 sticky top-0 z-30 shadow-xs">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 sm:p-2 -ml-1 sm:-ml-2 rounded-xl text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors shrink-0"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 shrink-0">
            <BusFront className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 dark:text-white leading-tight truncate sm:whitespace-normal">
              Transit Pass Onboarding & Activation
            </h1>
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
              Zero friction • Automated route & stop allocation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 sm:px-3 py-1 rounded-full flex items-center gap-1 sm:gap-1.5">
            <Lock className="w-3 h-3" />
            <span className="hidden xs:inline">256-bit </span>Encrypted
          </span>
        </div>
      </div>
    </div>
  );
}

