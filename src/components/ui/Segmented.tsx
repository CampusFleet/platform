"use client";

import React from "react";
import { cn } from "./cn";

/** Horizontally scrollable pill tabs; never wraps or overflows the page on narrow screens. */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cn("flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "shrink-0 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap",
            o.value === value ? "bg-blue-600 text-white" : "bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
