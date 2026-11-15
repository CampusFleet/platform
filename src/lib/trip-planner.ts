/**
 * Daily trip plan (used by lib/daily-rollover.ts). Pure: no database access, so it is unit-tested.
 *
 * One trip per (route, shift) that some student on that route needs today, according to their
 * class timetable (class_shift_schedules / shift_demands). Each trip gets the first bus on the
 * route that is free for the whole shift; a bus is free again after the previous shift's end time
 * plus a turnaround. A trip with no free bus is still created with bus_id = null, so the transport
 * manager can see it and assign a bus (the boarding chart skips it until then).
 *
 * If no timetable exists for the day at all, every route gets the first incoming shift and every
 * outgoing shift, so buses still run.
 */

export interface PlanShift {
  id: string;
  direction: string | null;
  start: string | null; // "HH:MM[:SS]"
  end: string | null;
}
export interface PlanBus {
  id: number;
  routeId: string | null;
}
export interface PlanRoute {
  id: string;
}
export interface PlannedTrip {
  routeId: string;
  shiftId: string;
  busId: number | null;
}

export const TURNAROUND_MINUTES = 20;
const DEFAULT_SHIFT_MINUTES = 90;

export function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
}

export function planTrips(input: {
  routes: PlanRoute[];
  buses: PlanBus[];
  shifts: PlanShift[];
  /** shift ids needed per route today; null = no timetable for the day */
  demand: Map<string, Set<string>> | null;
  /** (route, shift) pairs that already have a trip today */
  existing?: Set<string>;
}): PlannedTrip[] {
  const shiftById = new Map(input.shifts.map((s) => [s.id, s]));
  const incoming = input.shifts.filter((s) => s.direction === "HOME_TO_CAMPUS");
  const outgoing = input.shifts.filter((s) => s.direction === "CAMPUS_TO_HOME");
  const fallback = new Set<string>([...(incoming[0] ? [incoming[0].id] : []), ...outgoing.map((s) => s.id)]);
  const out: PlannedTrip[] = [];

  for (const route of input.routes) {
    const busesHere = input.buses.filter((b) => b.routeId === route.id);
    const wanted = input.demand ? input.demand.get(route.id) : fallback;
    if (!wanted || wanted.size === 0) continue;
    if (!input.demand && busesHere.length === 0) continue; // no timetable and no bus: nothing to show

    const shifts = Array.from(wanted)
      .map((id) => shiftById.get(id))
      .filter((s): s is PlanShift => Boolean(s))
      .sort((a, b) => (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0));

    const freeAt = new Map<number, number>(busesHere.map((b) => [b.id, -1]));
    for (const sh of shifts) {
      if (input.existing?.has(`${route.id}|${sh.id}`)) continue;
      const start = toMinutes(sh.start) ?? 0;
      let end = toMinutes(sh.end);
      if (end == null || end <= start) end = start + DEFAULT_SHIFT_MINUTES;
      const bus = busesHere.find((b) => (freeAt.get(b.id) ?? -1) <= start) || null;
      if (bus) freeAt.set(bus.id, end + TURNAROUND_MINUTES);
      out.push({ routeId: route.id, shiftId: sh.id, busId: bus ? bus.id : null });
    }
  }
  return out;
}
