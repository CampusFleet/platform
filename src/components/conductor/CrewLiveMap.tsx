"use client";

import React, { useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { BusFront, Route as RouteIcon, X } from "lucide-react";
import type { Route, Stop } from "@/lib/types";
import type { CommuterCorridorMapHandle } from "@/components/maps/CommuterCorridorMap";
import type { CrewDuty } from "@/lib/crew/duty";
import { MapBoundary } from "@/components/maps/MapBoundary";
import { Badge, cn } from "@/components/ui";

const CommuterCorridorMap = dynamic(() => import("@/components/maps/CommuterCorridorMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-zinc-900 animate-pulse" />,
});

/**
 * Conductor live map: the current run's route, the bus (from the duty poll's busLocation) and, per
 * stop, how many riders are still to board there. Read-only; the driver moves the trip along.
 */
export function CrewLiveMap({ duty, onClose }: { duty: CrewDuty; onClose: () => void }) {
  const trip = duty.trip!;
  const mapRef = useRef<CommuterCorridorMapHandle>(null);
  const stops = useMemo(() => [...(trip.route?.stops || [])].sort((a, b) => a.order - b.order), [trip.route]);

  const mapStops = useMemo(() => stops.map((s) => ({ id: s.stopId, name: s.name, latitude: s.latitude, longitude: s.longitude } as unknown as Stop)), [stops]);
  const mapRoute = useMemo(
    () =>
      trip.route
        ? ({ id: trip.route.id, name: trip.route.name, color: "#2563EB", stops: mapStops.map((s, i) => ({ stopId: s.id, stopOrder: stops[i].order, stop: s })) } as unknown as Route)
        : null,
    [trip.route, mapStops, stops]
  );

  const counts = useMemo(() => {
    const m = new Map<string, { waiting: number; onBoard: number }>();
    for (const p of duty.manifest) {
      const c = m.get(p.boardingStopId) || { waiting: 0, onBoard: 0 };
      if (p.status === "BOARDED") c.onBoard++;
      else if (p.status === "ASSIGNED" || p.status === "SEAT_SELECTED") c.waiting++;
      m.set(p.boardingStopId, c);
    }
    return m;
  }, [duty.manifest]);

  const bus = duty.busLocation;
  const idx = trip.currentStopIndex ?? 0;
  const running = trip.status === "IN_PROGRESS";

  return (
    <div className="h-[100dvh] flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 border-b border-zinc-800">
        <button type="button" onClick={onClose} aria-label="Close map" className="p-2 -ml-1 rounded-xl hover:bg-zinc-800">
          <X className="w-5 h-5" />
        </button>
        <h2 className="flex-1 min-w-0 text-base font-black truncate">
          Bus {trip.bus.busNumber}
          {trip.shift ? ` · ${trip.shift.name}` : ""}
        </h2>
        {bus ? <Badge tone="green" dot>GPS live</Badge> : <Badge tone="amber">No GPS</Badge>}
      </div>

      <div className="relative flex-1 min-h-[200px]">
        <MapBoundary where="crew-map">
          <CommuterCorridorMap
            ref={mapRef}
            assignedRoute={mapRoute}
            allStops={mapStops}
            busLocation={bus ? { busId: trip.bus.id, latitude: bus.latitude, longitude: bus.longitude } : null}
            busName={`Bus ${trip.bus.busNumber}`}
            isTelematicsLive={Boolean(bus)}
            height="100%"
            className="absolute inset-0"
            hideInlineControls
          />
        </MapBoundary>
        <div className="absolute right-3 bottom-3 flex flex-col gap-2 z-[500]">
          <button type="button" aria-label="Show bus" disabled={!bus} onClick={() => mapRef.current?.recenterOnBus()} className="w-11 h-11 rounded-full bg-white text-zinc-900 shadow-lg flex items-center justify-center disabled:opacity-40">
            <BusFront className="w-5 h-5" />
          </button>
          <button type="button" aria-label="Whole route" onClick={() => mapRef.current?.fitCorridorBounds()} className="w-11 h-11 rounded-full bg-white text-zinc-900 shadow-lg flex items-center justify-center">
            <RouteIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <ol className="max-h-[42dvh] overflow-y-auto bg-zinc-950 border-t border-zinc-800 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] space-y-1">
        {stops.map((s, i) => {
          const c = counts.get(s.stopId) || { waiting: 0, onBoard: 0 };
          const passed = running && i < idx;
          const next = running && i === idx;
          return (
            <li key={s.stopId}>
              <button type="button" onClick={() => mapRef.current?.recenterOnStop(mapStops[i])} className="w-full flex items-center gap-3 py-1.5 text-left min-w-0">
                <span className={cn("w-3 h-3 rounded-full border-2 shrink-0", passed ? "bg-zinc-700 border-zinc-700" : next ? "bg-emerald-500 border-emerald-500 animate-pulse" : "border-zinc-500")} />
                <span className={cn("flex-1 min-w-0 truncate text-sm", passed && "text-zinc-500", next && "font-black")}>{s.name}</span>
                {c.waiting > 0 && <Badge tone="amber">{c.waiting} to board</Badge>}
                {c.onBoard > 0 && <Badge tone="green">{c.onBoard} on</Badge>}
              </button>
            </li>
          );
        })}
        {stops.length === 0 && <li className="text-sm text-zinc-500">This route has no stops set.</li>}
      </ol>
    </div>
  );
}
