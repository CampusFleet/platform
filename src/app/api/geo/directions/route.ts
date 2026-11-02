import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/**
 * GET /api/geo/directions?coords=lat1,lng1;lat2,lng2...
 * Returns authentic road-following coordinates:
 * 1. Google Routes API (if GOOGLE_MAPS_API_KEY is configured)
 * 2. High-speed OSRM driving engine mirrors
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const coordsParam = searchParams.get("coords");

    if (!coordsParam) {
      return NextResponse.json({ success: false, message: "Missing coords query parameter" }, { status: 400 });
    }

    const rawPairs = coordsParam.split(";").map((p) => p.trim()).filter(Boolean);
    if (rawPairs.length < 2) {
      return NextResponse.json({ success: false, message: "At least 2 coordinate points required" }, { status: 400 });
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
      return NextResponse.json({ success: false, message: "Invalid coordinate pairs" }, { status: 400 });
    }

    // 1. Try Google Routes API if key is present
    const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (googleKey) {
      try {
        const intermediates = waypoints.slice(1, -1).map((w) => ({
          location: { latLng: { latitude: w[0], longitude: w[1] } },
        }));

        const payload = {
          origin: { location: { latLng: { latitude: waypoints[0][0], longitude: waypoints[0][1] } } },
          destination: { location: { latLng: { latitude: waypoints[waypoints.length - 1][0], longitude: waypoints[waypoints.length - 1][1] } } },
          intermediates,
          travelMode: "DRIVE",
        };

        const gRes = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleKey,
            "X-Goog-FieldMask": "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });

        if (gRes.ok) {
          const gData = await gRes.json();
          const encoded = gData?.routes?.[0]?.polyline?.encodedPolyline;
          if (encoded) {
            const decoded = decodeGooglePolyline(encoded);
            if (decoded.length >= 2) {
              return NextResponse.json({
                success: true,
                provider: "google",
                coordinates: decoded,
                distanceMeters: gData.routes[0].distanceMeters,
                duration: gData.routes[0].duration,
              });
            }
          }
        }
      } catch (gErr) {
        console.warn("[/api/geo/directions] Google API failed or timed out:", gErr);
      }
    }

    // 2. OSRM driving engine mirrors
    const osrmString = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
    const endpoints = [
      `https://router.project-osrm.org/route/v1/driving/${osrmString}?overview=full&geometries=geojson`,
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${osrmString}?overview=full&geometries=geojson`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json();
          if (data?.routes?.[0]?.geometry?.coordinates) {
            const snapped: [number, number][] = data.routes[0].geometry.coordinates.map(
              ([lng, lat]: [number, number]) => [lat, lng]
            );
            if (snapped.length >= 2) {
              return NextResponse.json({
                success: true,
                provider: "osrm",
                coordinates: snapped,
                distanceMeters: data.routes[0].distance,
                durationSeconds: data.routes[0].duration,
              });
            }
          }
        }
      } catch {
        // try next endpoint
      }
    }

    // Return input waypoints as fallback
    return NextResponse.json({
      success: true,
      provider: "fallback_waypoints",
      coordinates: waypoints,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Internal error" }, { status: 500 });
  }
}
