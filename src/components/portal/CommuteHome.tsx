"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Armchair, BusFront, CalendarOff, Clock, MapPin, Navigation, Phone, QrCode, RefreshCw, Settings } from "lucide-react";
import type { PublicRide, RideLive } from "@/lib/students/ride";
import { useAttendancePolicy, boardingWays, joinWays } from "@/lib/attendance";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";

/**
 * Student "My Commute" home. Data is the student's own ride (lib/students/ride.ts) rendered by the
 * server page; the live part (/api/students/ride/live) refreshes every 15 s while visible.
 * Stages: day off · no bus · ride (before / on board) · done for today.
 */

const POLL_MS = 15_000;

function to12h(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export default function CommuteHome({
  ride: initialRide,
  live: initialLive,
  dayOff,
  dayName,
  audience = "student",
}: {
  ride: PublicRide;
  live: RideLive;
  dayOff: boolean;
  dayName: string;
  /** teacher: /api/teacher/ride*, no student-only links (live map, QR pass), seat shown once assigned. */
  audience?: "student" | "teacher";
}) {
  const api = audience === "teacher" ? "/api/teacher/ride" : "/api/students/ride";
  const teacher = audience === "teacher";
  const [ride, setRide] = useState(initialRide);
  const [live, setLive] = useState(initialLive);
  const [refreshing, setRefreshing] = useState(false);
  const { locks } = useAttendancePolicy();

  const refreshLive = useCallback(async () => {
    try {
      const r = await fetch(`${api}/live`, { cache: "no-store" });
      const d = await r.json();
      if (d.success) setLive(d.live);
    } catch {
      /* keep last value */
    }
  }, []);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      const r = await fetch(api, { cache: "no-store" });
      const d = await r.json();
      if (d.success) setRide(d.ride);
      await refreshLive();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!ride.hasRide) return;
    const id = setInterval(() => document.visibilityState === "visible" && refreshLive(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refreshLive();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ride.hasRide, refreshLive]);

  const ways = boardingWays(locks);

  if (dayOff) {
    return (
      <Card>
        <EmptyState icon={<CalendarOff className="w-8 h-8" />} title={`No bus today (${dayName.charAt(0) + dayName.slice(1).toLowerCase()})`}>
          Your class timetable has no transport today. Check again tomorrow.
        </EmptyState>
      </Card>
    );
  }

  if (!ride.hasRide) {
    return (
      <Card>
        <EmptyState
          icon={<BusFront className="w-8 h-8" />}
          title="No bus assigned yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="secondary" onClick={refreshAll} loading={refreshing}>
                <RefreshCw className="w-4 h-4" /> Check again
              </Button>
              <Link href={teacher ? "/teacher/settings" : "/portal/settings"} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-blue-600">
                <Settings className="w-4 h-4" /> {teacher ? "Set my bus" : "Check my pickup stop"}
              </Link>
            </div>
          }
        >
          {teacher
            ? "Choose your route, stop and shifts in Settings. Your bus shows here once the boarding chart adds you."
            : "Seats are assigned from the boarding chart before each shift. Your bus shows here once it is ready."}
        </EmptyState>
      </Card>
    );
  }

  const done = live.status === "COMPLETED";
  const cancelled = live.status === "CANCELLED";
  const gpsLive = Boolean(live.bus && live.bus.ageSeconds <= 180);
  const myStop = ride.stops.find((s) => s.id === ride.myStopId) || null;
  const atStop = to12h(myStop?.plannedTime ?? null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<BusFront className="w-5 h-5" />}
          title={ride.busNumber ? `Bus ${ride.busNumber}` : "Your bus"}
          subtitle={[ride.busModel, ride.registrationNo].filter(Boolean).join(" · ") || undefined}
          action={
            done ? <Badge>Trip ended</Badge> : cancelled ? <Badge tone="red">Cancelled</Badge> : live.boarded ? <Badge tone="green" dot>On board</Badge> : gpsLive ? <Badge tone="green" dot>Live</Badge> : <Badge tone="blue">Scheduled</Badge>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Info icon={<MapPin className="w-4 h-4 text-pink-500" />} label="Pickup stop" value={myStop?.name || "Not set"} sub={ride.myStopLandmark ? `Near ${ride.myStopLandmark}` : undefined} />
          <Info
            icon={<Clock className="w-4 h-4 text-blue-500" />}
            label={ride.shiftName || "Shift"}
            value={to12h(ride.departureTime) ? `Departs ${to12h(ride.departureTime)}` : "Time not set"}
            sub={[atStop && `At your stop ${atStop}`, live.delayMinutes > 0 && `${live.delayMinutes} min late`].filter(Boolean).join(" · ") || undefined}
          />
          <Info
            icon={<Armchair className="w-4 h-4 text-emerald-600" />}
            label="Seat"
            value={live.seat && (live.boarded || teacher) ? `Seat ${live.seat}` : live.boarded ? "On board" : teacher ? "Being assigned" : "Shown after check-in"}
            sub={ride.routeName || undefined}
          />
        </div>

        {!teacher && !live.boarded && !done && !cancelled && (
          <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
            {ways.length ? `When you board, ${joinWays(ways)}.` : "The conductor checks you in when you board."}
          </p>
        )}
        {cancelled && <p className="mt-3 text-xs font-semibold text-rose-600">This trip was cancelled. Contact the transport office if you still need to travel.</p>}
      </Card>

      <div className={teacher ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-3 gap-3"}>
        {!teacher && (
        <Link href="/portal/radar" className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <Navigation className="w-5 h-5 shrink-0" />
            <span className="text-sm font-bold truncate">Live bus map</span>
          </span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </Link>
        )}
        {!teacher && (
        <Link href={locks.dynamicQr ? "/portal/qr/show" : "/portal/qr"} className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <QrCode className="w-5 h-5 shrink-0 text-blue-600" />
            <span className="text-sm font-bold truncate">{locks.dynamicQr ? "Show my QR pass" : "How to board"}</span>
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 text-gray-400" />
        </Link>
        )}
        {ride.conductor?.phone ? (
          <a href={`tel:${ride.conductor.phone}`} className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 min-w-0">
            <span className="flex items-center gap-2 min-w-0">
              <Phone className="w-5 h-5 shrink-0 text-emerald-600" />
              <span className="text-sm font-bold truncate">Call conductor{ride.conductor.name ? ` (${ride.conductor.name})` : ""}</span>
            </span>
            <ArrowRight className="w-4 h-4 shrink-0 text-gray-400" />
          </a>
        ) : (
          <div className="flex items-center gap-2 p-4 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-800 text-xs text-gray-500">
            <Phone className="w-4 h-4 shrink-0" /> Conductor not assigned yet
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={refreshAll} loading={refreshing}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>
    </div>
  );
}

function Info({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 min-w-0">
      <div className="text-xs text-gray-500 flex items-center gap-1.5 min-w-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-sm font-bold mt-1 truncate">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 truncate">{sub}</div>}
    </div>
  );
}
