"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BusFront, RefreshCw } from "lucide-react";
import type { FleetBusMarkerData } from "@/lib/types";
import type { FleetRun } from "@/lib/manager/fleet-live";
import type { CrewDuty } from "@/lib/crew/duty";
import { MapBoundary } from "@/components/maps/MapBoundary";
import { CrewLiveMap } from "@/components/conductor/CrewLiveMap";
import { Badge, Button, Card, EmptyState, Segmented, cn } from "@/components/ui";

const CampusFleetMap = dynamic(() => import("@/components/maps/CampusFleetMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 dark:bg-zinc-900 animate-pulse" />,
});

/**
 * Transport manager → Live fleet. Every run today from /api/transport-manager/fleet-live
 * (refreshed every 10 s while visible): map of buses with GPS, and a list of runs.
 * Tapping a run opens its live map with the passenger counts (/api/crew/duty?tripId=…).
 */

const POLL_MS = 10_000;
type Filter = "ALL" | "IN_PROGRESS" | "SCHEDULED" | "COMPLETED";

function statusTone(s: string) {
  return s === "IN_PROGRESS" ? "green" : s === "COMPLETED" ? "neutral" : s === "DELAYED" ? "amber" : "blue";
}

export default function LiveFleetTelematicsView({ initialRuns }: { initialRuns: FleetRun[] }) {
  const [runs, setRuns] = useState(initialRuns);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<CrewDuty | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/transport-manager/fleet-live", { cache: "no-store" });
      const d = await r.json();
      if (d.success) setRuns(d.runs);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // While a run is open, keep its passenger counts and GPS fresh.
  const openTripId = open?.trip?.id;
  useEffect(() => {
    if (!openTripId) return;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch(`/api/crew/duty?tripId=${encodeURIComponent(openTripId)}`, { cache: "no-store" }).catch(() => null);
      const d = await r?.json().catch(() => null);
      if (d?.success && d.trip) setOpen(d as CrewDuty);
    }, 8000);
    return () => clearInterval(id);
  }, [openTripId]);

  const openRun = async (tripId: string) => {
    setOpening(tripId);
    try {
      const r = await fetch(`/api/crew/duty?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" });
      const d = await r.json();
      if (d.success && d.trip) setOpen(d as CrewDuty);
    } finally {
      setOpening(null);
    }
  };

  const shown = runs.filter((r) => filter === "ALL" || r.status === filter || (filter === "SCHEDULED" && r.status === "DELAYED"));
  const markers: FleetBusMarkerData[] = useMemo(
    () =>
      runs
        .filter((r) => r.bus && r.gps && r.gps.ageSeconds <= 300)
        // one marker per bus: its running run, else any
        .sort((a, b) => (a.status === "IN_PROGRESS" ? -1 : 0) - (b.status === "IN_PROGRESS" ? -1 : 0))
        .filter((r, i, arr) => arr.findIndex((x) => x.bus!.id === r.bus!.id) === i)
        .map((r) => ({
          busId: r.bus!.id,
          busNumber: Number(r.bus!.number) || 0,
          shortLabel: `Bus ${r.bus!.number ?? ""}`,
          registrationNo: r.bus!.registrationNo || "",
          routeName: r.routeName || undefined,
          tripStatus: r.status,
          latitude: r.gps!.latitude,
          longitude: r.gps!.longitude,
          speedKmh: r.gps!.speedKmh,
          headingDeg: r.gps!.headingDeg,
          state: r.status === "IN_PROGRESS" ? "IN_TRANSIT" : "STANDBY_STARTING_POINT",
        })) as FleetBusMarkerData[],
    [runs]
  );
  const count = (s: Filter) => (s === "ALL" ? runs.length : runs.filter((r) => r.status === s || (s === "SCHEDULED" && r.status === "DELAYED")).length);

  if (open) {
    return (
      <div className="fixed inset-0 z-50">
        <CrewLiveMap duty={open} onClose={() => setOpen(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black">Live fleet</h1>
          <p className="text-xs text-gray-500">{markers.length} of {new Set(runs.map((r) => r.bus?.id).filter(Boolean)).size} buses sending GPS</p>
        </div>
        <Button size="sm" variant="secondary" onClick={refresh} loading={loading}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      <div className="h-[45dvh] min-h-[260px] rounded-2xl overflow-hidden border border-gray-200 dark:border-zinc-800">
        <MapBoundary where="fleet">
          <CampusFleetMap
            fleetBuses={markers}
            routeCoordinates={[]}
            stops={[]}
            height="100%"
            zoom={12}
            showUserLocation={false}
            showCampusLandmark
            onBusClick={(m) => {
              const run = runs.find((r) => r.bus?.id === m.busId && r.status === "IN_PROGRESS") || runs.find((r) => r.bus?.id === m.busId);
              if (run) void openRun(run.tripId);
            }}
          />
        </MapBoundary>
      </div>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "ALL", label: `All (${count("ALL")})` },
          { value: "IN_PROGRESS", label: `Running (${count("IN_PROGRESS")})` },
          { value: "SCHEDULED", label: `Not started (${count("SCHEDULED")})` },
          { value: "COMPLETED", label: `Done (${count("COMPLETED")})` },
        ]}
      />

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={<BusFront className="w-8 h-8" />} title="No runs">Today&apos;s trips appear here after the nightly rollover.</EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map((r) => (
            <button
              key={r.tripId}
              type="button"
              onClick={() => void openRun(r.tripId)}
              className="text-left p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 hover:border-blue-500 min-w-0 space-y-2"
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-base font-black truncate">{r.bus ? `Bus ${r.bus.number}` : "No bus assigned"}</span>
                <Badge tone={statusTone(r.status) as any}>{r.status === "IN_PROGRESS" ? "Running" : r.status.toLowerCase().replace("_", " ")}</Badge>
              </div>
              <p className="text-xs text-gray-500 truncate">
                {[r.shift?.start, r.shift?.name, r.routeName].filter(Boolean).join(" · ") || "Not set"}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                Driver: {r.driverName || "Not set"} · Conductor: {r.conductorName || "Not set"}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <Badge>{r.riders.boarded}/{r.riders.assigned} on board</Badge>
                {r.riders.absent > 0 && <Badge tone="amber">{r.riders.absent} absent</Badge>}
                {r.status === "IN_PROGRESS" && r.stopCount > 0 && <Badge tone="blue">stop {Math.min(r.currentStopIndex + 1, r.stopCount)}/{r.stopCount}</Badge>}
                {r.delayMinutes > 0 && <Badge tone="amber">{r.delayMinutes} min late</Badge>}
                <span className={cn("ml-auto font-bold", r.gps && r.gps.ageSeconds <= 180 ? "text-emerald-600" : "text-gray-400")}>
                  {r.gps && r.gps.ageSeconds <= 180 ? "GPS live" : "No GPS"}
                </span>
              </div>
              {opening === r.tripId && <p className="text-xs text-blue-600">Opening…</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
