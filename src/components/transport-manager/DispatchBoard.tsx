"use client";

import React, { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Plus, RefreshCw, X } from "lucide-react";
import type { FleetRun } from "@/lib/manager/fleet-live";
import type { getDispatchBoard } from "@/lib/manager/dispatch";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Segmented, Select, Sheet } from "@/components/ui";

/**
 * Transport manager → Dispatch. One board for "Today's trips" and "Crew assignment":
 * every run of the chosen day grouped by shift, with bus / driver / conductor pickers.
 * Saves through /api/transport-manager/dispatch (Postgres functions check that a bus or person is
 * not on two runs at the same time). Runs without a bus (from the rollover) are listed first.
 */

type Board = Awaited<ReturnType<typeof getDispatchBoard>>;

type Draft = { busId: number | null; driverId: string; conductorId: string };

export default function DispatchBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<FleetRun | null>(null);
  // Shift first: the board shows one shift at a time (default: the one running or next).
  const [shiftId, setShiftId] = useState<string>("");

  const load = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/transport-manager/dispatch?date=${date}`, { cache: "no-store" });
      const d = await r.json();
      if (d.success) {
        setBoard(d);
        setDrafts({});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const post = async (body: Record<string, unknown>, key: string) => {
    setSaving(key);
    setMsg(null);
    try {
      const r = await fetch("/api/transport-manager/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || "Could not save.");
      setMsg({ ok: true, text: d.reseated ? `Saved. ${d.reseated} riders will get seats on the new bus.` : "Saved." });
      await load(board.date);
      return true;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setSaving(null);
    }
  };

  const groups = useMemo(() => {
    const byShift = new Map<string, FleetRun[]>();
    for (const r of board.runs) {
      const k = r.shiftId || "none";
      byShift.set(k, [...(byShift.get(k) || []), r]);
    }
    return board.shifts
      .map((s) => ({ shift: s, runs: (byShift.get(s.id) || []).sort((a, b) => (a.bus ? 1 : 0) - (b.bus ? 1 : 0)) }))
      .filter((g) => g.runs.length > 0);
  }, [board]);
  const nowHm = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(11, 16);
  const defaultShift =
    groups.find((g) => g.runs.some((r) => r.status === "IN_PROGRESS"))?.shift.id ||
    groups.find((g) => (g.shift.end || "99:99") > nowHm)?.shift.id ||
    groups[0]?.shift.id ||
    "";
  const activeShift = groups.some((g) => g.shift.id === shiftId) ? shiftId : defaultShift;
  const visible = groups.filter((g) => g.shift.id === activeShift);
  // Other runs today per person, so a manager sees "Aditya also drives Bus 37 at 07:15".
  const elsewhere = (staffId: string, tripId: string) =>
    staffId
      ? board.runs
          .filter((x) => x.tripId !== tripId && (x.driverId === staffId || x.conductorId === staffId) && x.status !== "COMPLETED")
          .map((x) => `Bus ${x.bus?.number ?? "?"} ${x.shift?.start || ""}`.trim())
      : [];

  const needBus = board.runs.filter((r) => !r.bus && r.status !== "COMPLETED").length;
  const noCrew = board.runs.filter((r) => r.bus && (!r.driverId || !r.conductorId) && r.status !== "COMPLETED").length;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black">Dispatch</h1>
          <p className="text-xs text-gray-500">Buses and crew for every run</p>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Day">
            <Input type="date" value={board.date} onChange={(e) => e.target.value && void load(e.target.value)} className="py-2" />
          </Field>
          <Button size="sm" variant="secondary" onClick={() => void load(board.date)} loading={loading} aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Add run
          </Button>
        </div>
      </div>

      {(needBus > 0 || noCrew > 0) && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-sm text-amber-900 dark:text-amber-200 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {needBus > 0 && `${needBus} run${needBus > 1 ? "s" : ""} need a bus. `}
            {noCrew > 0 && `${noCrew} run${noCrew > 1 ? "s" : ""} miss a driver or conductor.`}
          </span>
        </div>
      )}
      {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`} role="status">{msg.text}</p>}

      {groups.length === 0 && (
        <Card>
          <EmptyState icon={<CalendarDays className="w-8 h-8" />} title="No runs on this day">Runs are created by the nightly rollover from class timetables. Add one by hand if needed.</EmptyState>
        </Card>
      )}

      {groups.length > 0 && (
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <Segmented<string>
            value={activeShift}
            onChange={setShiftId}
            options={groups.map((g) => ({ value: g.shift.id, label: `${g.shift.start ? `${g.shift.start} ` : ""}${g.shift.name} (${g.runs.length})` }))}
          />
        </div>
      )}
      <p className="text-xs text-gray-500">
        Changes here apply to this run only. For a bus&apos;s regular driver, conductor or route, use{" "}
        <a href="/transport-manager/crew" className="text-blue-600 font-semibold">Bus crew</a> and{" "}
        <a href="/transport-manager/bus-routes" className="text-blue-600 font-semibold">Bus routes</a>.
      </p>
      {visible.map(({ shift, runs }) => (
        <Card key={shift.id}>
          <CardHeader title={`${shift.start ? `${shift.start} · ` : ""}${shift.name}`} subtitle={shift.direction === "HOME_TO_CAMPUS" ? "To campus" : shift.direction === "CAMPUS_TO_HOME" ? "From campus" : undefined} />
          <ul className="space-y-2">
            {runs.map((r) => {
              const d = drafts[r.tripId] || { busId: r.bus?.id ?? null, driverId: r.driverId || "", conductorId: r.conductorId || "" };
              const dirty = d.busId !== (r.bus?.id ?? null) || d.driverId !== (r.driverId || "") || d.conductorId !== (r.conductorId || "");
              const locked = r.status === "COMPLETED";
              const set = (patch: Partial<Draft>) => setDrafts((x) => ({ ...x, [r.tripId]: { ...d, ...patch } }));
              return (
                <li key={r.tripId} className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-sm font-black truncate">{r.routeName || "Route not set"}</span>
                    <Badge tone={r.status === "IN_PROGRESS" ? "green" : r.status === "COMPLETED" ? "neutral" : "blue"}>{r.status === "IN_PROGRESS" ? "Running" : r.status.toLowerCase()}</Badge>
                    {!r.bus && <Badge tone="amber">Needs a bus</Badge>}
                    <span className="text-xs text-gray-500 ml-auto">{r.riders.assigned} riders{r.riders.boarded ? ` · ${r.riders.boarded} on board` : ""}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Select value={d.busId ?? ""} disabled={locked || r.status === "IN_PROGRESS"} onChange={(e) => set({ busId: e.target.value ? Number(e.target.value) : null })} aria-label="Bus">
                      <option value="">No bus</option>
                      {board.buses.map((b) => (
                        <option key={b.id} value={b.id}>Bus {b.number}{b.capacity ? ` · ${b.capacity} seats` : ""}</option>
                      ))}
                    </Select>
                    <Select value={d.driverId} disabled={locked} onChange={(e) => set({ driverId: e.target.value })} aria-label="Driver">
                      <option value="">No driver</option>
                      {board.drivers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                    <Select value={d.conductorId} disabled={locked} onChange={(e) => set({ conductorId: e.target.value })} aria-label="Conductor">
                      <option value="">No conductor</option>
                      {board.conductors.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role === "driver" ? " (driver)" : ""}</option>)}
                    </Select>
                  </div>
                  {[["Driver", d.driverId], ["Conductor", d.conductorId]].map(([label, id]) => {
                    const other = elsewhere(id, r.tripId);
                    return other.length ? (
                      <p key={label} className="text-[11px] text-amber-700 dark:text-amber-400">
                        {label} is also on {other.join(", ")} today.
                      </p>
                    ) : null;
                  })}
                  {!locked && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={!dirty} loading={saving === r.tripId} onClick={() => void post({ action: "UPDATE", tripId: r.tripId, busId: d.busId, driverId: d.driverId || null, conductorId: d.conductorId || null }, r.tripId)}>
                        Save
                      </Button>
                      {dirty && <Button size="sm" variant="ghost" onClick={() => setDrafts((x) => { const n = { ...x }; delete n[r.tripId]; return n; })}>Undo</Button>}
                      {(r.status === "SCHEDULED" || r.status === "DELAYED") && (
                        <Button size="sm" variant="ghost" className="ml-auto text-rose-600" onClick={() => setCancelling(r)}>
                          <X className="w-4 h-4" /> Cancel run
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <AddRunSheet open={adding} board={board} onClose={() => setAdding(false)} onSave={async (body) => (await post({ action: "ADD", date: board.date, ...body }, "add")) && setAdding(false)} saving={saving === "add"} />

      <Sheet
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Cancel this run?"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setCancelling(null)}>Keep it</Button>
            <Button variant="danger" loading={saving === "cancel"} onClick={async () => { if (cancelling && (await post({ action: "CANCEL", tripId: cancelling.tripId }, "cancel"))) setCancelling(null); }}>
              Cancel run
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-amber-900 dark:text-amber-200">
            Replacing a broken-down bus? Choose <span className="font-bold">Keep it</span> and change the bus on this run instead, so riders stay on it.
          </p>
          <p>
            {cancelling?.riders.assigned
              ? `${cancelling.riders.assigned} riders will be moved to another run on this route and shift if there is one (now, or when you add one before boarding closes). Otherwise they lose their seat and are told.`
              : "No riders are on this run yet."}{" "}
            This cannot be undone.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

function AddRunSheet({ open, board, onClose, onSave, saving }: { open: boolean; board: Board; onClose: () => void; onSave: (b: Record<string, unknown>) => void; saving: boolean }) {
  const [routeId, setRouteId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [busId, setBusId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [conductorId, setConductorId] = useState("");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a run"
      footer={
        <Button block disabled={!routeId || !shiftId} loading={saving} onClick={() => onSave({ routeId, shiftId, busId: busId ? Number(busId) : null, driverId: driverId || null, conductorId: conductorId || null })}>
          Add run
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">For example a second bus for a crowded shift. Riders are added by the boarding chart.</p>
        <Field label="Route">
          <Select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Choose route</option>
            {board.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Shift">
          <Select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">Choose shift</option>
            {board.shifts.map((s) => <option key={s.id} value={s.id}>{s.start ? `${s.start} · ` : ""}{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Bus">
          <Select value={busId} onChange={(e) => setBusId(e.target.value)}>
            <option value="">Choose later</option>
            {board.buses.map((b) => <option key={b.id} value={b.id}>Bus {b.number}</option>)}
          </Select>
        </Field>
        <Field label="Driver">
          <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Choose later</option>
            {board.drivers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Conductor">
          <Select value={conductorId} onChange={(e) => setConductorId(e.target.value)}>
            <option value="">Choose later</option>
            {board.conductors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}
