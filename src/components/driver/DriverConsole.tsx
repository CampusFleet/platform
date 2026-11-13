"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BusFront, CheckCircle2, Clock, MapPin, Navigation, Play, Radio, ShieldAlert, Square, Wrench } from "lucide-react";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import { DriverGateCameraConsole } from "@/components/driver/DriverGateCameraConsole";
import { telematicsService } from "@/lib/telematicsService";
import { useAttendancePolicy } from "@/lib/attendance";
import type { CrewDuty, DutyTrip } from "@/lib/crew/duty";
import { EmptyState, Sheet } from "@/components/ui";

/**
 * Driver console. The trip (and so the bus) is whatever the transport manager assigned today;
 * the driver cannot pick a bus. Trip state goes through /api/crew/trip, GPS through
 * /api/telematics/live, incidents through /api/crew/sos.
 */

const ARRIVE_METERS = 150;

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

type Fix = { latitude: number; longitude: number; speedKmh: number; headingDeg: number; accuracy: number };

export default function DriverConsole({ initialUser, initialDuty }: { initialUser: any; initialDuty: CrewDuty | null }) {
  const [duty, setDuty] = useState<CrewDuty | null>(initialDuty);
  const [selectedTripId, setSelectedTripId] = useState(initialDuty?.trip?.id || "");
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const { locks } = useAttendancePolicy();
  const selectedRef = useRef(selectedTripId);
  const autoAdvancedRef = useRef<string | null>(null);

  const trip: DutyTrip | null = duty?.trip || null;
  const stops = trip?.route?.stops || [];
  const idx = Math.min(trip?.currentStopIndex || 0, Math.max(0, stops.length - 1));
  const nextStop = stops[idx];
  const running = trip?.status === "IN_PROGRESS";

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(async () => {
    try {
      const q = selectedRef.current ? `?tripId=${encodeURIComponent(selectedRef.current)}` : "";
      const res = await fetch(`/api/crew/duty${q}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) setDuty(data);
    } catch {}
  }, []);

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refresh();
    const t = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const tripAction = useCallback(
    async (action: "START" | "SET_STOP" | "END", stopIndex?: number) => {
      if (!trip) return false;
      setBusy(true);
      try {
        const res = await fetch("/api/crew/trip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId: trip.id, action, stopIndex }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          say(data.error || "Could not update the trip.");
          return false;
        }
        await refresh();
        return true;
      } catch {
        say("Network error. Try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [trip, refresh]
  );

  // GPS: watch while the page is open; broadcast only while the trip is running.
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("This device has no GPS.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        setFix({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          speedKmh: pos.coords.speed != null && pos.coords.speed >= 0 ? Math.round(pos.coords.speed * 3.6) : 0,
          headingDeg: pos.coords.heading != null && !isNaN(pos.coords.heading) ? Math.round(pos.coords.heading) : 0,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => setGpsError(err.code === err.PERMISSION_DENIED ? "Location permission is off. Allow it to share the bus position." : "Searching for GPS…"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!running || !fix || !trip) return;
    void telematicsService.broadcastLiveLocation({
      busId: trip.bus.id,
      busNumber: trip.bus.busNumber,
      tripId: trip.id,
      driverName: duty?.me.name,
      latitude: fix.latitude,
      longitude: fix.longitude,
      speedKmh: fix.speedKmh,
      headingDeg: fix.headingDeg,
      accuracy: fix.accuracy,
      currentStopId: stops[Math.max(0, idx - 1)]?.stopId,
      nextStopId: nextStop?.stopId,
      estimatedArrivalNextStopMins: 0,
      delayMinutes: 0,
      lastPingAt: new Date().toISOString(),
      source: "driver_gps",
    });
  }, [fix, running, trip, idx, nextStop?.stopId, stops, duty?.me.name]);

  // Arriving within 150 m of the next stop moves the trip on (once per stop).
  const distToNext = fix && nextStop ? distanceMeters(fix, nextStop) : null;
  useEffect(() => {
    if (!running || distToNext === null || distToNext > ARRIVE_METERS || !nextStop) return;
    if (autoAdvancedRef.current === nextStop.stopId || idx >= stops.length - 1) return;
    autoAdvancedRef.current = nextStop.stopId;
    say(`Arrived at ${nextStop.name}`);
    void tripAction("SET_STOP", idx + 1);
  }, [distToNext, running, nextStop, idx, stops.length, tripAction]);

  const pickTrip = (id: string) => {
    selectedRef.current = id;
    setSelectedTripId(id);
    void refresh();
  };

  const sendSos = async (type: "BREAKDOWN" | "TRAFFIC" | "MEDICAL") => {
    if (!trip) return;
    try {
      const res = await fetch("/api/crew/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: trip.id, type, ...(fix ? { latitude: fix.latitude, longitude: fix.longitude } : {}) }),
      });
      const data = await res.json();
      say(res.ok && data.success ? "🚨 Reported to the transport office." : data.error || "Could not send the report.");
    } catch {
      say("Network error. The report was not sent.");
    }
    setSosOpen(false);
  };

  const navItems = useMemo(
    () => [
      { id: "hud", href: "/driver", label: "Drive", icon: BusFront, highlight: true },
      { id: "settings", href: "/driver/settings", label: "Settings", icon: MapPin },
    ],
    []
  );

  const mapsHref = nextStop ? `https://www.google.com/maps/dir/?api=1&destination=${nextStop.latitude},${nextStop.longitude}&travelmode=driving` : null;

  return (
    <div className="min-h-[100dvh] w-full overflow-x-clip bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-28">
      <UnifiedAppHeader role="driver" portalTitle="Driver" portalSubtitle={trip ? `Bus ${trip.bus.busNumber}${trip.shift ? ` • ${trip.shift.name}` : ""}` : "No trip assigned today"} />

      {toast && (
        <div className="fixed top-[calc(env(safe-area-inset-top)+4.5rem)] inset-x-0 z-[100] flex justify-center px-4 pointer-events-none">
          <div className="max-w-sm w-full p-3.5 bg-slate-900/95 text-white rounded-2xl text-sm font-bold text-center shadow-2xl">{toast}</div>
        </div>
      )}

      <main className="max-w-3xl mx-auto p-4 space-y-4 min-w-0">
        {!trip ? (
          <EmptyState className="mt-6" icon={<BusFront className="w-6 h-6" />} title="No trip assigned today">
            {duty?.me.staffId
              ? "The transport manager has not assigned you to a bus for today."
              : "Your login is not linked to a driver profile yet. Ask the transport office to link it."}
          </EmptyState>
        ) : (
          <>
            {(duty?.trips.length || 0) > 1 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {duty!.trips.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTrip(t.id)}
                    className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold ${
                      t.id === trip.id ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    {t.shift?.name || "Trip"} {t.shift?.startTime && <span className="font-mono opacity-80">{t.shift.startTime}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Trip card */}
            <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-14 h-14 shrink-0 rounded-2xl bg-blue-600 text-white flex flex-col items-center justify-center leading-none">
                  <span className="text-[10px] font-bold opacity-80">BUS</span>
                  <span className="text-xl font-black">{trip.bus.busNumber}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-lg truncate">{trip.route?.name || "Route"}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {[trip.shift?.name, trip.shift?.startTime && `${trip.shift.startTime}–${trip.shift.endTime}`, trip.bus.registrationNo].filter(Boolean).join(" • ")}
                  </div>
                  {trip.conductorName && <div className="text-xs text-slate-500 truncate">Conductor: {trip.conductorName}</div>}
                </div>
                <span
                  className={`shrink-0 text-[11px] font-black px-2.5 py-1 rounded-full ${
                    running ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : trip.status === "COMPLETED" ? "bg-slate-200 dark:bg-slate-800" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {running ? "ON ROUTE" : trip.status === "COMPLETED" ? "DONE" : "NOT STARTED"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 min-w-0">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Speed</div>
                  <div className="text-xl font-black">{fix?.speedKmh ?? 0}<span className="text-xs font-bold"> km/h</span></div>
                </div>
                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 min-w-0">
                  <div className="text-[10px] font-bold uppercase text-slate-500">On board</div>
                  <div className="text-xl font-black">{duty?.manifest.filter((p) => p.status === "BOARDED").length ?? 0}<span className="text-xs font-bold">/{trip.bus.capacity}</span></div>
                </div>
                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 min-w-0">
                  <div className="text-[10px] font-bold uppercase text-slate-500">GPS</div>
                  <div className={`text-sm font-black mt-1 truncate ${fix ? "text-emerald-600" : "text-amber-600"}`}>{fix ? `±${fix.accuracy} m` : "No fix"}</div>
                </div>
              </div>
              {gpsError && <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{gpsError}</p>}

              {trip.status === "COMPLETED" ? (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-sm font-bold">
                  <CheckCircle2 className="w-5 h-5" /> Trip completed
                </div>
              ) : !running ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => (await tripAction("START")) && say(`Trip started. Sharing Bus ${trip.bus.busNumber} location.`)}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-base flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" /> Start trip
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {mapsHref ? (
                    <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="py-3.5 rounded-2xl bg-blue-600 text-white font-black text-sm flex items-center justify-center gap-2">
                      <Navigation className="w-4 h-4" /> Navigate
                    </a>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => confirm("Finish this trip and stop sharing location?") && tripAction("END").then((ok) => ok && say("Trip completed."))}
                    className="py-3.5 rounded-2xl bg-slate-900 dark:bg-slate-700 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Square className="w-4 h-4" /> End trip
                  </button>
                </div>
              )}
            </section>

            {/* Stops */}
            {stops.length > 0 && (
              <section className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-black mb-2 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" /> Stops
                </h3>
                <ol className="space-y-1">
                  {stops.map((s, i) => {
                    const done = running && i < idx;
                    const current = running && i === idx;
                    const pickups = duty?.manifest.filter((p) => p.boardingStopId === s.stopId && p.status !== "ABSENT").length || 0;
                    return (
                      <li key={s.stopId} className={`flex items-center gap-3 p-2 rounded-xl ${current ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}>
                        <span
                          className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black ${
                            done ? "bg-emerald-600 text-white" : current ? "bg-blue-600 text-white" : "bg-slate-200 dark:bg-slate-800"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                        </span>
                        <span className={`flex-1 min-w-0 text-sm truncate ${done ? "text-slate-400 line-through" : "font-semibold"}`}>{s.name}</span>
                        {current && distToNext !== null && <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-300 shrink-0">{distToNext > 999 ? `${(distToNext / 1000).toFixed(1)} km` : `${distToNext} m`}</span>}
                        {pickups > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0">{pickups}</span>}
                        {current && i < stops.length - 1 && (
                          <button type="button" disabled={busy} onClick={() => tripAction("SET_STOP", i + 1)} className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-600 text-white disabled:opacity-50">
                            Arrived
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {/* Door camera (Face ID boarding) */}
            {locks.faceId && (
              <DriverGateCameraConsole
                busId={trip.bus.id}
                busNumber={String(trip.bus.busNumber)}
                tripId={trip.id}
                capacity={trip.bus.capacity}
                currentStopName={nextStop?.name || ""}
                latitude={fix?.latitude ?? stops[0]?.latitude ?? 0}
                longitude={fix?.longitude ?? stops[0]?.longitude ?? 0}
              />
            )}

            <button
              type="button"
              onClick={() => setSosOpen(true)}
              className="w-full py-3.5 rounded-2xl border-2 border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-black text-sm flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" /> Report a problem
            </button>
          </>
        )}
      </main>

      <Sheet open={sosOpen} onClose={() => setSosOpen(false)} title="Report to the transport office">
          <div className="space-y-3 pb-[env(safe-area-inset-bottom)]">
            <p className="text-xs text-slate-500">Your bus and current location are sent with the report.</p>
            {[
              { type: "BREAKDOWN" as const, label: "Bus breakdown", icon: Wrench },
              { type: "TRAFFIC" as const, label: "Traffic jam / road blocked", icon: Clock },
              { type: "MEDICAL" as const, label: "Medical emergency / accident", icon: ShieldAlert },
            ].map(({ type, label, icon: Icon }) => (
              <button key={type} type="button" onClick={() => sendSos(type)} className="w-full p-3.5 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 font-bold text-sm flex items-center gap-2 text-left">
                <Icon className="w-4 h-4 shrink-0" /> {label}
              </button>
            ))}
          </div>
      </Sheet>

      <MobileBottomNav navItems={navItems as any} />
      {running && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-6 left-4 z-40 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-emerald-600 text-white text-xs font-black shadow-xl">
          <Radio className="w-3.5 h-3.5 animate-pulse" /> Sharing location
        </div>
      )}
    </div>
  );
}
