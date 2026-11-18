"use client";

import React, { useMemo, useState } from "react";
import { BusFront, IdCard, Phone, UserRound } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Select, Sheet } from "@/components/ui";
import type { FleetPlan, PlanBus } from "@/lib/manager/fleet-plan";
import { NotReady, Notice, PageHead, Stat, Toolbar, useFleetPlan } from "./shared";

/**
 * Staff → bus. Each bus's regular driver and conductor. A person is the regular crew of one bus:
 * choosing someone already on another bus moves them (the preview says so). "Also change today's
 * runs" updates today's runs that have not started, and takes the person off other buses' runs.
 */
type Filter = "ALL" | "MISSING" | "COMPLETE";

export default function CrewAssignmentView({ initial }: { initial: FleetPlan }) {
  const { plan, saving, notice, setNotice, save } = useFleetPlan(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState<PlanBus | null>(null);
  const [driverId, setDriverId] = useState("");
  const [conductorId, setConductorId] = useState("");
  const [applyToday, setApplyToday] = useState(true);

  const person = (id: string | null) => plan.staff.find((s) => s.id === id) || null;
  const busOf = (staffId: string, except?: number) =>
    plan.buses.find((b) => b.id !== except && (b.driverId === staffId || b.conductorId === staffId)) || null;
  const routeName = (id: string | null) => plan.routes.find((r) => r.id === id)?.name ?? "No route";
  const drivers = plan.staff.filter((s) => s.role === "driver");
  const conductors = plan.staff.filter((s) => s.role === "conductor");
  const inService = plan.buses.filter((b) => b.status !== "MAINTENANCE" && b.status !== "INACTIVE");
  const missing = inService.filter((b) => !b.driverId || !b.conductorId);
  const free = plan.staff.filter((s) => !busOf(s.id));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inService
      .filter((b) => (filter === "ALL" ? true : filter === "MISSING" ? !b.driverId || !b.conductorId : b.driverId && b.conductorId))
      .filter((b) => !q || `bus ${b.number} ${person(b.driverId)?.name || ""} ${person(b.conductorId)?.name || ""} ${routeName(b.routeId)}`.toLowerCase().includes(q))
      .sort((a, b) => Number(Boolean(a.driverId && a.conductorId)) - Number(Boolean(b.driverId && b.conductorId)) || a.number - b.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, query, filter]);

  const open = (b: PlanBus) => {
    setEditing(b);
    setDriverId(b.driverId || "");
    setConductorId(b.conductorId || "");
    setApplyToday(true);
  };

  // Impact preview for the open bus.
  const moves = editing
    ? [driverId, conductorId]
        .filter(Boolean)
        .map((id) => ({ who: person(id)?.name || "Staff", from: busOf(id, editing.id) }))
        .filter((m) => m.from)
    : [];
  const pendingRuns = editing ? editing.today.filter((r) => r.status === "SCHEDULED" || r.status === "DELAYED") : [];
  const startedRuns = editing ? editing.today.filter((r) => r.status === "IN_PROGRESS") : [];
  const unchanged = editing ? (editing.driverId || "") === driverId && (editing.conductorId || "") === conductorId : true;

  const option = (s: { id: string; name: string }) => {
    const on = editing ? busOf(s.id, editing.id) : null;
    return (
      <option key={s.id} value={s.id}>
        {s.name}{on ? ` (now on Bus ${on.number})` : " (free)"}
      </option>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-0 py-2 space-y-4">
      <PageHead title="Bus crew" subtitle="The regular driver and conductor of each bus. Every run of the bus uses them.">
        <Stat label="Buses in service" value={inService.length} />
        <Stat label="Fully crewed" value={inService.length - missing.length} />
        <Stat label="Missing crew" value={missing.length} />
        <Stat label="Staff without a bus" value={free.length} hint={`${drivers.length} drivers · ${conductors.length} conductors`} />
      </PageHead>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {!plan.ready && <NotReady />}

      <Toolbar<Filter>
        query={query}
        onQuery={setQuery}
        placeholder="Search bus, driver, conductor or route"
        filter={filter}
        onFilter={setFilter}
        filters={[
          { value: "ALL", label: "All" },
          { value: "MISSING", label: "Missing crew" },
          { value: "COMPLETE", label: "Fully crewed" },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState icon={<BusFront className="w-5 h-5" />} title="No buses match">Try another search or filter.</EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((b) => {
            const d = person(b.driverId);
            const c = person(b.conductorId);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => open(b)}
                  className="w-full text-left p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 hover:border-blue-400 transition-colors min-w-0"
                >
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="text-base font-black">Bus {b.number}</div>
                      <div className="text-xs text-gray-500 truncate">{routeName(b.routeId)}</div>
                    </div>
                    <Badge tone={d && c ? "green" : d || c ? "amber" : "red"} dot>{d && c ? "Crewed" : d || c ? "Part crewed" : "No crew"}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="min-w-0">
                      <dt className="text-[11px] text-gray-500">Driver</dt>
                      <dd className={d ? "font-semibold truncate" : "text-rose-600 font-semibold"}>{d?.name || "Not assigned"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] text-gray-500">Conductor</dt>
                      <dd className={c ? "font-semibold truncate" : "text-rose-600 font-semibold"}>{c?.name || "Not assigned"}</dd>
                    </div>
                  </dl>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {free.length > 0 && (
        <Card>
          <div className="text-sm font-black mb-2">Staff without a bus</div>
          <ul className="flex flex-wrap gap-2">
            {free.map((s) => (
              <li key={s.id}>
                <Badge tone="neutral">{s.name} · {s.role}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Sheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Bus ${editing.number}: crew` : ""}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              loading={saving}
              disabled={!plan.ready || unchanged || (Boolean(driverId) && driverId === conductorId)}
              onClick={async () => {
                if (!editing) return;
                const ok = await save(
                  { action: "CREW", busId: editing.id, driverId: driverId || null, conductorId: conductorId || null, applyToday },
                  (r) =>
                    `Saved Bus ${editing.number}.` +
                    (applyToday && r.runsUpdated ? ` ${r.runsUpdated} of today's runs updated.` : "") +
                    (r.otherRunsChanged ? ` ${r.otherRunsChanged} run${r.otherRunsChanged === 1 ? "" : "s"} on other buses changed.` : "")
                );
                if (ok) setEditing(null);
              }}
            >
              Save crew
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Driver">
              <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">Not assigned</option>
                {drivers.map(option)}
              </Select>
            </Field>
            <Field label="Conductor" error={driverId && driverId === conductorId ? "Choose a different person" : null}>
              <Select value={conductorId} onChange={(e) => setConductorId(e.target.value)}>
                <option value="">Not assigned</option>
                {conductors.map(option)}
              </Select>
            </Field>

            {[person(driverId), person(conductorId)].filter(Boolean).map((p) => (
              <div key={p!.id} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{p!.name}</span>
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{p!.phone || "Phone not set"}</span>
                {p!.role === "driver" && <span className="flex items-center gap-1"><IdCard className="w-3.5 h-3.5" />{p!.licenseNo || "Licence not set"}</span>}
              </div>
            ))}

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-zinc-800 cursor-pointer">
              <input type="checkbox" checked={applyToday} onChange={(e) => setApplyToday(e.target.checked)} className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0" />
              <span className="text-sm">
                <span className="font-bold">Also change today&apos;s runs</span>
                <span className="block text-xs text-gray-500">
                  {pendingRuns.length
                    ? `${pendingRuns.length} run${pendingRuns.length === 1 ? "" : "s"} of this bus today (${pendingRuns.map((r) => r.start || r.shift).join(", ")}).`
                    : "This bus has no runs left today."}{" "}
                  Runs already under way are not changed.
                </span>
              </span>
            </label>

            {(moves.length > 0 || startedRuns.length > 0) && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                {moves.map((m) => (
                  <p key={m.who}>
                    {m.who} moves from Bus {m.from!.number} to Bus {editing.number}. Bus {m.from!.number} will need a new {m.from!.driverId === driverId || m.from!.driverId === conductorId ? "driver" : "conductor"}.
                  </p>
                ))}
                {startedRuns.length > 0 && <p>The run under way now ({startedRuns.map((r) => r.shift).join(", ")}) keeps its current crew until it ends.</p>}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
