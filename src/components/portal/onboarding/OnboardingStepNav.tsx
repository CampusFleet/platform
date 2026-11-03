"use client";

import React from "react";
import { MapPin, User, CreditCard } from "lucide-react";

interface OnboardingStepNavProps {
  activeStep: 1 | 2 | 3;
  onSelectStep: (step: 1 | 2 | 3) => void;
}

export function OnboardingStepNav({ activeStep, onSelectStep }: OnboardingStepNavProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-3 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs">
      <button
        type="button"
        onClick={() => onSelectStep(1)}
        className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
          activeStep === 1
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
        }`}
      >
        <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
        <span className="hidden sm:inline">1. Home & Route</span>
        <span className="sm:hidden">1. Home</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectStep(2)}
        className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
          activeStep === 2
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
        }`}
      >
        <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
        <span className="hidden sm:inline">2. Profile & ID</span>
        <span className="sm:hidden">2. Profile</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectStep(3)}
        className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
          activeStep === 3
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
        }`}
      >
        <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
        <span className="hidden sm:inline">3. Activate Pass</span>
        <span className="sm:hidden">3. Pass</span>
      </button>
    </div>
  );
}

