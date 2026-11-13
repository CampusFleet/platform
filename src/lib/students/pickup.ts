import { db } from "@/lib/supabaseClient";
import { calculateHaversineDistanceKm } from "@/lib/eta-calculator";
import { getOrFetchWithCache } from "@/lib/redis";

/**
 * Pickup stop options for a home location. Used by onboarding (GET /api/students/pickup-options)
 * and by POST /api/students/onboarding, which re-checks the chosen stop on the server.
 *
 * Zone and fee come only from the stop's own zone (stops.zone_id, else stops.zone_code). A stop with no
 * zone has no fee, and a stop on no active route cannot be chosen: the UI shows that instead of guessing.
 */

export interface PickupOption {
  stopId: string;
  name: string;
  landmark: string | null;
  latitude: number;
  longitude: number;
  /** Straight-line distance from home. */
  distanceKm: number;
  walkMins: number;
  zoneId: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  semesterFee: number | null;
  routeId: string | null;
  routeName: string | null;
}

export interface StopRow {
  id: string;
  name: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  zone_id: string | null;
  zone_code: string | null;
  campus_id: string | null;
}
export interface ZoneRow {
  id: string;
  code: string | null;
  name: string | null;
  semester_fee: number | null;
  campus_id: string | null;
  is_active: boolean | null;
}
export interface StopRoute {
  stopId: string;
  routeId: string;
  routeName: string | null;
}
export interface CampusPoint {
  id: string;
  latitude: number;
  longitude: number;
}

/** Stops without their own campus_id count for a campus when they are this close to it. */
export const CAMPUS_RADIUS_KM = 60;
/** Nearest stop farther than this: the home is outside the bus service area. */
export const SERVICE_AREA_KM = 15;
const WALK_KMH = 4.8;

export function resolveZone(stop: StopRow, zones: ZoneRow[], campusId: string | null): ZoneRow | null {
  const active = zones.filter((z) => z.is_active !== false);
  if (stop.zone_id) {
    const z = active.find((x) => x.id === stop.zone_id);
    if (z) return z;
  }
  if (stop.zone_code) {
    const sameCode = active.filter((x) => x.code === stop.zone_code);
    const campus = stop.campus_id || campusId;
    return sameCode.find((x) => campus && x.campus_id === campus) || sameCode.find((x) => !x.campus_id) || (sameCode.length === 1 ? sameCode[0] : null);
  }
  return null;
}

/** Pure ranking: nearest stops for `home` that belong to `campus`, with zone, fee and route. */
export function rankPickupStops(
  home: { latitude: number; longitude: number },
  stops: StopRow[],
  zones: ZoneRow[],
  stopRoutes: StopRoute[],
  campus: CampusPoint | null,
  limit = 6
): PickupOption[] {
  const routeByStop = new Map<string, StopRoute>();
  for (const sr of stopRoutes) if (!routeByStop.has(sr.stopId)) routeByStop.set(sr.stopId, sr);

  return stops
    .filter((s) => typeof s.latitude === "number" && typeof s.longitude === "number")
    .filter((s) => {
      if (!campus) return true;
      if (s.campus_id) return s.campus_id === campus.id;
      return calculateHaversineDistanceKm(campus.latitude, campus.longitude, s.latitude!, s.longitude!) <= CAMPUS_RADIUS_KM;
    })
    .map((s) => {
      const distanceKm = calculateHaversineDistanceKm(home.latitude, home.longitude, s.latitude!, s.longitude!);
      const zone = resolveZone(s, zones, campus?.id ?? null);
      const route = routeByStop.get(s.id) || null;
      return {
        stopId: s.id,
        name: s.name || "Unnamed stop",
        landmark: s.landmark || null,
        latitude: s.latitude!,
        longitude: s.longitude!,
        distanceKm: Math.round(distanceKm * 100) / 100,
        walkMins: Math.max(1, Math.round((distanceKm / WALK_KMH) * 60)),
        zoneId: zone?.id ?? null,
        zoneCode: zone?.code ?? null,
        zoneName: zone?.name ?? null,
        semesterFee: zone?.semester_fee != null ? Number(zone.semester_fee) : null,
        routeId: route?.routeId ?? null,
        routeName: route?.routeName ?? null,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

/** The option the app picks by default: the nearest stop that is on a route. */
export function defaultPickup(options: PickupOption[]): PickupOption | null {
  return options.find((o) => o.routeId) || null;
}

interface Catalog {
  stops: StopRow[];
  zones: ZoneRow[];
  stopRoutes: StopRoute[];
  campuses: (CampusPoint & { name: string | null; isPrimary: boolean })[];
}

/** Stops, zones, active route membership and campuses. Cached for 2 minutes. */
export async function loadPickupCatalog(): Promise<Catalog> {
  return getOrFetchWithCache<Catalog>({
    key: "onboarding:pickup-catalog:v1",
    ttl: 120,
    fetchFn: async () => {
      const [stops, zones, rs, routes, campuses] = await Promise.all([
        db.from("stops").select("id, name, landmark, latitude, longitude, zone_id, zone_code, campus_id"),
        db.from("transit_zones").select("id, code, name, semester_fee, campus_id, is_active"),
        db.from("route_stops").select("route_id, stop_id, stop_order"),
        db.from("routes").select("id, name, is_active"),
        db.from("campuses").select("id, name, latitude, longitude, is_primary, is_active"),
      ]);
      for (const r of [stops, zones, rs, routes, campuses]) if (r.error) throw r.error;
      const activeRoutes = new Map((routes.data || []).filter((r) => r.is_active !== false).map((r) => [r.id, r.name]));
      return {
        stops: (stops.data || []) as StopRow[],
        zones: (zones.data || []) as ZoneRow[],
        stopRoutes: (rs.data || [])
          .filter((x) => x.stop_id && x.route_id && activeRoutes.has(x.route_id))
          .map((x) => ({ stopId: x.stop_id!, routeId: x.route_id!, routeName: activeRoutes.get(x.route_id!) ?? null })),
        campuses: (campuses.data || [])
          .filter((c) => c.is_active !== false && c.latitude != null && c.longitude != null)
          .map((c) => ({ id: c.id, name: c.name, latitude: Number(c.latitude), longitude: Number(c.longitude), isPrimary: Boolean(c.is_primary) })),
      };
    },
  });
}

export async function findPickupOptions(home: { latitude: number; longitude: number }, campusId: string | null, limit = 6) {
  const cat = await loadPickupCatalog();
  const campus = cat.campuses.find((c) => c.id === campusId) || null;
  const options = rankPickupStops(home, cat.stops, cat.zones, cat.stopRoutes, campus, limit);
  const nearest = options[0];
  return {
    options,
    defaultStopId: defaultPickup(options)?.stopId ?? null,
    outOfServiceArea: nearest ? nearest.distanceKm > SERVICE_AREA_KM : true,
  };
}

/** Server re-check of a chosen stop for a home location. Returns null when the stop is not usable. */
export async function resolveChosenPickup(home: { latitude: number; longitude: number }, campusId: string | null, stopId: string): Promise<PickupOption | null> {
  const cat = await loadPickupCatalog();
  const campus = cat.campuses.find((c) => c.id === campusId) || null;
  const stop = cat.stops.find((s) => s.id === stopId);
  if (!stop) return null;
  const [opt] = rankPickupStops(home, [stop], cat.zones, cat.stopRoutes, campus, 1);
  return opt && opt.routeId ? opt : null;
}
