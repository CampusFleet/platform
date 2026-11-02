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
  Navigation,
} from "lucide-react";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import { CrewBusSelectorModal } from "@/components/common/CrewBusSelectorModal";
import ConductorLiveRadarView from "./ConductorLiveRadarView";
import { store } from "@/lib/store";
import { useConductorContext } from "./ConductorContext";
import { getBestTripForBus, getTodayIST } from "@/lib/trip-resolver";

export default function ConductorLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const {
    currentUser,
    activeTrip,
    bus,
    route,
    shift,
    trips,
    buses,
    routes,
    shifts,
    stops,
    bookings,
    students,
    tripBookings,
    setSelectedTripId,
    showToast,
    refreshLiveState,
  } = useConductorContext();
  const [isCrewSelectorOpen, setIsCrewSelectorOpen] = useState(false);
  const [selectorTab, setSelectorTab] = useState<"CARDS" | "SCANNER">("CARDS");
  const [isRadarOpen, setIsRadarOpen] = useState(false);

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

  const todayStr = getTodayIST();
  const currentBusTrips = React.useMemo(() => {
    if (!bus?.id) return [];
    return trips
      .filter(t => t.busId === bus.id && (t.tripDate === todayStr || t.status === "IN_PROGRESS"))
      .sort((a, b) => {
        const sA = shifts.find(sh => sh.id === a.shiftId);
        const sB = shifts.find(sh => sh.id === b.shiftId);
        return (sA?.startTime || "").localeCompare(sB?.startTime || "");
      });
  }, [trips, bus?.id, todayStr, shifts]);

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex flex-col pb-24 md:pb-6 font-sans transition-colors duration-200">
      <UnifiedAppHeader
        role="conductor"
        portalTitle={currentTitle}
        portalSubtitle={activeTrip ? `Bus ${bus?.busNumber || "Bus"} • ${shift?.name || route?.name || "Corridor"}` : "Conductor Operations"}
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
              <span className="truncate">{bus?.busNumber ? `Bus ${bus.busNumber}` : "Select Bus"}</span>
            </button>
          </div>
        }
      />

      {/* Dynamic Operational Shift Switcher Bar */}
      {currentBusTrips.length > 1 && (
        <div className="w-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-800 px-4 py-2 sticky top-14 z-30 shadow-xs">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Bus {bus?.busNumber} Today&apos;s Shifts:</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {currentBusTrips.map(t => {
                const s = shifts.find(sh => sh.id === t.shiftId);
                const isSelected = activeTrip?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTripId(t.id);
                      showToast(`✓ Shift active: ${s?.name || t.tripCode}`);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-black"
                        : "bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-800"
                    }`}
                  >
                    <span>{s?.name || t.tripCode}</span>
                    {s?.startTime && (
                      <span className={`text-[10px] font-mono px-1 py-0.5 rounded-md ${
                        isSelected ? "bg-white/20 text-white font-bold" : "bg-black/5 dark:bg-white/5 text-gray-400"
                      }`}>
                        {s.startTime}
                      </span>
                    )}
                    {t.status === "IN_PROGRESS" && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
            const best = getBestTripForBus(busId, trips, shifts);
            if (best) {
              setSelectedTripId(best.id);
            } else {
              const match = trips.find(t => t.busId === busId && t.status !== "COMPLETED") || trips.find(t => t.busId === busId);
              if (match) setSelectedTripId(match.id);
            }
          }
          showToast("✓ Conductor duty active! Bus claimed and attendance recorded.");
        }}
      />

      {/* ── FLOATING LIVE MAP RADAR TRIGGER BUTTON (CONDUCTOR CONSOLE) ──── */}
      <div className="fixed bottom-6 right-4 sm:right-6 z-40">
        <button
          type="button"
          onClick={() => setIsRadarOpen(true)}
          className="px-4 sm:px-5 py-3 sm:py-3.5 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center gap-2.5 shadow-2xl shadow-blue-600/40 border-2 border-white dark:border-slate-900 transition-all cursor-pointer group"
          title="Open Live Radar Navigation Map"
          aria-label="Open Live Radar Navigation Map"
        >
          <div className="relative flex items-center justify-center">
            <Navigation className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-white/20 transition-transform group-hover:rotate-45 duration-300" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <span className="tracking-tight">Live Map Radar</span>
        </button>
      </div>

      {/* ── FULLSCREEN LIVE RADAR NAVIGATION MODAL OVERLAY (CONDUCTOR MODE) ── */}
      {isRadarOpen && (
        <div className="fixed inset-0 z-50 bg-black animate-in fade-in duration-200 flex flex-col">
          <ConductorLiveRadarView
            initialUser={currentUser}
            activeTrip={activeTrip || null}
            route={route || null}
            bus={bus || null}
            shift={shift || null}
            allTrips={trips}
            allBuses={buses}
            allRoutes={routes}
            allStops={stops}
            bookings={bookings}
            students={students}
            tripBookings={tripBookings}
            shiftDirection={shift?.direction}
            onClose={() => setIsRadarOpen(false)}
            onTripUpdate={async (tripId, updates) => {
              await store.updateTrip(tripId, updates);
              if (refreshLiveState) await refreshLiveState();
            }}
          />
        </div>
      )}
    </div>
  );
}
