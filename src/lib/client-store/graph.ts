import {
  buildStopGraph,
  computeNetworkStats,
  recommendBestRoute,
  type NetworkStats,
  type RouteRecommendation,
  type StopGraph,
} from "../route-optimizer";
import type { Campus, Route, RouteStop, Stop } from "../types";

/**
 * Pure helpers behind store.recommendRoute / store.getNetworkStats.
 * Campuses are added to the stop network as terminal stops so routes end at the campus.
 */

export interface NetworkInput {
  stops: Stop[];
  routes: Route[];
  campuses: Campus[];
}

export function primaryCampusOf(campuses: Campus[]): Campus | undefined {
  return campuses.find((c) => c.isPrimary) || campuses[0];
}

function campusAsStop(c: Campus): Stop {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    latitude: c.latitude,
    longitude: c.longitude,
    landmark: c.landmark || c.address || c.name,
    geofenceRadiusMeters: c.geofenceRadiusMeters || 150,
    campusId: c.id,
    zoneCode: "ZONE_CAMPUS",
  };
}

/** All stops plus one terminal stop per campus (no campuses → just the stops). */
export function stopsIncludingCampuses({ stops, campuses }: NetworkInput): Stop[] {
  const existingIds = new Set(stops.map((s) => s.id));
  return [...stops, ...campuses.filter((c) => !existingIds.has(c.id)).map(campusAsStop)];
}

/** Home-to-campus routes get their destination campus appended as the last stop. */
export function routesWithCampusTerminus({ routes, campuses }: NetworkInput): Route[] {
  const primary = primaryCampusOf(campuses);
  return routes.map((r) => {
    if (!r.isActive || !r.stops || r.stops.length === 0) return r;
    const target =
      ((r as any).destinationCampusId ? campuses.find((c) => c.id === (r as any).destinationCampusId) : null) ||
      ((r as any).campusId ? campuses.find((c) => c.id === (r as any).campusId) : null) ||
      primary;
    if (!target) return r;
    if (r.direction !== "HOME_TO_CAMPUS" && r.direction) return r;
    const sorted = [...r.stops].sort((a, b) => a.stopOrder - b.stopOrder);
    const last = sorted[sorted.length - 1];
    if (!last || last.stopId === target.id) return r;
    const terminus: RouteStop = {
      stopId: target.id,
      stopOrder: last.stopOrder + 1,
      arrivalOffsetMinutes: (last.arrivalOffsetMinutes || 0) + 15,
      bufferTimeMinutes: 5,
      stop: campusAsStop(target),
    };
    return { ...r, stops: [...r.stops, terminus] };
  });
}

export function buildNetworkGraph(input: NetworkInput): StopGraph {
  return buildStopGraph(routesWithCampusTerminus(input), stopsIncludingCampuses(input));
}

/** Nearest stops to a home location with the shortest ride to the campus; [] when no campus is known. */
export function recommendRoutes(
  input: NetworkInput,
  graph: StopGraph,
  homeLat: number,
  homeLng: number,
  campusId: string | undefined
): RouteRecommendation[] {
  if (!campusId) return [];
  return recommendBestRoute(homeLat, homeLng, campusId, stopsIncludingCampuses(input), routesWithCampusTerminus(input), graph);
}

export function networkStats(graph: StopGraph): NetworkStats {
  return computeNetworkStats(graph);
}
