"use client";

import React from "react";
import { cn } from "@/components/ui";

/**
 * Read-only strip of the crew member's runs today. The current run is chosen automatically
 * (running → next not ended → last) and moves on when a run ends; crew cannot switch runs.
 */
export function TodayRuns({
  trips,
  currentId,
}: {
  trips: { id: string; status: string; shift?: { name?: string | null; startTime?: string | null } | null }[];
  currentId: string | null | undefined;
}) {
  if (trips.length < 2) return null;
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs" aria-label="Today's runs">
      {trips.map((t) => {
        const now = t.id === currentId;
        const done = t.status === "COMPLETED";
        return (
          <li
            key={t.id}
            aria-current={now ? "step" : undefined}
            className={cn(
              "shrink-0 px-2.5 py-1.5 rounded-xl font-bold border",
              now ? "bg-blue-600 text-white border-blue-600" : done ? "bg-gray-100 dark:bg-zinc-900 text-gray-400 border-gray-200 dark:border-zinc-800 line-through" : "bg-white dark:bg-zinc-950 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-800"
            )}
          >
            {t.shift?.startTime ? <span className="font-mono">{t.shift.startTime.slice(0, 5)}</span> : null} {t.shift?.name || "Run"}
            {now ? " · now" : done ? " · done" : ""}
          </li>
        );
      })}
    </ol>
  );
}
