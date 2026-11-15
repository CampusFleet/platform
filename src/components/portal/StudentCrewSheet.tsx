"use client";

import React, { useEffect, useState } from "react";
import { Phone, ShieldAlert } from "lucide-react";
import type { PublicRide } from "@/lib/students/ride";
import { Sheet } from "@/components/ui";

/**
 * "Contact crew" sheet for students: today's bus and the conductor actually assigned to it
 * (from /api/students/ride). No guessed bus, no first-conductor fallback, no made-up numbers.
 */
export function StudentCrewSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [ride, setRide] = useState<PublicRide | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(false);
    fetch("/api/students/ride", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.success ? setRide(d.ride) : setError(true)))
      .catch(() => setError(true));
  }, [open]);

  const stop = ride?.stops.find((s) => s.id === ride.myStopId);

  return (
    <Sheet open={open} onClose={onClose} title="Contact your bus">
      {!ride && !error && <div className="h-20 rounded-xl bg-gray-100 dark:bg-zinc-900 animate-pulse" />}
      {error && <p className="text-sm text-gray-500">Could not load your bus. Try again in a moment.</p>}
      {ride && !ride.hasRide && <p className="text-sm text-gray-500">You have no bus today, so there is no crew to contact.</p>}
      {ride?.hasRide && (
        <div className="space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500">Bus</dt>
            <dd className="font-semibold text-right">{ride.busNumber ? `Bus ${ride.busNumber}` : "Not set"}</dd>
            <dt className="text-gray-500">Shift</dt>
            <dd className="font-semibold text-right truncate">{ride.shiftName || "Not set"}</dd>
            <dt className="text-gray-500">Route</dt>
            <dd className="font-semibold text-right truncate">{ride.routeName || "Not set"}</dd>
            <dt className="text-gray-500">Your stop</dt>
            <dd className="font-semibold text-right truncate">{stop?.name || "Not set"}</dd>
          </dl>
          {ride.conductor?.phone ? (
            <a href={`tel:${ride.conductor.phone}`} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-600 text-white font-bold text-sm">
              <Phone className="w-5 h-5 shrink-0" />
              <span className="truncate">Call conductor{ride.conductor.name ? ` · ${ride.conductor.name}` : ""}</span>
            </a>
          ) : (
            <p className="text-sm text-gray-500">No conductor is assigned to this trip yet.</p>
          )}
        </div>
      )}
      <a href="tel:112" className="mt-4 flex items-center gap-3 p-3 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold text-sm">
        <ShieldAlert className="w-5 h-5 shrink-0" /> Emergency: call 112
      </a>
    </Sheet>
  );
}
