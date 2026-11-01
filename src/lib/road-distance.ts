/**
 * Road Distance Provider — CampusFleet Smart Transit
 *
 * Abstraction layer for road distance/route calculations.
 * Swaps between providers with a single env var toggle:
 *
 *   ROUTING_PROVIDER=haversine   → Pure math (current, zero API cost)
 *   ROUTING_PROVIDER=osrm        → OSRM self-hosted (free, OSM data)
 *   ROUTING_PROVIDER=google      → Google Routes API (production, paid)
 *
 * All business logic calls this service — never calls Google/OSRM directly.
 * This means switching providers is a 1-line env var change, zero code changes.
 */

import { calculateHaversineDistanceKm } from "./eta-calculator";

// ─── Provider Configuration ────────────────────────────────────────────────

export type RoutingProvider = "haversine" | "osrm" | "google";

/** Resolve provider from environment */
function getProvider(): RoutingProvider {
  const env = process.env.ROUTING_PROVIDER?.toLowerCase() || "haversine";
  if (env === "google" || env === "osrm") return env;
  return "haversine";
}

/** OSRM server URL (self-hosted or public demo) */
function getOSRMBaseUrl(): string {
  return process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
}

/** Google Maps API key */
function getGoogleApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RoadDistanceResult {
  /** Straight-line (haversine) distance in km */
  straightLineKm: number;
  /** Road distance in km (from routing API, or haversine as fallback) */
  roadDistanceKm: number;
  /** Estimated travel time in minutes */
  durationMins: number;
  /** Which provider was used */
  provider: RoutingProvider;
  /** Whether this is actual road data or haversine estimate */
  isRoadData: boolean;
}

export interface RouteResult {
  /** Total road distance in km */
  totalDistanceKm: number;
  /** Total estimated duration in minutes */
  totalDurationMins: number;
  /** Ordered waypoint distances (leg-by-leg) */
  legDistancesKm: number[];
  /** Ordered waypoint durations (leg-by-leg) */
  legDurationsMins: number[];
  /** Encoded polyline geometry (if available) */
  polyline?: string;
  /** Provider used */
  provider: RoutingProvider;
  isRoadData: boolean;
}

export interface DistanceMatrixResult {
  /** Matrix of distances in km [origin_i][destination_j] */
  distancesKm: number[][];
  /** Matrix of durations in minutes [origin_i][destination_j] */
  durationsMins: number[][];
  provider: RoutingProvider;
  isRoadData: boolean;
}

// ─── Haversine Provider (Zero Cost, No API) ─────────────────────────────────

const HAVERSINE_ROAD_FACTOR = 1.35; // Road distance ≈ 1.35× straight-line in hilly terrain
const AVG_SPEED_KMH = 30; // Average campus shuttle speed

function haversineDistance(from: Coordinate, to: Coordinate): RoadDistanceResult {
  const straightLine = calculateHaversineDistanceKm(from.latitude, from.longitude, to.latitude, to.longitude);
  const roadDist = Math.round(straightLine * HAVERSINE_ROAD_FACTOR * 100) / 100;
  const duration = Math.round((roadDist / AVG_SPEED_KMH) * 60 * 10) / 10;

  return {
    straightLineKm: straightLine,
    roadDistanceKm: roadDist,
    durationMins: duration,
    provider: "haversine",
    isRoadData: false,
  };
}

function haversineRoute(waypoints: Coordinate[]): RouteResult {
  let totalDist = 0;
  let totalDur = 0;
  const legDists: number[] = [];
  const legDurs: number[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const result = haversineDistance(waypoints[i], waypoints[i + 1]);
    totalDist += result.roadDistanceKm;
    totalDur += result.durationMins;
    legDists.push(result.roadDistanceKm);
    legDurs.push(result.durationMins);
  }

  return {
    totalDistanceKm: Math.round(totalDist * 100) / 100,
    totalDurationMins: Math.round(totalDur * 10) / 10,
    legDistancesKm: legDists,
    legDurationsMins: legDurs,
    provider: "haversine",
    isRoadData: false,
  };
}

function haversineMatrix(origins: Coordinate[], destinations: Coordinate[]): DistanceMatrixResult {
  const distancesKm: number[][] = [];
  const durationsMins: number[][] = [];

  for (const origin of origins) {
    const dRow: number[] = [];
    const tRow: number[] = [];
    for (const dest of destinations) {
      const result = haversineDistance(origin, dest);
      dRow.push(result.roadDistanceKm);
      tRow.push(result.durationMins);
    }
    distancesKm.push(dRow);
    durationsMins.push(tRow);
  }

  return { distancesKm, durationsMins, provider: "haversine", isRoadData: false };
}

// ─── OSRM Provider (Free, Self-Hosted, OSM Data) ────────────────────────────

