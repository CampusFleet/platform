/**
 * CampusFleet Intelligent Zone & Route Detector
 * 
 * Automatically resolves:
 * 1. Nearest Transit Stop from Student Home Pin (Geospatial Haversine).
 * 2. Assigned Transit Route containing that stop.
 * 3. Assigned Transit Zone & Semester Fee (Zero manual user dropdown required).
 * 4. First-mile walking distance and duration.
 * 5. Campus boundary & service area verification (Prevents Dehradun stops assigned to Bhimtal commuters).
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
  isOutOfServiceArea?: boolean;
  serviceAreaWarning?: string | null;
}

/**
 * Automatically computes zone, route, and nearest pickup stop from home coordinates
 * with strict campus corridor isolation.
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

  // 1. Campus Isolation Filter
  // Ensures a Bhimtal student is never assigned a Dehradun stop 135km away and vice-versa
  const campusName = ((campus as any)?.name || "").toLowerCase();
  const campusId = String((campus as any)?.id || "").toLowerCase();
  const isDehradun = campusName.includes("dehradun") || campusId.includes("dehradun") || campusId.includes("geu");
  const isBhimtal = campusName.includes("bhimtal") || campusName.includes("haldwani") || campusId.includes("bhimtal");

  let candidateStops = stops;
  let candidateRoutes = routes;

  if (isDehradun || isBhimtal) {
    const campusFilteredStops = stops.filter((s) => {
      const sCampusId = String(s.campusId || "").toLowerCase();
      if (sCampusId && (sCampusId === campusId || (isDehradun && sCampusId.includes("dehradun")) || (isBhimtal && sCampusId.includes("bhimtal")))) {
        return true;
      }
      const sName = (s.name || "").toLowerCase();
      if (isDehradun && (sName.includes("dehradun") || sName.includes("clement") || sName.includes("bell road") || sName.includes("subhash nagar"))) return true;
      if (isBhimtal && (sName.includes("bhimtal") || sName.includes("haldwani") || sName.includes("nainital") || sName.includes("kathgodam") || sName.includes("mukhani") || sName.includes("lamachaur") || sName.includes("lalkuan") || sName.includes("tallital"))) return true;
      return false;
    });

    if (campusFilteredStops.length > 0) {
      candidateStops = campusFilteredStops;
    }

    const campusFilteredRoutes = routes.filter((r) => {
      const rCampusId = String(r.campusId || "").toLowerCase();
      if (rCampusId && (rCampusId === campusId || (isDehradun && rCampusId.includes("dehradun")) || (isBhimtal && rCampusId.includes("bhimtal")))) {
        return true;
      }
      const rName = (r.name || "").toLowerCase();
      if (isDehradun && (rName.includes("dehradun") || rName.includes("geu") || rName.includes("clement"))) return true;
      if (isBhimtal && (rName.includes("bhimtal") || rName.includes("haldwani") || rName.includes("lamachaur") || rName.includes("lalkuan") || rName.includes("kathgodam"))) return true;
      return false;
    });

    if (campusFilteredRoutes.length > 0) {
      candidateRoutes = campusFilteredRoutes;
    }
  }

  // 2. Calculate distance to eligible stops and sort by shortest road proximity
  const sortedStops = candidateStops
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

  // 3. Resolve matching route containing this stop from candidateRoutes
  let matchingRoute: Route | null = null;
  for (const route of candidateRoutes) {
    if (route.stops && route.stops.some((rs: any) => (rs.stopId || rs.stop_id) === nearest.stop.id)) {
      matchingRoute = route;
      break;
    }
  }

  // Fallback to any route containing this stop
  if (!matchingRoute) {
    for (const route of routes) {
      if (route.stops && route.stops.some((rs: any) => (rs.stopId || rs.stop_id) === nearest.stop.id)) {
        matchingRoute = route;
        break;
      }
    }
  }

  // Fallback to first candidate route
  if (!matchingRoute && candidateRoutes.length > 0) {
    matchingRoute = candidateRoutes[0];
  }

  // 4. Distance to Campus Terminal
  const campusLat = (campus as any)?.latitude || 29.375015;
  const campusLng = (campus as any)?.longitude || 79.529479;
  const distanceToCampusKm = Math.round(calculateHaversineDistanceKm(homeLat, homeLng, campusLat, campusLng) * 10) / 10;

  // 5. Out of Regular Walking / Service Radius Detection
  // If home is farther than 15km from the nearest shuttle stop (e.g. hometown in another city),
  // flag it so the UI does not display ridiculous walking estimates (e.g. 135 km walk)
  const isOutOfServiceArea = nearest.distKm > 15;
  const serviceAreaWarning = isOutOfServiceArea
    ? `Your home address is ~${Math.round(nearest.distKm)}km from the nearest transit corridor stop (${nearest.stop.name}). Daily door-to-door shuttle is only available along active corridors; you may board at ${nearest.stop.name}.`
    : null;

  // 6. Resolve Transit Zone
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
    isOutOfServiceArea,
    serviceAreaWarning,
  };
}
