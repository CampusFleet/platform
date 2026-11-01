import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRoadDistance,
  getRoute,
  getDistanceMatrix,
  Coordinate,
} from "../lib/road-distance";

describe("Road Distance Provider & Anti-Corruption Isolation", () => {
  const sampleOrigin: Coordinate = { latitude: 29.3750, longitude: 79.5295 };
  const sampleDest: Coordinate = { latitude: 29.2183, longitude: 79.5130 };

  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("produces pure math provenance with isGoogleAuthoritative=false when ROUTING_PROVIDER=haversine", async () => {
    process.env.ROUTING_PROVIDER = "haversine";
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    const res = await getRoadDistance(sampleOrigin, sampleDest);

    expect(res.provider).toBe("haversine");
    expect(res.sourceProvenance).toBe("haversine_math");
    expect(res.isGoogleAuthoritative).toBe(false);
    expect(res.isDegradedFallback).toBe(false);
    expect(res.roadDistanceKm).toBeGreaterThan(0);
    expect(res.straightLineKm).toBeGreaterThan(0);
  });

  it("produces multi-stop route with pure math provenance when ROUTING_PROVIDER=haversine", async () => {
    process.env.ROUTING_PROVIDER = "haversine";

    const waypoints: Coordinate[] = [
      sampleOrigin,
      { latitude: 29.2800, longitude: 79.5200 },
      sampleDest,
    ];

    const route = await getRoute(waypoints);

    expect(route.provider).toBe("haversine");
    expect(route.sourceProvenance).toBe("haversine_math");
    expect(route.isGoogleAuthoritative).toBe(false);
    expect(route.isDegradedFallback).toBe(false);
    expect(route.legDistancesKm.length).toBe(2);
    expect(route.totalDistanceKm).toBeGreaterThan(0);
  });

  it("handles distance matrix with pure math provenance when ROUTING_PROVIDER=haversine", async () => {
    process.env.ROUTING_PROVIDER = "haversine";

    const origins: Coordinate[] = [sampleOrigin];
    const destinations: Coordinate[] = [sampleDest];

    const matrix = await getDistanceMatrix(origins, destinations);

    expect(matrix.provider).toBe("haversine");
    expect(matrix.sourceProvenance).toBe("haversine_math");
    expect(matrix.isGoogleAuthoritative).toBe(false);
    expect(matrix.isDegradedFallback).toBe(false);
    expect(matrix.distancesKm.length).toBe(1);
    expect(matrix.distancesKm[0].length).toBe(1);
  });

  it("strictly flags emergency fallbacks as isDegradedFallback=true and NEVER claims Google authority", async () => {
    process.env.ROUTING_PROVIDER = "google";
    process.env.GOOGLE_MAPS_API_KEY = "test_invalid_key";

    // Mock fetch to simulate Google API failure (e.g., 403 or network error)
    global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout or invalid key"));

    const res = await getRoadDistance(sampleOrigin, sampleDest);

    // Provenance assertion: Emergency fallback must declare degraded status
    expect(res.isDegradedFallback).toBe(true);
    expect(res.isGoogleAuthoritative).toBe(false);
    expect(res.sourceProvenance).toBe("haversine_math");
    expect(res.provider).toBe("haversine");
  });

  it("returns authoritative Google provenance when Google Routes API succeeds", async () => {
    process.env.ROUTING_PROVIDER = "google";
    process.env.GOOGLE_MAPS_API_KEY = "mock_valid_key";

    // Mock successful Google Routes API response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        routes: [
          {
            distanceMeters: 24500,
            duration: "2100s",
          },
        ],
      }),
    });

    const res = await getRoadDistance(sampleOrigin, sampleDest);

    expect(res.provider).toBe("google");
    expect(res.sourceProvenance).toBe("google_routes_api");
    expect(res.isGoogleAuthoritative).toBe(true);
    expect(res.isDegradedFallback).toBe(false);
    expect(res.roadDistanceKm).toBe(24.5);
    expect(res.durationMins).toBe(35);
  });
});
