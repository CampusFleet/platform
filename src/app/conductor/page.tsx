"use client";

import React, { useState } from "react";
import { HubDashboardView, HubModule } from "@/components/common/HubDashboardView";
import { QrCode, FileText, LayoutGrid, ShieldCheck, BusFront, CheckCircle2, AlertTriangle, Bus, RefreshCw } from "lucide-react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { CrewBusSelectorModal } from "@/components/common/CrewBusSelectorModal";

export default function ConductorHubPage() {
  const { 
    currentUser, trips, activeTrip, bus, route, shift, attendanceRecords, 
    tripBookings, boardedCount, pendingCount, haltRequests,
    activeDepartureAlert,
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
      description: activeDepartureAlert 
        ? "🚨 DEPARTURE ALARM ACTIVE • Ringing on outside students' devices."
        : "Live roster with student passport photos, college IDs, and departure alarms.",
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
      <section className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700">
            <Bus className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Bus {bus?.busNumber || "37"}
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700">
                {activeTrip?.status === "IN_PROGRESS" ? "● ON DUTY" : dutyAttendance ? "READY" : "STANDBY"}
              </span>
              {tripBookings.length > 0 && (
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-900">
                  {boardedCount} / {tripBookings.length} Boarded ({occupancyPercent}%)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
              {route?.name || "Lamachaur to GEHU Bhimtal"} {bus?.registrationNo ? `• ${bus.registrationNo}` : "• UK04PA 2354"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <button
            type="button"
            onClick={() => {
              setSelectorTab("SCANNER");
              setIsCrewSelectorOpen(true);
            }}
            className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
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
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95 shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Change Bus</span>
          </button>
        </div>
      </section>

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