async function osrmDistance(from: Coordinate, to: Coordinate): Promise<RoadDistanceResult> {
  const straightLine = calculateHaversineDistanceKm(from.latitude, from.longitude, to.latitude, to.longitude);

  try {
    const baseUrl = getOSRMBaseUrl();
    const url = `${baseUrl}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) throw new Error("OSRM no route");

    const route = data.routes[0];
    return {
      straightLineKm: straightLine,
      roadDistanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMins: Math.round((route.duration / 60) * 10) / 10,
      provider: "osrm",
      isRoadData: true,
    };
  } catch (err) {
    console.warn("[RoadDistance] OSRM fallback to haversine:", (err as Error).message);
    return haversineDistance(from, to);
  }
}

async function osrmRoute(waypoints: Coordinate[]): Promise<RouteResult> {
  try {
    const baseUrl = getOSRMBaseUrl();
    const coords = waypoints.map(w => `${w.longitude},${w.latitude}`).join(";");
    const url = `${baseUrl}/route/v1/driving/${coords}?overview=full&steps=false&annotations=distance,duration`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) throw new Error("OSRM no route");

    const route = data.routes[0];
    const legs = route.legs || [];

    return {
      totalDistanceKm: Math.round((route.distance / 1000) * 100) / 100,
      totalDurationMins: Math.round((route.duration / 60) * 10) / 10,
      legDistancesKm: legs.map((l: any) => Math.round((l.distance / 1000) * 100) / 100),
      legDurationsMins: legs.map((l: any) => Math.round((l.duration / 60) * 10) / 10),
      polyline: route.geometry,
      provider: "osrm",
      isRoadData: true,
    };
  } catch (err) {
    console.warn("[RoadDistance] OSRM route fallback to haversine:", (err as Error).message);
    return haversineRoute(waypoints);
  }
}

async function osrmMatrix(origins: Coordinate[], destinations: Coordinate[]): Promise<DistanceMatrixResult> {
  try {
    const baseUrl = getOSRMBaseUrl();
    const allCoords = [...origins, ...destinations];
    const coords = allCoords.map(w => `${w.longitude},${w.latitude}`).join(";");

    const sourceIndices = origins.map((_, i) => i).join(";");
    const destIndices = destinations.map((_, i) => i + origins.length).join(";");

    const url = `${baseUrl}/table/v1/driving/${coords}?sources=${sourceIndices}&destinations=${destIndices}&annotations=distance,duration`;

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);

    const data = await res.json();
    if (data.code !== "Ok") throw new Error("OSRM table failed");

    const distancesKm = (data.distances || []).map((row: number[]) =>
      row.map(d => Math.round((d / 1000) * 100) / 100)
    );
    const durationsMins = (data.durations || []).map((row: number[]) =>
      row.map(d => Math.round((d / 60) * 10) / 10)
    );

    return { distancesKm, durationsMins, provider: "osrm", isRoadData: true };
  } catch (err) {
    console.warn("[RoadDistance] OSRM matrix fallback to haversine:", (err as Error).message);
    return haversineMatrix(origins, destinations);
  }
}

// ─── Google Routes API Provider (Production, Paid) ──────────────────────────

async function googleDistance(from: Coordinate, to: Coordinate): Promise<RoadDistanceResult> {
  const straightLine = calculateHaversineDistanceKm(from.latitude, from.longitude, to.latitude, to.longitude);

  try {
    const apiKey = getGoogleApiKey();
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not set");

    const payload = {
      origin: { location: { latLng: { latitude: from.latitude, longitude: from.longitude } } },
      destination: { location: { latLng: { latitude: to.latitude, longitude: to.longitude } } },
      travelMode: "DRIVE",
    };

    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Essentials tier only — keeps cost at $5/1000 requests
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Google Routes API ${res.status}`);

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) throw new Error("No route returned");

    // duration is like "1234s"
    const durationSec = parseInt(route.duration?.replace("s", "") || "0", 10);

    return {
      straightLineKm: straightLine,
      roadDistanceKm: Math.round((route.distanceMeters / 1000) * 100) / 100,
      durationMins: Math.round((durationSec / 60) * 10) / 10,
      provider: "google",
      isRoadData: true,
    };
  } catch (err) {
    console.warn("[RoadDistance] Google fallback to haversine:", (err as Error).message);
    return haversineDistance(from, to);
  }
}

async function googleRoute(waypoints: Coordinate[]): Promise<RouteResult> {
  if (waypoints.length < 2) {
    return haversineRoute(waypoints);
  }

  try {
    const apiKey = getGoogleApiKey();
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not set");

    const intermediates = waypoints.slice(1, -1).map(w => ({
      location: { latLng: { latitude: w.latitude, longitude: w.longitude } },
    }));

    const payload = {
      origin: { location: { latLng: { latitude: waypoints[0].latitude, longitude: waypoints[0].longitude } } },
      destination: { location: { latLng: { latitude: waypoints[waypoints.length - 1].latitude, longitude: waypoints[waypoints.length - 1].longitude } } },
      intermediates,
      travelMode: "DRIVE",
    };

    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`Google Routes API ${res.status}`);

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) throw new Error("No route returned");

    const totalDurSec = parseInt(route.duration?.replace("s", "") || "0", 10);
    const legs = route.legs || [];

    return {
      totalDistanceKm: Math.round((route.distanceMeters / 1000) * 100) / 100,
      totalDurationMins: Math.round((totalDurSec / 60) * 10) / 10,
      legDistancesKm: legs.map((l: any) => Math.round((l.distanceMeters / 1000) * 100) / 100),
      legDurationsMins: legs.map((l: any) => Math.round((parseInt(l.duration?.replace("s", "") || "0", 10) / 60) * 10) / 10),
      polyline: route.polyline?.encodedPolyline,
      provider: "google",
      isRoadData: true,
    };
  } catch (err) {
    console.warn("[RoadDistance] Google route fallback to haversine:", (err as Error).message);
    return haversineRoute(waypoints);
  }
}

