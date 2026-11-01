import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/redis";
import {
  saveLiveLocationToMongo,
  getLiveLocationFromMongo,
  getAllLiveLocationsFromMongo,
  getBusBreadcrumbsFromMongo,
  getMongoTelemetryStats,
} from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/**
 * GET /api/telematics/live
 * Fetches live GPS tracking data for a specific bus or all active buses.
 * Tier 1: Redis In-Memory Cache (ultra-low latency <5ms for high-frequency student polling).
 * Tier 2: MongoDB (persistent geospatial document store & historical breadcrumb trail).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const busId = searchParams.get("busId");
    const history = searchParams.get("history") === "true";
    const all = searchParams.get("all") === "true";
    const stats = searchParams.get("stats") === "true";

    // 0. Fetch MongoDB cluster telemetry sync stats (for Driver & Fleet Ops Cockpit)
    if (stats) {
      const telemetryStats = await getMongoTelemetryStats(busId || undefined);
      return NextResponse.json({ success: true, stats: telemetryStats });
    }

    // 1. Fetch historical GPS breadcrumbs for polyline map rendering
    if (history && busId) {
      const breadcrumbs = await getBusBreadcrumbsFromMongo(busId, 50);
      return NextResponse.json({ success: true, breadcrumbs });
    }

    // 2. Fetch all active buses
    if (all || !busId) {
      const allLocations = await getAllLiveLocationsFromMongo();
      return NextResponse.json(
        { success: true, locations: allLocations },
        {
          status: 200,
          headers: {
            "Cache-Control": "private, max-age=3, stale-while-revalidate=5",
          },
        }
      );
    }

    // 3. Fetch specific bus location: Redis first, MongoDB fallback
    const strBusId = String(busId).trim();
    const candidateKeys = [
      `telematics:bus:${strBusId}`,
      `telematics:bus:${strBusId.toLowerCase()}`,
      `telematics:bus:bus-${strBusId}`,
      `telematics:bus:Bus ${strBusId}`,
    ];

    let liveLocation: any = null;
    for (const key of candidateKeys) {
      liveLocation = await cacheGet(key).catch(() => null);
      if (liveLocation) break;
    }

    if (!liveLocation) {
      // Fallback to MongoDB
      const mongoDoc = await getLiveLocationFromMongo(strBusId);
      if (mongoDoc) {
        liveLocation = {
          ...mongoDoc,
          timestamp: mongoDoc.updatedAt ? new Date(mongoDoc.updatedAt).toISOString() : new Date().toISOString(),
        };
        // Warm Redis cache for 60 seconds across primary keys
        await Promise.all([
          cacheSet(`telematics:bus:${strBusId}`, liveLocation, 60),
          cacheSet(`telematics:bus:${strBusId.toLowerCase()}`, liveLocation, 60),
        ]).catch(() => {});
      }
    }

    const latestRfid = await cacheGet(`telematics:rfid:latest:${strBusId}`).catch(() => null);

    return NextResponse.json(
      { success: true, liveLocation: liveLocation || null, location: liveLocation || null, latestRfid: latestRfid || null },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=2, stale-while-revalidate=5",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/telematics/live
 * Driver's smartphone / AIS-140 GPS telematics hardware pushes coordinates here.
 * - Caches in Redis for high-concurrency student reads (<5ms).
 * - Persists to MongoDB Atlas for 24-hour auto-expiring breadcrumbs and multi-database isolation.
 * - Records driver identity, bus details, GPS accuracy, and movement telemetry.
 * - Zero impact on Supabase PostgreSQL tables or Supabase Realtime WebSocket message limits!
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      busId,
      tripId,
      driverId,
      driverName,
      busNumber,
      accuracy,
      latitude,
      longitude,
      speedKmh,
      headingDeg,
      currentStopId,
      delayMinutes,
      timestamp,
    } = body;

    if (!busId || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { success: false, error: "busId, latitude, and longitude are required." },
        { status: 400 }
      );
    }

    const locationData = {
      busId,
      tripId,
      driverId: driverId || undefined,
      driverName: driverName || undefined,
      busNumber: busNumber || undefined,
      accuracy: accuracy != null ? Number(accuracy) : undefined,
      latitude: Number(latitude),
      longitude: Number(longitude),
      speedKmh: speedKmh != null ? Number(speedKmh) : 0,
      headingDeg: headingDeg != null ? Number(headingDeg) : 0,
      currentStopId,
      delayMinutes: delayMinutes != null ? Number(delayMinutes) : 0,
      timestamp: timestamp || new Date().toISOString(),
    };

    // 1. Store in Redis with a 120-second TTL for live bus GPS verification
    const strBusId = String(busId).trim();
    const redisPromises = [
      cacheSet(`telematics:bus:${strBusId}`, locationData, 120),
      cacheSet(`telematics:bus:${strBusId.toLowerCase()}`, locationData, 120),
      cacheSet(`telematics:bus:bus-${strBusId}`, locationData, 120),
      cacheSet(`telematics:bus:Bus ${strBusId}`, locationData, 120),
    ];
    if (busNumber) {
      const strBusNum = String(busNumber).trim();
      redisPromises.push(cacheSet(`telematics:bus:${strBusNum}`, locationData, 120));
      redisPromises.push(cacheSet(`telematics:bus:${strBusNum.toLowerCase()}`, locationData, 120));
      const numericOnly = strBusNum.replace(/[^0-9]/g, "");
      if (numericOnly) {
        redisPromises.push(cacheSet(`telematics:bus:${numericOnly}`, locationData, 120));
      }
    }
    await Promise.all(redisPromises).catch(() => {});

    // 2. Persist to MongoDB (both latest position and 24h breadcrumb trail)
    saveLiveLocationToMongo({
      busId: locationData.busId,
      tripId: locationData.tripId,
      driverId: locationData.driverId,
      driverName: locationData.driverName,
      busNumber: locationData.busNumber,
      accuracy: locationData.accuracy,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      speedKmh: locationData.speedKmh,
      headingDeg: locationData.headingDeg,
      currentStopId: locationData.currentStopId,
      delayMinutes: locationData.delayMinutes,
    }).catch((err) => {
      console.warn("Async MongoDB telematics write warning:", err);
    });

    return NextResponse.json({ success: true, location: locationData });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
