/**
 * CampusFleet Intelligent Zone & Route Detector
 * 
 * Automatically resolves:
 * 1. Nearest Transit Stop from Student Home Pin (Geospatial Haversine).
 * 2. Assigned Transit Route containing that stop.
 * 3. Assigned Transit Zone & Semester Fee (Zero manual user dropdown required).
 * 4. First-mile walking distance and duration.
 */

import { Stop, Route, TransitZone, Campus } from "./types";
import { calculateHaversineDistanceKm } from "./eta-calculator";

export interface AutoDetectedCommuteContext {
  homeLatitude: number;
  homeLongitude: number;
  nearestStop: Stop;
  walkingDistanceMeters: number;
  walkingTimeMins: number;
  assignedRoute: Route | null;
  assignedZone: TransitZone;
  semesterFee: number;
  distanceToCampusKm: number;
}

/**
 * Automatically computes zone, route, and nearest pickup stop from home coordinates
 */
export function detectCommuterZoneAndStop(
  homeLat: number,
  homeLng: number,
  stops: Stop[],
  routes: Route[],
  zones: TransitZone[],
  campus?: Campus | Stop | null
): AutoDetectedCommuteContext | null {
  if (!stops || stops.length === 0) return null;

  // 1. Calculate distance to all stops and sort by shortest road proximity
  const sortedStops = stops
    .map((stop) => {
      const distKm = calculateHaversineDistanceKm(homeLat, homeLng, stop.latitude, stop.longitude);
      return {
        stop,
        distKm,
        distMeters: Math.round(distKm * 1000),
        walkMins: Math.max(1, Math.round((distKm / 4.8) * 60)), // 4.8 km/h pedestrian walking pace
      };
    })
    .sort((a, b) => a.distKm - b.distKm);

  const nearest = sortedStops[0];
  if (!nearest) return null;

  // 2. Resolve matching route containing this stop
  let matchingRoute: Route | null = null;
  for (const route of routes) {
    if (route.stops && route.stops.some((rs: any) => (rs.stopId || rs.stop_id) === nearest.stop.id)) {
      matchingRoute = route;
      break;
    }
  }

  // 3. Distance to Campus Terminal
  const campusLat = campus?.latitude || 29.375015;
  const campusLng = campus?.longitude || 79.529479;
  const distanceToCampusKm = Math.round(calculateHaversineDistanceKm(homeLat, homeLng, campusLat, campusLng) * 10) / 10;

  // 4. Resolve Transit Zone:
  // First, check if the nearest stop has an assigned zone_code or zone_id
  let matchedZone: TransitZone | undefined;
  if (nearest.stop.zoneCode) {
    matchedZone = zones.find((z) => z.code === nearest.stop.zoneCode);
  }

  // If stop didn't have a direct zone match, resolve by radial corridor distance to campus
  if (!matchedZone) {
    if (distanceToCampusKm <= 5) {
      matchedZone = zones.find((z) => z.code === "ZONE_D");
    } else if (distanceToCampusKm <= 15) {
      matchedZone = zones.find((z) => z.code === "ZONE_C");
    } else if (distanceToCampusKm <= 28) {
      matchedZone = zones.find((z) => z.code === "ZONE_B");
    } else {
      matchedZone = zones.find((z) => z.code === "ZONE_A");
    }
  }

  // Fallback to Zone B (standard urban corridor)
  const finalZone = matchedZone || zones[1] || zones[0] || {
    id: "zone-b",
    code: "ZONE_B",
    name: "Zone B: Haldwani City & Mukhani Corridor",
    semesterFee: 12000,
    installmentsAllowed: 3,
  };

  return {
    homeLatitude: homeLat,
    homeLongitude: homeLng,
    nearestStop: nearest.stop,
    walkingDistanceMeters: nearest.distMeters,
    walkingTimeMins: nearest.walkMins,
    assignedRoute: matchingRoute,
    assignedZone: finalZone,
    semesterFee: finalZone.semesterFee,
    distanceToCampusKm,
  };
}

