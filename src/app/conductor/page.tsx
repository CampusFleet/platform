"use client";

import React from "react";
import { HubDashboardView, HubModule } from "@/components/common/HubDashboardView";
import { QrCode, FileText, LayoutGrid, ShieldCheck, AlertTriangle, Bus, Lock } from "lucide-react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { Stat } from "@/components/ui";

export default function ConductorHubPage() {
  const { duty, bus, route, shift, activeTrip, tripBookings, boardedCount, outsideCount, unseatedCount, absentCount, pendingHaltRequests, activeDepartureAlert } =
    useConductorContext();
  const trip = duty?.trip;

  const modules: HubModule[] = [
    {
      title: "Passenger Manifest",
      description: activeDepartureAlert ? "🚨 Departure alarm is ringing on outside students' phones." : "Today's boarding chart with photos, stops and status.",
      icon: FileText,
      href: "/conductor/manifest",
    },
    { title: "Pass Scanner", description: "Scan a student's live QR pass.", icon: QrCode, href: "/conductor/scanner" },
    { title: "Live Seat Map", description: "Seats taken, free, and students still waiting for a seat.", icon: LayoutGrid, href: "/conductor/seat-map" },
    {
      title: "SOS & Late Halts",
      description: pendingHaltRequests > 0 ? `⚠ ${pendingHaltRequests} student(s) asking the bus to wait` : "Requests from late students.",
      icon: AlertTriangle,
      href: "/conductor/late-requests",
    },
    { title: "Attendance Audit", description: "Every boarding record for this trip.", icon: ShieldCheck, href: "/conductor/audit" },
  ];

  const capacity = bus?.capacity || 0;
  const pct = capacity ? Math.min(100, Math.round((boardedCount / capacity) * 100)) : 0;
  const statusLabel =
    activeTrip?.status === "IN_PROGRESS" ? "● On the road" : activeTrip?.status === "COMPLETED" ? "Completed" : "Not started";

  return (
    <div className="space-y-6">
      <section className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700">
            <Bus className="w-7 h-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl sm:text-2xl font-black tracking-tight">Bus {bus?.busNumber}</span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                {statusLabel}
              </span>
              {trip?.manifestLocked && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                  <Lock className="w-3 h-3" /> Chart final
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5 truncate">
              {[shift?.name, shift?.startTime && `${shift.startTime}–${shift.endTime}`, route?.name].filter(Boolean).join(" • ")}
            </p>
            {trip?.driverName && <p className="text-xs text-slate-500 mt-0.5 truncate">Driver: {trip.driverName}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "On chart", value: tripBookings.length - absentCount },
            { label: "Boarded", value: `${boardedCount}${capacity ? ` (${pct}%)` : ""}` },
            { label: "Not boarded", value: outsideCount },
            { label: "No seat yet", value: unseatedCount },
          ].map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </section>

      <HubDashboardView title="Conductor Hub" subtitle={shift ? `${shift.name}` : ""} modules={modules} />
    </div>
  );
}
