import { db } from "@/lib/supabaseClient";
import { cacheGet } from "@/lib/redis";

/**
 * Transport manager live fleet (server-only): every run today with bus, route, shift, crew,
 * rider counts and the bus's latest GPS fix (Redis telematics:bus:{busId}). One call replaces the
 * old view's whole-database store download.
 */

export interface FleetRun {
  tripId: string; // staff-only screen
  status: string;
  currentStopIndex: number;
  stopCount: number;
  delayMinutes: number;
  bus: { id: number; number: string | null; registrationNo: string | null; capacity: number | null } | null;
  routeName: string | null;
  shift: { name: string | null; start: string | null; end: string | null; direction: string | null } | null;
  routeId: string | null;
  shiftId: string | null;
  driverId: string | null;
  conductorId: string | null;
  driverName: string | null;
  conductorName: string | null;
  riders: { assigned: number; boarded: number; absent: number };
  gps: { latitude: number; longitude: number; speedKmh: number; headingDeg: number; ageSeconds: number } | null;
}

const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export async function getFleetLive(date: string = todayIst()): Promise<FleetRun[]> {
  const { data: trips } = await db
    .from("trips")
    .select("id, status, current_stop_index, delay_minutes, bus_id, route_id, shift_id, driver_id, conductor_id")
    .eq("trip_date", date)
    .neq("status", "CANCELLED");
  const list = trips || [];
  if (list.length === 0) return [];
  const uniq = <T,>(a: (T | null | undefined)[]) => Array.from(new Set(a.filter((x): x is T => x != null)));
  const busIds = uniq(list.map((t) => t.bus_id));
  const routeIds = uniq(list.map((t) => t.route_id));
  const shiftIds = uniq(list.map((t) => t.shift_id));
  const staffIds = uniq([...list.map((t) => t.driver_id), ...list.map((t) => t.conductor_id)]);
  const tripIds = list.map((t) => t.id);

  const [buses, routes, shifts, staff, rs, res] = await Promise.all([
    busIds.length ? db.from("buses").select("id, bus_number, registration_no, capacity").in("id", busIds) : Promise.resolve({ data: [] as any[] }),
    routeIds.length ? db.from("routes").select("id, name").in("id", routeIds) : Promise.resolve({ data: [] as any[] }),
    shiftIds.length ? db.from("shifts").select("id, name, start_time, end_time, direction").in("id", shiftIds) : Promise.resolve({ data: [] as any[] }),
    staffIds.length ? db.from("staff").select("id, full_name").in("id", staffIds) : Promise.resolve({ data: [] as any[] }),
    routeIds.length ? db.from("route_stops").select("route_id").in("route_id", routeIds) : Promise.resolve({ data: [] as any[] }),
    db.from("bus_reservations").select("trip_id, status").in("trip_id", tripIds).neq("status", "CANCELLED"),
  ]);
  const by = <T extends { id: any }>(rows: T[] | null) => new Map((rows || []).map((r) => [r.id, r]));
  const busBy = by(buses.data as any[]);
  const routeBy = by(routes.data as any[]);
  const shiftBy = by(shifts.data as any[]);
  const staffBy = by(staff.data as any[]);
  const stopCount = new Map<string, number>();
  for (const r of (rs.data || []) as any[]) stopCount.set(r.route_id, (stopCount.get(r.route_id) || 0) + 1);
  const riders = new Map<string, { assigned: number; boarded: number; absent: number }>();
  for (const r of (res.data || []) as any[]) {
    const c = riders.get(r.trip_id) || { assigned: 0, boarded: 0, absent: 0 };
    c.assigned++;
    if (r.status === "BOARDED" || r.status === "ALIGHTED") c.boarded++;
    if (r.status === "ABSENT" || r.status === "NO_SHOW") c.absent++;
    riders.set(r.trip_id, c);
  }
  const gpsBy = new Map<number, FleetRun["gps"]>();
  await Promise.all(
    busIds.map(async (id) => {
      const loc = await cacheGet<any>(`telematics:bus:${id}`).catch(() => null);
      if (!loc || !Number.isFinite(Number(loc.latitude))) return;
      const ts = new Date(loc.timestamp || loc.lastPingAt || 0).getTime();
      gpsBy.set(id as number, {
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
        speedKmh: Number(loc.speedKmh) || 0,
        headingDeg: Number(loc.headingDeg) || 0,
        ageSeconds: ts ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : 9999,
      });
    })
  );

  return list
    .map((t) => {
      const b: any = t.bus_id != null ? busBy.get(t.bus_id) : null;
      const sh: any = t.shift_id ? shiftBy.get(t.shift_id) : null;
      return {
        tripId: t.id,
        status: t.status || "SCHEDULED",
        currentStopIndex: t.current_stop_index ?? 0,
        stopCount: (t.route_id && stopCount.get(t.route_id)) || 0,
        delayMinutes: Number(t.delay_minutes) || 0,
        bus: b ? { id: b.id, number: b.bus_number, registrationNo: b.registration_no, capacity: b.capacity } : null,
        routeName: (t.route_id && (routeBy.get(t.route_id) as any)?.name) || null,
        shift: sh ? { name: sh.name, start: (sh.start_time || "").slice(0, 5) || null, end: (sh.end_time || "").slice(0, 5) || null, direction: sh.direction } : null,
        routeId: t.route_id ?? null,
        shiftId: t.shift_id ?? null,
        driverId: t.driver_id ?? null,
        conductorId: t.conductor_id ?? null,
        driverName: (t.driver_id && (staffBy.get(t.driver_id) as any)?.full_name) || null,
        conductorName: (t.conductor_id && (staffBy.get(t.conductor_id) as any)?.full_name) || null,
        riders: riders.get(t.id) || { assigned: 0, boarded: 0, absent: 0 },
        gps: t.bus_id != null ? gpsBy.get(t.bus_id as number) ?? null : null,
      };
    })
    .sort((a, b) => (a.shift?.start || "").localeCompare(b.shift?.start || "") || String(a.bus?.number).localeCompare(String(b.bus?.number), undefined, { numeric: true }));
}
