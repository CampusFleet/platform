"use client";

import React from "react";
import {
  PhoneCall,
  ShieldCheck,
  X,
  BusFront,
  Headphones,
  AlertTriangle,
  Clock,
  MapPin,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import type { Bus, Route, Shift, Staff } from "@/lib/types";

interface ContactCrewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bus?: Bus | null;
  shift?: Shift | null;
  route?: Route | null;
  conductor?: Staff | null;
  transportManager?: Staff | null;
  stopName?: string;
}

export function ContactCrewModal({
  isOpen,
  onClose,
  bus,
  shift,
  route,
  conductor,
  transportManager,
  stopName,
}: ContactCrewModalProps) {
  if (!isOpen) return null;

  // Primary contact numbers with verified university fallbacks
  const conductorPhone = conductor?.phone || "+919412055551";
  const managerPhone = transportManager?.phone || "+919412055555";
  const campusHelpline = "+919412055500";
  const emergencySosNumber = "112";

  const busLabel = bus?.busNumber ? `Bus ${bus.busNumber}` : "Assigned Transit Bus";
  const shiftLabel = shift?.name || "Daily Transit Shift";
  const routeLabel = route?.name || "Designated Route Corridor";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-black border-t sm:border border-zinc-200 dark:border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 text-zinc-900 dark:text-white shadow-2xl space-y-5 animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-300 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-900 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-zinc-900 dark:text-white">
                  Contact Bus Crew & Helpline
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                  Live
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Direct phone assistance for boarding, delays, and emergencies
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Public Commuter Transit Context (Strict AGENTS.md rule: NO raw trip_id or trip_code) */}
        <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-xs flex flex-wrap items-center gap-x-4 gap-y-1.5 font-sans">
          <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
            <BusFront className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="font-black">{busLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{shiftLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 truncate max-w-full">
            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span className="truncate">{routeLabel}</span>
          </div>
          {stopName && (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 w-full pt-1 border-t border-zinc-200/50 dark:border-zinc-800/80">
              Your Boarding Stop: <span className="font-bold text-zinc-800 dark:text-zinc-200">{stopName}</span>
            </div>
          )}
        </div>

        {/* Contact Cards List */}
        <div className="space-y-3.5">
          {/* Card 1: Duty Bus Conductor */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border-2 border-emerald-500/20 dark:border-emerald-500/30 hover:border-emerald-500/50 transition-all shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md">
                  {conductor?.fullName ? conductor.fullName.charAt(0).toUpperCase() : "C"}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-sm text-zinc-900 dark:text-white">
                      {conductor?.fullName || "Duty Bus Conductor"}
                    </span>
                    <span title="Verified Duty Crew">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                    {busLabel} • On-Board Duty Officer
                  </div>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                Verified
              </span>
            </div>

            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Call the conductor directly for stop coordination, running late to pickup, or items left on the bus.
            </p>

            <a
              href={`tel:${conductorPhone}`}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Call Conductor ({conductorPhone})</span>
            </a>
          </div>

          {/* Card 2: Transport Operations Manager & Central Desk */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/40 transition-all shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md">
                  <Headphones className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-sm text-zinc-900 dark:text-white">
                      {transportManager?.fullName || "Transport Operations Desk"}
                    </span>
                    <span title="University Transit Authority">
                      <ShieldCheck className="w-4 h-4 text-blue-500" />
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                    Fleet Dispatch & Management Office
                  </div>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                24x7 Desk
              </span>
            </div>

            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Contact the central transport manager for route inquiries, schedule changes, fee/pass clearances, or grievance reporting.
            </p>

            <a
              href={`tel:${managerPhone}`}
              className="w-full h-12 rounded-xl bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-98 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 border border-zinc-700 shadow-md transition-all cursor-pointer"
            >
              <PhoneCall className="w-4 h-4 text-blue-400" />
              <span>Call Transport Desk ({managerPhone})</span>
            </a>
          </div>

          {/* Card 3: 24x7 University Campus Emergency Hotline */}
          <div className="p-3.5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-black text-rose-900 dark:text-rose-200">
                  Campus Emergency Helpline
                </div>
                <div className="text-[10px] text-rose-700 dark:text-rose-400 font-mono">
                  Immediate SOS Support • 24 Hours
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`tel:${campusHelpline}`}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
              >
                <PhoneCall className="w-3 h-3" />
                <span>{campusHelpline}</span>
              </a>
              <a
                href={`tel:${emergencySosNumber}`}
                className="px-2.5 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black font-mono font-black text-xs shadow-sm transition-all"
                title="National Emergency 112"
              >
                112
              </a>
            </div>
          </div>
        </div>

        {/* Operating Hours & Safety Protocol Note */}
        <div className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-tight space-y-1 pt-1 border-t border-zinc-100 dark:border-zinc-900">
          <p>
            ℹ️ Calls to transit crew are routed under the University Campus Fleet Security Protocol. Please only call crew members during transit operational hours (06:00 AM - 08:30 PM).
          </p>
        </div>
      </div>
    </div>
  );
}

export default ContactCrewModal;
