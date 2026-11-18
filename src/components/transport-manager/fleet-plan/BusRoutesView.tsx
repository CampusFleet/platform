"use client";

import React, { useMemo, useState } from "react";
import { BusFront, MapPinned, Route as RouteIcon, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Select, Sheet } from "@/components/ui";
import type { FleetPlan, PlanBus } from "@/lib/manager/fleet-plan";
import { NotReady, Notice, PageHead, Stat, Toolbar, useFleetPlan } from "./shared";

/**
 * Bus → route. Each bus's home route, used by the nightly plan to create its runs.
 * Routes with riders but no bus are flagged first, so nothing is left without a bus.
 */
type Filter = "ALL" | "UNASSIGNED" | "ASSIGNED";

export default function BusRoutesView({ initial }: { initial: FleetPlan }) {
  const { plan, saving, notice, setNotice, save } = useFleetPlan(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState<PlanBus | null>(null);
  const [routeId, setRouteId] = useState("");

  const routeName = (id: string | null) => plan.routes.find((r) => r.id === id)?.name ?? null;
  const busesOn = (id: string) => plan.buses.filter((b) => b.routeId === id);
  const active = plan.buses.filter((b) => b.status !== "MAINTENANCE" && b.status !== "INACTIVE");
  const uncovered = plan.routes.filter((r) => r.riders > 0 && busesOn(r.id).length === 0);
  const seatsOn = (id: string) => busesOn(id).reduce((n, b) => n + (b.capacity || 0), 0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plan.buses
      .filter((b) => (filter === "ALL" ? true : filter === "UNASSIGNED" ? !b.routeId : Boolean(b.routeId)))
      .filter((b) => !q || `bus ${b.number} ${b.registrationNo || ""} ${routeName(b.routeId) || ""}`.toLowerCase().includes(q))
      .sort((a, b) => Number(Boolean(a.routeId)) - Number(Boolean(b.routeId)) || a.number - b.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, query, filter]);

  const open = (b: PlanBus) => {
    setEditing(b);
    setRouteId(b.routeId || "");
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-0 py-2 space-y-4">
      <PageHead title="Bus routes" subtitle="Which route each bus runs. The daily plan creates every run from this.">
        <Stat label="Buses in service" value={active.length} />
        <Stat label="On a route" value={plan.buses.filter((b) => b.routeId).length} />
        <Stat label="Without a route" value={plan.buses.filter((b) => !b.routeId).length} />
        <Stat label="Routes without a bus" value={uncovered.length} hint={uncovered.length ? "Riders affected" : undefined} />
      </PageHead>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {uncovered.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900">
          <div className="text-sm font-black text-amber-800 dark:text-amber-300 mb-2">Routes with riders but no bus</div>
          <ul className="flex flex-wrap gap-2">
            {uncovered.map((r) => (
              <li key={r.id}>
                <Badge tone="amber">{r.name} · {r.riders} riders</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Toolbar<Filter>
        query={query}
        onQuery={setQuery}
        placeholder="Search bus number, registration or route"
        filter={filter}
        onFilter={setFilter}
        filters={[
          { value: "ALL", label: "All" },
          { value: "UNASSIGNED", label: "No route" },
          { value: "ASSIGNED", label: "On a route" },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState icon={<BusFront className="w-5 h-5" />} title="No buses match">Try another search or filter.</EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((b) => {
            const route = routeName(b.routeId);
            const r = plan.routes.find((x) => x.id === b.routeId);
            const short = r && r.riders > seatsOn(r.id);
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
                      <div className="text-xs text-gray-500 truncate">
                        {b.registrationNo || "Registration not set"}{b.capacity ? ` · ${b.capacity} seats` : ""}
                      </div>
                    </div>
                    {b.status === "MAINTENANCE" || b.status === "INACTIVE" ? (
                      <Badge tone="neutral">{b.status === "MAINTENANCE" ? "In maintenance" : "Inactive"}</Badge>
                    ) : route ? (
                      <Badge tone={short ? "amber" : "green"} dot>{short ? "Route over capacity" : "On route"}</Badge>
                    ) : (
                      <Badge tone="red" dot>No route</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm min-w-0">
                    <RouteIcon className="w-4 h-4 shrink-0 text-blue-600" />
                    <span className="truncate font-semibold">{route || "Not assigned"}</span>
                    {r && (
                      <span className="ml-auto text-xs text-gray-500 shrink-0 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> {r.riders}/{seatsOn(r.id)}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Bus ${editing.number}: route` : ""}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              loading={saving}
              disabled={!plan.ready || (editing?.routeId || "") === routeId}
              onClick={async () => {
                if (!editing) return;
                const ok = await save({ action: "ROUTE", busId: editing.id, routeId: routeId || null }, () =>
                  routeId ? `Bus ${editing.number} now runs ${routeName(routeId)} from the next plan.` : `Bus ${editing.number} has no route now.`
                );
                if (ok) setEditing(null);
              }}
            >
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            {!plan.ready && <NotReady />}
            <Field label="Route">
              <Select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                <option value="">No route</option>
                {plan.routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.stops} stops · {r.riders} riders · {busesOn(r.id).length} bus{busesOn(r.id).length === 1 ? "" : "es"}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900 text-xs text-gray-600 dark:text-gray-300 space-y-1">
              <p className="flex gap-2"><MapPinned className="w-4 h-4 shrink-0" />The change applies from the next daily plan (00:05 IST).</p>
              {editing.today.length > 0 && (
                <p>
                  Today this bus has {editing.today.length} run{editing.today.length === 1 ? "" : "s"} with riders booked. They stay as they are; change them on
                  the dispatch board if needed.
                </p>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
