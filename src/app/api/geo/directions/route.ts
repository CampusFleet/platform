import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// In-memory cache to guarantee sub-millisecond route response and save Google Maps quota
const directionsCache = new Map<string, {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  timestamp: number;
}>();

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours (roads don't change frequently)

/**
 * Decodes Google's Encoded Polyline format into [latitude, longitude] pairs
 */
function decodeGooglePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push([Number((lat / 1e5).toFixed(6)), Number((lng / 1e5).toFixed(6))]);
  }

  return points;
}

/**
 * GET /api/geo/directions?coords=lat1,lng1;lat2,lng2...&mode=walk|drive
 * Exclusively uses Google Maps Routes API (Directions v2) with official Google Roads snapping.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const coordsParam = searchParams.get("coords");
    const modeParam = (searchParams.get("mode") || "drive").toLowerCase();
    const isWalk = modeParam === "walk" || modeParam === "foot" || modeParam === "pedestrian";

    if (!coordsParam) {
      return NextResponse.json(
        { success: false, message: "Missing coords query parameter" },
        { status: 400 }
      );
    }

    const cacheKey = `${coordsParam}:${isWalk ? "WALK" : "DRIVE"}`;
    const cached = directionsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        provider: "google_cache",
        mode: isWalk ? "walk" : "drive",
        coordinates: cached.coordinates,
        distanceMeters: cached.distanceMeters,
        durationSeconds: cached.durationSeconds,
      });
    }

    const rawPairs = coordsParam.split(";").map((p) => p.trim()).filter(Boolean);
    if (rawPairs.length < 2) {
      return NextResponse.json(
        { success: false, message: "At least 2 coordinate points required" },
        { status: 400 }
      );
    }

    const waypoints: [number, number][] = [];
    for (const pair of rawPairs) {
      const parts = pair.split(",");
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          waypoints.push([lat, lng]);
        }
      }
    }

    if (waypoints.length < 2) {
      return NextResponse.json(
        { success: false, message: "Invalid coordinate pairs" },
        { status: 400 }
      );
    }

    const googleKey =
      process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!googleKey) {
      console.warn("[/api/geo/directions] GOOGLE_MAPS_API_KEY not set");
      return NextResponse.json({
        success: true,
        provider: "fallback_waypoints",
        mode: isWalk ? "walk" : "drive",
        coordinates: waypoints,
      });
    }

    let referer =
      req.headers.get("referer") ||
      req.headers.get("origin") ||
      "https://campusfleet.vercel.app/";

    // Ensure referer conforms to Google Cloud Console HTTP Referer whitelist (*campusfleet.vercel.app*)
    if (!referer.includes("campusfleet.vercel.app")) {
      referer = "https://campusfleet.vercel.app/";
    }

    // Google Routes API limits intermediate stops to 25
    const maxIntermediates = 25;
    let intermediates = waypoints.slice(1, -1);
    if (intermediates.length > maxIntermediates) {
      const step = Math.ceil(intermediates.length / maxIntermediates);
      intermediates = intermediates
        .filter((_, idx) => idx % step === 0)
        .slice(0, maxIntermediates);
    }

    const payload = {
      origin: {
        location: {
          latLng: { latitude: waypoints[0][0], longitude: waypoints[0][1] },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: waypoints[waypoints.length - 1][0],
            longitude: waypoints[waypoints.length - 1][1],
          },
        },
      },
      intermediates: intermediates.map((w) => ({
        location: { latLng: { latitude: w[0], longitude: w[1] } },
      })),
      travelMode: isWalk ? "WALK" : "DRIVE",
      routingPreference: isWalk ? undefined : "TRAFFIC_UNAWARE",
    };

    const gRes = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleKey,
          "X-Goog-FieldMask":
            "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
          Referer: referer,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(9000),
      }
    );

    if (gRes.ok) {
      const gData = await gRes.json();
      const encoded = gData?.routes?.[0]?.polyline?.encodedPolyline;
      if (encoded) {
        const decoded = decodeGooglePolyline(encoded);
        if (decoded.length >= 2) {
          const distanceMeters = Number(gData.routes[0].distanceMeters) || 0;
          const durSeconds =
            typeof gData.routes[0].duration === "string"
              ? parseInt(gData.routes[0].duration.replace(/\D/g, ""), 10) || 0
              : Number(gData.routes[0].duration) || 0;

          // Save to LRU cache
          if (directionsCache.size > 200) {
            const firstKey = directionsCache.keys().next().value;
            if (firstKey) directionsCache.delete(firstKey);
          }
          directionsCache.set(cacheKey, {
            coordinates: decoded,
            distanceMeters,
            durationSeconds: durSeconds,
            timestamp: Date.now(),
          });

          return NextResponse.json({
            success: true,
            provider: "google",
            mode: isWalk ? "walk" : "drive",
            coordinates: decoded,
            distanceMeters,
            durationSeconds: durSeconds,
          });
        }
      }
    } else {
      const errBody = await gRes.text().catch(() => "");
      console.warn(`[/api/geo/directions] Google API returned ${gRes.status}:`, errBody);
    }

    // Direct fallback to waypoints if Google API encounters any network error
    return NextResponse.json({
      success: true,
      provider: "fallback_waypoints",
      mode: isWalk ? "walk" : "drive",
      coordinates: waypoints,
    });
  } catch (error: any) {
    console.error("[/api/geo/directions] Error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal error" },
      { status: 500 }
    );
  }
}
