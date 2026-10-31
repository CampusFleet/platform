"use client";

import React, { useState } from "react";
import { HubDashboardView, HubModule } from "@/components/common/HubDashboardView";
import { QrCode, FileText, LayoutGrid, ShieldCheck, BusFront, CheckCircle2, AlertTriangle } from "lucide-react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { CrewBusSelectorModal } from "@/components/common/CrewBusSelectorModal";

export default function ConductorHubPage() {
  const { 
    currentUser, trips, activeTrip, bus, route, attendanceRecords, setSelectedTripId, showToast 
  } = useConductorContext();

  const [isCrewSelectorOpen, setIsCrewSelectorOpen] = useState(false);
  const [selectorTab, setSelectorTab] = useState<"CARDS" | "SCANNER">("CARDS");

  const dutyAttendance = attendanceRecords?.find(
    (a: any) =>
      (a.userId === currentUser?.id || a.studentId === currentUser?.id) &&
      (a.busId === bus?.id || a.tripId === activeTrip?.id)
  );

  const conductorModules: HubModule[] = [
    {
      title: "Boarding Scanner",
      description: "Optical QR scanner to check-in students at the bus door.",
      icon: QrCode,
      href: "/conductor/scanner"
    },
    {
      title: "Passenger Manifest",
      description: "Live roster, waitlist overrides, and 1-tap manual check-in.",
      icon: FileText,
      href: "/conductor/manifest"
    },
    {
      title: "Live Seat Map",
      description: "Visual floorplan. Scan unbooked students directly to empty seats.",
      icon: LayoutGrid,
      href: "/conductor/seat-map"
    },
    {
      title: "Attendance Audit",
      description: "Review check-in timestamps, sync status, and exceptions.",
      icon: ShieldCheck,
      href: "/conductor/audit"
    },
    {
      title: "Bus Check-in QR",
      description: "Self-service digital backup QR code for this specific bus.",
      icon: QrCode,
      href: "/conductor/bus-qr"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Active Duty Bus & Attendance Status Hero Card */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
            <BusFront className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base text-gray-900 dark:text-white">
                {bus?.busNumber || "Bus TBA"}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold border border-gray-200 dark:border-gray-700">
                {bus?.registrationNo || "UK-07-FLEET"}
              </span>
              <span className="text-xs font-mono text-gray-400">
                • {activeTrip?.tripCode || "Standby"}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
              {route?.name || "Campus Transit Corridor"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {dutyAttendance?.method === "BUS_QR_SCAN" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Duty Verified via Bus QR</span>
            </span>
          ) : dutyAttendance ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Duty Active (Card Selected)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold animate-pulse">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Duty Check-In Pending</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setSelectorTab("SCANNER");
              setIsCrewSelectorOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
            title="Scan physical QR code on bus door to mark attendance"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan Bus Door QR</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectorTab("CARDS");
              setIsCrewSelectorOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 active:scale-95 text-gray-900 dark:text-gray-100 text-xs font-bold border border-gray-200 dark:border-gray-700 shadow-sm transition-all cursor-pointer"
            title="Choose a bus like students"
          >
            <BusFront className="w-4 h-4 text-blue-500" />
            <span>Switch Bus</span>
          </button>
        </div>
      </div>

      <HubDashboardView 
        title="Conductor Hub" 
        subtitle={activeTrip ? `Active Trip: ${activeTrip.tripCode}` : "Select a bus to begin conducting."}
        modules={conductorModules}
      />

      <CrewBusSelectorModal
        isOpen={isCrewSelectorOpen}
        onClose={() => setIsCrewSelectorOpen(false)}
        role="conductor"
        initialTab={selectorTab}
        currentUser={currentUser}
        currentTripId={activeTrip?.id}
        onSelectBusAndTrip={(busId, tripId) => {
          if (tripId) {
            setSelectedTripId(tripId);
          } else {
            const match = trips.find(t => t.busId === busId && t.status !== "COMPLETED") || trips.find(t => t.busId === busId);
            if (match) setSelectedTripId(match.id);
          }
          showToast("✓ Conductor duty active! Bus claimed and attendance recorded.");
        }}
      />
    </div>
  );
}
