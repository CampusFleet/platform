"use client";

import React, { useState } from "react";
import { HubDashboardView, HubModule } from "@/components/common/HubDashboardView";
import { QrCode, FileText, LayoutGrid, ShieldCheck, BusFront, CheckCircle2, AlertTriangle } from "lucide-react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { CrewBusSelectorModal } from "@/components/common/CrewBusSelectorModal";

export default function ConductorHubPage() {
  const { 
    currentUser, trips, activeTrip, bus, route, shift, attendanceRecords, 
    tripBookings, boardedCount, pendingCount, haltRequests,
    setSelectedTripId, showToast 
  } = useConductorContext();

  const [isCrewSelectorOpen, setIsCrewSelectorOpen] = useState(false);
  const [selectorTab, setSelectorTab] = useState<"CARDS" | "SCANNER">("CARDS");

  const dutyAttendance = attendanceRecords?.find(
    (a: any) =>
      (a.userId === currentUser?.id || a.studentId === currentUser?.id) &&
      (a.busId === bus?.id || a.tripId === activeTrip?.id)
  );

  const pendingSOS = haltRequests.filter(r => r.status === "PENDING").length;

  const conductorModules: HubModule[] = [
    {
      title: "Boarding Scanner",
      description: "High-speed optical QR scanner to check-in students at the bus door.",
      icon: QrCode,
      href: "/conductor/scanner"
    },
    {
      title: "Passenger Manifest",
      description: "Live roster with student passport photos, college IDs, and 1-tap check-in.",
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
      title: "SOS & Late Halts",
      description: pendingSOS > 0 ? `⚠️ ${pendingSOS} Active Late Student Requests` : "Manage real-time halt requests from late students.",
      icon: AlertTriangle,
      href: "/conductor/late-requests"
    },
    {
      title: "Attendance Audit",
      description: "Review signed timestamps, RFID tap-in logs, and compliance audit trail.",
      icon: ShieldCheck,
      href: "/conductor/audit"
    },
    {
      title: "Bus Check-in QR",
      description: "Printable A4 depot door poster and backup QR codes for this vehicle.",
      icon: QrCode,
      href: "/conductor/bus-qr"
    }
  ];

  const capacity = bus?.capacity || 40;
  const occupancyPercent = Math.min(100, Math.round((boardedCount / (capacity || 1)) * 100));

  return (
    <div className="space-y-6">
      {/* Active Duty Bus & Attendance Status Hero Card */}
      <div className="bg-zinc-950 dark:bg-black rounded-3xl p-5 sm:p-6 border border-zinc-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-inner">
            <BusFront className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-lg sm:text-xl text-white">
                {bus?.busNumber || "Vehicle Standby"}
              </span>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 font-bold border border-zinc-700">
                {bus?.registrationNo || "CAMPUS-FLEET"}
              </span>
              {shift?.name && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {shift.name}
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-medium flex items-center gap-2">
              <span>{route?.name || "Campus Transit Corridor"}</span>
              {tripBookings.length > 0 && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {boardedCount} / {tripBookings.length} Boarded ({occupancyPercent}%)
                  </span>
                </>
              )}
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
