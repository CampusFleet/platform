"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/components/common/LanguageProvider";
import { BusFront, AlertTriangle, QrCode, FileText, LayoutGrid, ShieldCheck, Home, Navigation, ScanFace } from "lucide-react";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import ConductorLiveRadarView from "./ConductorLiveRadarView";
import { useConductorContext } from "./ConductorContext";
import { useAttendancePolicy } from "@/lib/attendance";
import { EmptyState } from "@/components/ui";

/**
 * Conductor shell. The bus/trip comes from the transport manager's assignment; the conductor can
 * only switch between their own trips today (e.g. morning and evening runs).
 */
export default function ConductorLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { duty, currentUser, activeTrip, bus, route, shift, trips, routes, stops, bookings, students, tripBookings, selectedTripId, setSelectedTripId } =
    useConductorContext();
  const { rules: attendanceRules } = useAttendancePolicy();
  const [isRadarOpen, setIsRadarOpen] = useState(false);
  const isManager = ["admin", "transport_admin", "transport_manager"].includes(currentUser?.role);

  const links = [
    { href: "/conductor", label: t("hub"), icon: Home },
    { href: "/conductor/manifest", label: t("manifest"), icon: FileText },
    { href: "/conductor/scanner", label: attendanceRules.conductorScannerRole === "PRIMARY" ? "Pass Scanner" : "Backup Scanner", icon: QrCode },
    { href: "/conductor/seat-map", label: t("seatMap"), icon: LayoutGrid },
    { href: "/conductor/late-requests", label: t("sosHalt"), icon: AlertTriangle },
    { href: "/conductor/audit", label: t("audit"), icon: ShieldCheck },
    ...(attendanceRules.isConductorBusQrActive ? [{ href: "/conductor/bus-qr", label: "Bus QR", icon: QrCode }] : []),
  ];
  const title =
    pathname.includes("/scanner") ? "Pass Scanner"
    : pathname.includes("/manifest") ? "Passenger Manifest"
    : pathname.includes("/seat-map") ? "Live Seat Map"
    : pathname.includes("/late-requests") ? "SOS / Halt Requests"
    : pathname.includes("/audit") ? "Attendance Audit"
    : pathname.includes("/bus-qr") ? "Bus QR"
    : "Conductor Hub";

  const dutyTrips = duty?.trips || [];

  return (
    <div className="min-h-[100dvh] w-full overflow-x-clip bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex flex-col pb-24 md:pb-6">
      <UnifiedAppHeader
        role="conductor"
        portalTitle={title}
        portalSubtitle={bus ? `Bus ${bus.busNumber}${shift ? ` • ${shift.name}` : ""}` : "No trip assigned today"}
        navLinks={links}
        customActions={
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold bg-emerald-950/60 border-emerald-800/80 text-emerald-300">
              <ScanFace className="w-3.5 h-3.5" />
              {attendanceRules.modeLabel}
            </span>
            <Link
              href="/conductor/scanner"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold"
            >
              <QrCode className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Scanner</span>
            </Link>
            {bus && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-gray-900 text-xs font-bold border border-gray-200 dark:border-gray-800 shrink-0">
                <BusFront className="w-3.5 h-3.5 text-blue-500" />
                Bus {bus.busNumber}
              </span>
            )}
          </div>
        }
      />

      {/* Today's trips for this conductor (or all trips for a supervising manager) */}
      {dutyTrips.length > 1 && (
        <div className="w-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-800 px-4 py-2">
          <div className="max-w-6xl mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {dutyTrips.map((dt) => {
              const selected = (selectedTripId || duty?.trip?.id) === dt.id;
              return (
                <button
                  key={dt.id}
                  type="button"
                  onClick={() => setSelectedTripId(dt.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                    selected
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-800"
                  }`}
                >
                  {isManager && <span>Bus {dt.bus.busNumber} ·</span>}
                  <span>{dt.shift?.name || "Trip"}</span>
                  {dt.shift?.startTime && <span className="font-mono text-[10px] opacity-80">{dt.shift.startTime}</span>}
                  {dt.status === "IN_PROGRESS" && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 pb-20 sm:pb-24 min-w-0">
        {!activeTrip ? (
          <EmptyState className="mt-10" icon={<BusFront className="w-6 h-6" />} title="No trip assigned today">
            {duty?.me.staffId || isManager
              ? "The transport manager has not assigned you to a bus for today."
              : "Your login is not linked to a conductor profile yet. Ask the transport office to link it."}
          </EmptyState>
        ) : (
          children
        )}
      </main>

      <MobileBottomNav isPaymentApproved={true} navItems={links} />

      {activeTrip && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-6 right-4 sm:right-6 z-40">
          <button
            type="button"
            onClick={() => setIsRadarOpen(true)}
            className="px-4 py-3 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-2xl border-2 border-white dark:border-slate-900"
          >
            <Navigation className="w-4 h-4" />
            Live Map
          </button>
        </div>
      )}

      {isRadarOpen && activeTrip && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <ConductorLiveRadarView
            initialUser={currentUser}
            activeTrip={activeTrip}
            route={route || null}
            bus={bus || null}
            shift={shift || null}
            allTrips={trips}
            allBuses={bus ? [bus] : []}
            allRoutes={routes}
            allStops={stops}
            bookings={bookings}
            students={students}
            tripBookings={tripBookings}
            shiftDirection={shift?.direction}
            onClose={() => setIsRadarOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
