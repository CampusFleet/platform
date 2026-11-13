"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Bus as BusIcon, Hand, LocateFixed, MapPin, Phone, Route as RouteIcon } from "lucide-react";
import type { Route, Stop } from "@/lib/types";
import type { CommuterCorridorMapHandle } from "@/components/maps/CommuterCorridorMap";
import type { PublicRide, RideLive } from "@/lib/students/ride";
import { Badge, Button, Card, EmptyState, cn } from "@/components/ui";
import { calculateHaversineDistanceKm } from "@/lib/eta-calculator";

const CommuterCorridorMap = dynamic(() => import("@/components/maps/CommuterCorridorMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 dark:bg-zinc-900 animate-pulse" />,
});

/**
 * Student live radar. Shows only the student's own ride (from /api/students/ride, rendered by the
 * server page) and refreshes one small status call (/api/students/ride/live) every 5 s while the tab
 * is visible. No trip ids, no other buses or staff.
 */

const POLL_MS = 5000;
const STALE_SECONDS = 180;
const FALLBACK_KMH = 22; // used for "about N min" when the bus is moving slowly or stopped

function statusBadge(live: RideLive | null) {
  if (!live) return <Badge>Loading</Badge>;
  if (live.status === "COMPLETED") return <Badge>Trip ended</Badge>;
  if (live.status === "CANCELLED") return <Badge tone="red">Cancelled</Badge>;
  if (live.bus && live.bus.ageSeconds <= STALE_SECONDS) return <Badge tone="green" dot>Live</Badge>;
  if (live.status === "IN_PROGRESS") return <Badge tone="amber" dot>Bus GPS offline</Badge>;
  return <Badge tone="blue">Not started</Badge>;
}

