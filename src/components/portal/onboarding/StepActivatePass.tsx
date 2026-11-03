"use client";

import React from "react";
import {
  CreditCard,
  BusFront,
  ShieldCheck,
  Loader2,
  Lock,
} from "lucide-react";
import { StepActivatePassProps } from "./types";

export function StepActivatePass({
  fullName,
  studentIdCode,
  assignedStop,
  selectedZoneCode,
  semesterFee,
  isSubmitting,
  isRazorpayLoading,
  onSaveAndCheckout,
  onBack,
}: StepActivatePassProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-zinc-800 pb-5">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            Activate Pass & Unlock Fleet Access
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            1-Click instant activation via Razorpay. Dynamic digital QR pass, seat reservation, and live radar unlock automatically!
          </p>
        </div>
        <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 shrink-0">
          <CreditCard className="w-6 h-6" />
        </div>
      </div>

      {/* Official Transit Pass Card Preview (Light in light mode, Black in dark mode) */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 dark:from-black dark:via-zinc-950 dark:to-black text-gray-900 dark:text-white border border-emerald-200/90 dark:border-zinc-800 shadow-md shadow-emerald-500/5 dark:shadow-2xl space-y-5 relative overflow-hidden transition-colors">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shadow-xs">
              <BusFront className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm tracking-wide text-gray-900 dark:text-white">
                CAMPUSFLEET TRANSIT PASS
              </h4>
              <p className="text-[11px] text-emerald-800/70 dark:text-zinc-400 font-mono">
                Academic Semester 2026-27
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold uppercase px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-500/30">
            Ready to Activate
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-emerald-100 dark:border-zinc-800/80 relative z-10">
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400">Student</span>
            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{fullName || "Student Commuter"}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400">ERP ID</span>
            <p className="text-xs font-mono font-bold text-gray-900 dark:text-white">{studentIdCode || "230111075"}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400">Pickup Stop</span>
            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{assignedStop?.name || "Mukhani"}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400">Transit Zone</span>
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Zone {selectedZoneCode.replace("ZONE_", "")}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-zinc-900/90 border border-emerald-200/70 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
          <div>
            <span className="text-xs text-gray-600 dark:text-zinc-400">Semester Transportation Fee</span>
            <div className="text-2xl font-black text-gray-900 dark:text-white font-mono flex items-center gap-1">
              <span>₹{semesterFee.toLocaleString()}</span>
              <span className="text-xs font-normal text-gray-500 dark:text-zinc-400">/ Full Semester</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Instant Database Clearance & Pass Issuance</span>
          </div>
        </div>
      </div>

      {/* Instant Razorpay Activation Button */}
      <div className="space-y-3 pt-2">
        <button
          type="button"
          onClick={onSaveAndCheckout}
          disabled={isSubmitting || isRazorpayLoading}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-98 disabled:opacity-50 text-white font-extrabold text-base shadow-xl shadow-emerald-950/20 flex items-center justify-center gap-3 transition-all cursor-pointer"
        >
          {isSubmitting || isRazorpayLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Preparing Secure Checkout...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              <span>Pay ₹{semesterFee.toLocaleString()} & Activate Transit Pass →</span>
            </>
          )}
        </button>

        <div className="flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400 pt-1">
          <span className="flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-emerald-600" /> Razorpay 256-bit Secure
          </span>
          <span>•</span>
          <span>UPI / NetBanking / Cards / EMI</span>
          <span>•</span>
          <span>Instant Auto-Unlock</span>
        </div>
      </div>

      {/* Navigation Button */}
      <div className="pt-2 flex justify-start">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          ← Back to Profile & ID
        </button>
      </div>
    </div>
  );
}