async function googleMatrix(origins: Coordinate[], destinations: Coordinate[]): Promise<DistanceMatrixResult> {
  try {
    const apiKey = getGoogleApiKey();
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not set");

    const payload = {
      origins: origins.map(o => ({
        waypoint: { location: { latLng: { latitude: o.latitude, longitude: o.longitude } } },
      })),
      destinations: destinations.map(d => ({
        waypoint: { location: { latLng: { latitude: d.latitude, longitude: d.longitude } } },
      })),
      travelMode: "DRIVE",
    };

    const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`Google Route Matrix API ${res.status}`);

    const elements: any[] = await res.json();

    // Initialize matrices
    const distancesKm: number[][] = origins.map(() => destinations.map(() => 0));
    const durationsMins: number[][] = origins.map(() => destinations.map(() => 0));

    for (const el of elements) {
      const oi = el.originIndex ?? 0;
      const di = el.destinationIndex ?? 0;
      distancesKm[oi][di] = Math.round(((el.distanceMeters || 0) / 1000) * 100) / 100;
      const durSec = parseInt(el.duration?.replace("s", "") || "0", 10);
      durationsMins[oi][di] = Math.round((durSec / 60) * 10) / 10;
    }

    return { distancesKm, durationsMins, provider: "google", isRoadData: true };
  } catch (err) {
    console.warn("[RoadDistance] Google matrix fallback to haversine:", (err as Error).message);
    return haversineMatrix(origins, destinations);
  }
}

// ─── Public API (Provider-Agnostic) ─────────────────────────────────────────

/**
 * Get road distance between two points.
 * Provider auto-selected from ROUTING_PROVIDER env var.
 */
export async function getRoadDistance(from: Coordinate, to: Coordinate): Promise<RoadDistanceResult> {
  const provider = getProvider();
  switch (provider) {
    case "osrm": return osrmDistance(from, to);
    case "google": return googleDistance(from, to);
    default: return haversineDistance(from, to);
  }
}

/**
 * Get full route through multiple waypoints (with leg-by-leg breakdown).
 * Provider auto-selected from ROUTING_PROVIDER env var.
 */
export async function getRoute(waypoints: Coordinate[]): Promise<RouteResult> {
  if (waypoints.length < 2) {
    return { totalDistanceKm: 0, totalDurationMins: 0, legDistancesKm: [], legDurationsMins: [], provider: "haversine", isRoadData: false };
  }
  const provider = getProvider();
  switch (provider) {
    case "osrm": return osrmRoute(waypoints);
    case "google": return googleRoute(waypoints);
    default: return haversineRoute(waypoints);
  }
}

/**
 * Get distance matrix (many-to-many) between origins and destinations.
 * Provider auto-selected from ROUTING_PROVIDER env var.
 *
 * ⚠️  Cost warning for Google: origins × destinations = billed elements.
 *     10 origins × 50 destinations = 500 elements ($2.50 at essentials tier).
 */
export async function getDistanceMatrix(
  origins: Coordinate[],
  destinations: Coordinate[],
): Promise<DistanceMatrixResult> {
  const provider = getProvider();
  switch (provider) {
    case "osrm": return osrmMatrix(origins, destinations);
    case "google": return googleMatrix(origins, destinations);
    default: return haversineMatrix(origins, destinations);
  }
}

/**
 * Get current provider info (for admin dashboard display).
 */
export function getProviderInfo(): {
  provider: RoutingProvider;
  name: string;
  description: string;
  hasRoadData: boolean;
  costPerRequest: string;
} {
  const provider = getProvider();
  switch (provider) {
    case "google":
      return {
        provider: "google",
        name: "Google Routes API",
        description: "Production-grade road data with traffic awareness. Requires GOOGLE_MAPS_API_KEY.",
        hasRoadData: true,
        costPerRequest: "~$0.005/request (Essentials tier)",
      };
    case "osrm":
      return {
        provider: "osrm",
        name: "OSRM (OpenStreetMap)",
        description: "Self-hosted routing with OSM data. Free, but data may be outdated for some roads.",
        hasRoadData: true,
        costPerRequest: "Free (self-hosted)",
      };
    default:
      return {
        provider: "haversine",
        name: "Haversine (Mathematical)",
        description: "Straight-line distance × 1.35 road factor. No API calls, instant, zero cost. Approximate only.",
        hasRoadData: false,
        costPerRequest: "Free (no API)",
      };
  }
}
