"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/components/common/LanguageProvider";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import {
  BusFront,
  AlertTriangle,
  ArrowRight,
  QrCode,
  FileText,
  LayoutGrid,
  ShieldCheck,
  Home,
} from "lucide-react";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import { CrewBusSelectorModal } from "@/components/common/CrewBusSelectorModal";
import { useConductorContext } from "./ConductorContext";

export default function ConductorLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { currentUser, activeTrip, bus, route, trips, setSelectedTripId, showToast } = useConductorContext();
  const [isCrewSelectorOpen, setIsCrewSelectorOpen] = useState(false);
  const [selectorTab, setSelectorTab] = useState<"CARDS" | "SCANNER">("CARDS");

  const isAuthorizedConductor = currentUser?.role === "conductor" || currentUser?.role === "driver";
  if (currentUser && !isAuthorizedConductor) {
    const role = currentUser.role;
    const isAdmin = role === "admin";
    const isTransportAdmin = role === "transport_admin";
    const isTransportManager = role === "transport_manager";

    const targetPortal = isAdmin
      ? "/admin"
      : isTransportAdmin
      ? "/transport-admin"
      : isTransportManager
      ? "/transport-manager"
      : "/portal";
    const targetLabel = isAdmin
      ? "Return to Admin Operations Center"
      : isTransportAdmin
      ? "Return to Transport Admin Desk"
      : isTransportManager
      ? "Return to Transport Manager Console"
      : "Go to Student Portal";

    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col pb-16 md:pb-6 font-sans">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-gray-800 rounded-3xl p-8 border border-gray-700 shadow-2xl text-center space-y-4 animate-in fade-in">
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black">Access Restricted</h2>
            <p className="text-xs text-gray-300">
              {isAdmin
                ? "Administrators are restricted from the Conductor Console. Please return to the Admin Operations Center."
                : isTransportAdmin
                ? "Transport Admin officers are restricted from the Conductor Console. Please return to the Transport Admin Desk."
                : isTransportManager
                ? "Transport Managers are restricted from the Conductor Console. Please return to the Transport Manager Console."
                : "Ticketing & optical manifest authorization required to access the Conductor Console."}
            </p>
            <div className="pt-2">
              <Link
                href={targetPortal}
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-xs shadow-lg transition-all"
              >
                <span>{targetLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const topLevelLinks = [
    { href: "/conductor", label: t('hub'), icon: Home },
    { href: "/conductor/scanner", label: t('scanner'), icon: QrCode },
    { href: "/conductor/manifest", label: t('manifest'), icon: FileText },
    { href: "/conductor/seat-map", label: t('seatMap'), icon: LayoutGrid },
    { href: "/conductor/late-requests", label: t('sosHalt'), icon: AlertTriangle },
    { href: "/conductor/audit", label: t('audit'), icon: ShieldCheck },
    { href: "/conductor/bus-qr", label: "Bus QR", icon: QrCode },
  ];

  const currentNavLinks = topLevelLinks;
  let currentTitle = "Conductor Hub";

  if (pathname.includes("/scanner")) currentTitle = "Boarding Scanner";
  else if (pathname.includes("/manifest")) currentTitle = "Passenger Manifest";
  else if (pathname.includes("/seat-map")) currentTitle = "Live Seat Map";
  else if (pathname.includes("/late-requests")) currentTitle = "SOS / Halt Requests";
  else if (pathname.includes("/audit")) currentTitle = "Attendance Audit";
  else if (pathname.includes("/bus-qr")) currentTitle = "Bus QR";

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex flex-col pb-24 md:pb-6 font-sans transition-colors duration-200">
      <UnifiedAppHeader
        role="conductor"
        portalTitle={currentTitle}
        portalSubtitle={activeTrip ? `${bus?.busNumber || "Bus"} • ${route?.name || "Corridor"}` : "Conductor Operations"}
        navLinks={currentNavLinks}
        mobilePrimaryAction={{
          label: t('driverHud'),
          href: "/driver",
          subtitle: "Live telemetry",
          icon: BusFront,
        }}
        customActions={
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/driver"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-green-50 dark:bg-green-950/40 hover:bg-green-100 dark:hover:bg-green-900/60 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-xs font-bold transition-all shadow-2xs"
              title={t('driverHud')}
            >
              <BusFront className="w-3.5 h-3.5 text-green-500" />
              <span>{t('driverHud')}</span>
            </Link>

            {/* Quick Bus QR Door Check-in & Bus Card Selector */}
            <button
              type="button"
              onClick={() => {
                setSelectorTab("SCANNER");
                setIsCrewSelectorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold shadow-sm transition-all"
              title="Scan physical QR code on bus door to mark attendance"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Scan Door QR</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectorTab("CARDS");
                setIsCrewSelectorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800 active:scale-95 text-gray-900 dark:text-gray-100 text-xs font-bold border border-gray-200 dark:border-gray-800 shadow-sm transition-all max-w-[190px] truncate"
              title="Choose bus from cards"
            >
              <BusFront className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="truncate">{bus?.busNumber || "Select Bus"}</span>
            </button>
          </div>
        }
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 pb-20 sm:pb-24 min-w-0">
        {children}
      </main>

      <MobileBottomNav isPaymentApproved={true} navItems={currentNavLinks} />

      {/* Crew Bus Selector & QR Attendance Modal */}
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
