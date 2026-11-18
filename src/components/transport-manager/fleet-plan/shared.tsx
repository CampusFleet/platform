"use client";

import React, { useCallback, useState } from "react";
import { Search } from "lucide-react";
import { Input, Segmented, Stat, cn } from "@/components/ui";
import type { FleetPlan } from "@/lib/manager/fleet-plan";

/** Shared state for the two fleet-plan pages: load, save through /api/transport-manager/fleet-plan, banner. */
export function useFleetPlan(initial: FleetPlan) {
  const [plan, setPlan] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useCallback(async (body: Record<string, unknown>, describe: (r: any) => string) => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/transport-manager/fleet-plan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not save the change.");
      setPlan(data.plan);
      setNotice({ ok: true, text: describe(data) });
      return true;
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setSaving(false);
    }
  }, []);
  return { plan, saving, notice, setNotice, save };
}

export function PageHead({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-black">{title}</h1>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      {children && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{children}</div>}
    </div>
  );
}

export { Stat };

export function Notice({ notice, onClose }: { notice: { ok: boolean; text: string } | null; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className={cn(
        "p-3 rounded-xl border text-sm font-semibold flex items-start justify-between gap-3",
        notice.ok
          ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200"
          : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200"
      )}
    >
      <span className="min-w-0 break-words">{notice.text}</span>
      <button type="button" onClick={onClose} className="shrink-0 text-xs underline">Dismiss</button>
    </div>
  );
}

export function Toolbar<T extends string>({
  query,
  onQuery,
  placeholder,
  filter,
  onFilter,
  filters,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  filter: T;
  onFilter: (f: T) => void;
  filters: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <div className="relative flex-1 min-w-0">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} className="pl-9 py-2.5" aria-label="Search" />
      </div>
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <Segmented<T> value={filter} onChange={onFilter} options={filters} />
      </div>
    </div>
  );
}

export function NotReady() {
  return (
    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-sm text-amber-900 dark:text-amber-200">
      Standing crew needs the database update <code>20261122_fleet_assignments.sql</code>. Until it is applied, changes cannot be saved.
    </div>
  );
}
