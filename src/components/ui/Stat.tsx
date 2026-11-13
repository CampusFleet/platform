import React from "react";
import { cn } from "./cn";

/** Small number tile. Use inside a responsive grid (e.g. grid-cols-2 sm:grid-cols-4); never give it a fixed width. */
export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("p-2.5 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 min-w-0", className)}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 truncate">{label}</div>
      <div className="text-lg font-black text-gray-900 dark:text-white truncate">{value}</div>
      {hint && <div className="text-[11px] text-gray-500 truncate">{hint}</div>}
    </div>
  );
}
