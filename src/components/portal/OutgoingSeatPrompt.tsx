"use client";

import React, { useEffect, useState } from "react";
import { BusFront, Clock } from "lucide-react";

type Pending = { busNumber: number | null; shiftName: string | null; departureTime: string | null; confirmBy: string | null };

const fmt = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * Shown on My Commute when the student missed the morning bus but still has a seat on the bus home.
 * The seat is released at the final boarding chart unless the student keeps it here.
 */
export default function OutgoingSeatPrompt() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/students/outgoing-seat", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setPending(d?.pending ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending && !message) return null;

  const answer = async (confirm: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/students/outgoing-seat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const data = await res.json();
      setMessage(data.success ? (confirm ? "Your seat home is kept." : "Seat released. Thanks for letting us know.") : data.error);
      setPending(null);
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (message) {
    return (
      <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
        {message}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div role="dialog" aria-modal="true" aria-labelledby="osp-title" className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
            <BusFront className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="osp-title" className="text-base font-black text-gray-900 dark:text-white">Need the bus home today?</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">You weren&apos;t on the morning bus.</p>
          </div>
        </div>
        <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-3 text-sm space-y-1 min-w-0">
          <div className="font-bold text-gray-900 dark:text-white truncate">
            {pending!.busNumber ? `Bus ${pending!.busNumber}` : "Your bus"}
            {pending!.shiftName ? ` · ${pending!.shiftName}` : ""}
          </div>
          {pending!.departureTime && <div className="text-gray-600 dark:text-gray-300">Leaves at {fmt(pending!.departureTime)}</div>}
          {pending!.confirmBy && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Confirm by {fmt(pending!.confirmBy)} or the seat goes to someone else.
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(false)}
            className="py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200 disabled:opacity-50"
          >
            Not today
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(true)}
            className="py-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50"
          >
            Keep my seat
          </button>
        </div>
      </div>
    </div>
  );
}