export default function FullScreenLiveRadarView({ initialRide }: { initialRide: PublicRide }) {
  const ride = initialRide;
  const mapRef = useRef<CommuterCorridorMapHandle>(null);
  const [live, setLive] = useState<RideLive | null>(null);
  const [haltBusy, setHaltBusy] = useState(false);
  const [haltError, setHaltError] = useState<string | null>(null);

  // One status call, paused while the tab is hidden.
  useEffect(() => {
    if (!ride.hasRide) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch("/api/students/ride/live", { cache: "no-store" });
          const d = await r.json();
          if (alive && d.success) setLive(d.live);
        } catch {
          /* keep last value */
        }
      }
      if (alive) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ride.hasRide]);

  const stops = useMemo(() => [...ride.stops].sort((a, b) => a.order - b.order), [ride.stops]);
  const myStop = stops.find((s) => s.id === ride.myStopId) || null;

  // Shapes the map component expects.
  const mapStops = useMemo(
    () => stops.map((s) => ({ id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude } as unknown as Stop)),
    [stops]
  );
  const mapRoute = useMemo(
    () =>
      ride.hasRide
        ? ({
            id: `ride-${ride.busId ?? "x"}`,
            name: ride.routeName || "Route",
            color: ride.routeColor || "#10B981",
            stops: mapStops.map((s, i) => ({ stopId: s.id, stopOrder: stops[i].order, stop: s })),
          } as unknown as Route)
        : null,
    [ride.hasRide, ride.busId, ride.routeName, ride.routeColor, mapStops, stops]
  );
  const mapMyStop = mapStops.find((s) => s.id === ride.myStopId) || null;

  const busLive = live?.bus && live.bus.ageSeconds <= STALE_SECONDS ? live.bus : null;
  const passedIndex = live?.currentStopIndex ?? -1;
  const myIndex = myStop ? stops.indexOf(myStop) : -1;

  const eta = useMemo(() => {
    if (!busLive || !myStop || live?.boarded || (myIndex >= 0 && passedIndex > myIndex)) return null;
    const km = calculateHaversineDistanceKm(busLive.latitude, busLive.longitude, myStop.latitude, myStop.longitude);
    const kmh = busLive.speedKmh > 8 ? busLive.speedKmh : FALLBACK_KMH;
    return { km, mins: Math.max(1, Math.round((km / kmh) * 60)) };
  }, [busLive, myStop, live?.boarded, myIndex, passedIndex]);

  const canAskToWait =
    ride.hasRide && live && !live.boarded && ["SCHEDULED", "IN_PROGRESS", "DELAYED"].includes(live.status) && (!live.halt || live.halt.status === "REJECTED");

  const askToWait = useCallback(() => {
    setHaltError(null);
    if (!navigator.geolocation) {
      setHaltError("Location is needed so the crew can see where you are.");
      return;
    }
    setHaltBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch("/api/students/ride/halt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.success) throw new Error(d.error || "Could not send the request.");
          setLive((l) => (l ? { ...l, halt: d.halt } : l));
        } catch (e) {
          setHaltError((e as Error).message);
        } finally {
          setHaltBusy(false);
        }
      },
      () => {
        setHaltBusy(false);
        setHaltError("Allow location access so the crew can see where you are.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  if (!ride.hasRide) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-gray-50 dark:bg-black">
        <TopBar title="Live bus" badge={null} />
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={<BusIcon className="w-8 h-8" />}
            title="No bus for you today"
            action={<Link href="/portal" className="text-sm font-bold text-blue-600">Go to My Commute</Link>}
          >
            Your bus appears here once you have a seat on today&apos;s boarding chart.
          </EmptyState>
        </div>
      </div>
    );
  }

  const haltText =
    live?.halt?.status === "PENDING" ? "Waiting for the crew to reply…" : live?.halt?.status === "APPROVED" ? "The crew will wait for you. Please hurry." : live?.halt?.status === "COMPLETED" ? "Wait request closed." : null;

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-50 dark:bg-black overflow-hidden">
      <TopBar title={ride.busNumber ? `Bus ${ride.busNumber}` : "Your bus"} badge={statusBadge(live)} />

      <div className="relative flex-1 min-h-[220px]">
        <CommuterCorridorMap
          ref={mapRef}
          homeCoords={ride.home}
          assignedStop={mapMyStop}
          assignedRoute={mapRoute}
          allStops={mapStops}
          busLocation={busLive ? { busId: ride.busId, ...busLive } : null}
          busName={ride.busNumber ? `Bus ${ride.busNumber}` : "Bus"}
          isTelematicsLive={Boolean(busLive)}
          height="100%"
          className="absolute inset-0"
          hideInlineControls
        />
        <div className="absolute right-3 bottom-3 flex flex-col gap-2 z-[500]">
          <MapButton label="Show bus" onClick={() => mapRef.current?.recenterOnBus()} disabled={!busLive}><BusIcon className="w-5 h-5" /></MapButton>
          <MapButton label="Show my stop" onClick={() => mapRef.current?.recenterOnStop(mapMyStop)} disabled={!mapMyStop}><MapPin className="w-5 h-5" /></MapButton>
          <MapButton label="Show me" onClick={() => mapRef.current?.recenterOnGps()}><LocateFixed className="w-5 h-5" /></MapButton>
          <MapButton label="Whole route" onClick={() => mapRef.current?.fitCorridorBounds()}><RouteIcon className="w-5 h-5" /></MapButton>
        </div>
      </div>

      <div className="max-h-[48dvh] overflow-y-auto bg-white dark:bg-zinc-950 border-t border-gray-200 dark:border-zinc-800 rounded-t-3xl -mt-4 relative z-[600] pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-700 mx-auto mt-2" aria-hidden />
        <div className="px-4 pt-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black truncate">{ride.shiftName || "Today's ride"}{ride.departureTime ? ` · ${ride.departureTime}` : ""}</p>
              <p className="text-xs text-gray-500 truncate">{ride.routeName || "Route not set"}</p>
            </div>
            <div className="text-right shrink-0">
              {live?.boarded ? (
                <Badge tone="green">On board</Badge>
              ) : eta ? (
                <>
                  <p className="text-lg font-black leading-none">~{eta.mins} min</p>
                  <p className="text-[11px] text-gray-500">to your stop</p>
                </>
              ) : null}
              {live && live.delayMinutes > 0 && <p className="text-[11px] font-bold text-amber-600">{live.delayMinutes} min late</p>}
            </div>
          </div>

          {myStop && !live?.boarded && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Your stop: <strong>{myStop.name}</strong>
              {myStop.plannedTime ? ` · planned ${myStop.plannedTime}` : ""}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {canAskToWait && (
              <Button size="sm" variant="secondary" onClick={askToWait} loading={haltBusy}>
                <Hand className="w-4 h-4" /> Ask bus to wait
              </Button>
            )}
            {ride.conductor?.phone && (
              <a href={`tel:${ride.conductor.phone}`} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700">
                <Phone className="w-4 h-4" /> Call conductor
              </a>
            )}
          </div>
          {haltText && <p className="text-xs font-semibold text-blue-700 dark:text-blue-300" role="status">{haltText}</p>}
          {live?.halt?.status === "REJECTED" && <p className="text-xs font-semibold text-rose-600">The crew could not wait this time.</p>}
          {haltError && <p className="text-xs font-semibold text-rose-600" role="alert">{haltError}</p>}

          <Card className="p-3 sm:p-3">
            <ol className="space-y-0">
              {stops.map((s, i) => {
                const passed = i <= passedIndex && live?.status === "IN_PROGRESS";
                const next = i === passedIndex + 1 && live?.status === "IN_PROGRESS";
                const mine = s.id === ride.myStopId;
                return (
                  <li key={s.id} className="flex items-center gap-3 py-1.5 min-w-0">
                    <span
                      className={cn(
                        "w-3 h-3 rounded-full border-2 shrink-0",
                        passed ? "bg-gray-300 border-gray-300 dark:bg-zinc-700 dark:border-zinc-700" : next ? "bg-emerald-500 border-emerald-500 animate-pulse" : "border-gray-400",
                        mine && !passed && "border-blue-600 bg-blue-600"
                      )}
                    />
                    <button type="button" onClick={() => mapRef.current?.recenterOnStop(mapStops[i])} className={cn("flex-1 min-w-0 text-left text-sm truncate", passed && "text-gray-400", mine && "font-black")}>
                      {s.name}
                      {mine ? " (your stop)" : ""}
                    </button>
                    <span className="text-xs text-gray-500 shrink-0">{s.plannedTime || ""}</span>
                  </li>
                );
              })}
              {stops.length === 0 && <li className="text-sm text-gray-500">Stops for this route are not set yet.</li>}
            </ol>
          </Card>
          <p className="text-[11px] text-gray-400">Times are planned times. Arrival estimates use straight-line distance and the bus&apos;s current speed.</p>
        </div>
      </div>
    </div>
  );
}

function TopBar({ title, badge }: { title: string; badge: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 bg-white/95 dark:bg-zinc-950/95 border-b border-gray-200 dark:border-zinc-800 z-[700]">
      <Link href="/portal" aria-label="Back" className="p-2 -ml-1 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <h1 className="flex-1 min-w-0 text-base font-black truncate">{title}</h1>
      {badge}
    </div>
  );
}

function MapButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="w-11 h-11 rounded-full bg-white dark:bg-zinc-900 shadow-lg border border-gray-200 dark:border-zinc-700 flex items-center justify-center disabled:opacity-40"
    >
      {children}
    </button>
  );
}
