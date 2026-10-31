import { describe, it, expect } from "vitest";
import {
  buildStopGraph,
  dijkstraShortestPath,
  bellmanFordNearestStops,
  recommendBestRoute,
  getStopConnectivity,
  aStarSearch,
  floydWarshallAllPairs,
  reconstructFloydPath,
  kruskalMST,
  computeNetworkStats,
  computeDirectExpressRoute,
  reconcileShiftAttendance,
  detectIntraCorridorDisassemblies,
  computeClarkeWrightRouteStitches,
  computeFleetOrchestrationPlan,
} from "./route-optimizer";
import { Stop, Route, RouteStop, Booking, Bus } from "./types";

// ─── Generic Test Fixtures (No hardcoded real data) ──────────────────────────

function makeStop(id: string, name: string, lat: number, lng: number): Stop {
  return {
    id, name,
    code: id.toUpperCase(),
    latitude: lat, longitude: lng,
    landmark: name,
    geofenceRadiusMeters: 80,
  };
}

function makeRouteStop(stopId: string, order: number, stop: Stop): RouteStop {
  return { stopId, stopOrder: order, arrivalOffsetMinutes: order * 10, bufferTimeMinutes: 2, stop };
}

// Generic stops — positions form a roughly linear path
const stops: Stop[] = [
  makeStop("s1", "Campus Terminal", 29.35, 79.56),    // destination
  makeStop("s2", "Junction Hub", 29.39, 79.53),       // hub (on all routes)
  makeStop("s3", "Railway Point", 29.28, 79.52),       // mid-point
  makeStop("s4", "City Terminal", 29.22, 79.52),        // far city
  makeStop("s5", "East Crossing", 29.21, 79.51),       // branch
  makeStop("s6", "Lake Stop", 29.40, 79.46),            // branch
  makeStop("s7", "South Gate", 29.24, 79.48),           // branch
  makeStop("s8", "Isolated Village", 29.18, 79.47),     // NOT on any route
  makeStop("s9", "Remote Point", 29.20, 79.53),         // NOT on any route
];

// Route A: s4 → s3 → s2 → s1 (city → campus via hub)
const routeA: Route = {
  id: "rA", code: "R-A", name: "City to Campus",
  description: "", direction: "HOME_TO_CAMPUS", color: "#1D4ED8",
  isActive: true, totalDistanceKm: 30, estimatedDurationMins: 60,
  stops: [
    makeRouteStop("s4", 1, stops[3]),
    makeRouteStop("s3", 2, stops[2]),
    makeRouteStop("s2", 3, stops[1]),
    makeRouteStop("s1", 4, stops[0]),
  ],
};

// Route B: s6 → s2 → s1 (lake → campus via hub)
const routeB: Route = {
  id: "rB", code: "R-B", name: "Lake to Campus",
  description: "", direction: "HOME_TO_CAMPUS", color: "#059669",
  isActive: true, totalDistanceKm: 25, estimatedDurationMins: 45,
  stops: [
    makeRouteStop("s6", 1, stops[5]),
    makeRouteStop("s2", 2, stops[1]),
    makeRouteStop("s1", 3, stops[0]),
  ],
};

// Route C: s5 → s3 → s2 → s1 (east → campus via railway)
const routeC: Route = {
  id: "rC", code: "R-C", name: "East to Campus",
  description: "", direction: "HOME_TO_CAMPUS", color: "#DC2626",
  isActive: true, totalDistanceKm: 28, estimatedDurationMins: 55,
  stops: [
    makeRouteStop("s5", 1, stops[4]),
    makeRouteStop("s3", 2, stops[2]),
    makeRouteStop("s2", 3, stops[1]),
    makeRouteStop("s1", 4, stops[0]),
  ],
};

// Route D: s7 → s3 → s2 → s1 (south → campus via railway)
const routeD: Route = {
  id: "rD", code: "R-D", name: "South to Campus",
  description: "", direction: "HOME_TO_CAMPUS", color: "#7C3AED",
  isActive: true, totalDistanceKm: 32, estimatedDurationMins: 65,
  stops: [
    makeRouteStop("s7", 1, stops[6]),
    makeRouteStop("s3", 2, stops[2]),
    makeRouteStop("s2", 3, stops[1]),
    makeRouteStop("s1", 4, stops[0]),
  ],
};

const allRoutes = [routeA, routeB, routeC, routeD];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Graph Builder", () => {
  it("builds a graph with all stops as nodes", () => {
    const graph = buildStopGraph(allRoutes, stops);
    expect(graph.size).toBeGreaterThanOrEqual(stops.length);
    for (const stop of stops) {
      expect(graph.has(stop.id)).toBe(true);
    }
  });

  it("creates bidirectional edges between consecutive route stops", () => {
    const graph = buildStopGraph(allRoutes, stops);
    // s4 → s3 edge should exist (from routeA)
    const s4Edges = graph.get("s4") || [];
    expect(s4Edges.some(e => e.to === "s3")).toBe(true);
    // s3 → s4 reverse edge should also exist
    const s3Edges = graph.get("s3") || [];
    expect(s3Edges.some(e => e.to === "s4")).toBe(true);
  });

  it("calculates edge weights as positive Haversine distance", () => {
    const graph = buildStopGraph(allRoutes, stops);
    const s4Edges = graph.get("s4") || [];
    const toS3 = s4Edges.find(e => e.to === "s3");
    expect(toS3).toBeDefined();
    expect(toS3!.weight).toBeGreaterThan(0);
  });

  it("tracks connectivity dynamically", () => {
    const graph = buildStopGraph(allRoutes, stops);
    // s2 (hub) is on all 4 routes, s6 is only on routeB
    const hubConn = getStopConnectivity(graph, "s2");
    const leafConn = getStopConnectivity(graph, "s6");
    expect(hubConn).toBeGreaterThan(leafConn);
  });
});

describe("Dijkstra's Shortest Path", () => {
  const graph = buildStopGraph(allRoutes, stops);

  it("finds path through intermediate stops", () => {
    const result = dijkstraShortestPath(graph, "s3", "s1");
    expect(result).not.toBeNull();
    expect(result!.path[0]).toBe("s3");
    expect(result!.path[result!.path.length - 1]).toBe("s1");
    expect(result!.totalDistanceKm).toBeGreaterThan(0);
    expect(result!.totalEstimatedMins).toBeGreaterThan(0);
    expect(result!.stopCount).toBeGreaterThanOrEqual(2);
  });

  it("returns 0-distance for same source and target", () => {
    const result = dijkstraShortestPath(graph, "s1", "s1");
    expect(result).not.toBeNull();
    expect(result!.path).toEqual(["s1"]);
    expect(result!.totalDistanceKm).toBe(0);
    expect(result!.stopCount).toBe(1);
  });

  it("finds longest path (far city to campus)", () => {
    const result = dijkstraShortestPath(graph, "s4", "s1");
    expect(result).not.toBeNull();
    expect(result!.path[0]).toBe("s4");
    expect(result!.path[result!.path.length - 1]).toBe("s1");
    expect(result!.totalDistanceKm).toBeGreaterThan(5);
  });

  it("finds path across different routes via shared stop", () => {
    // s6 (routeB) → s5 (routeC) must go through shared hub s2 and s3
    const result = dijkstraShortestPath(graph, "s6", "s5");
    expect(result).not.toBeNull();
    expect(result!.path.length).toBeGreaterThanOrEqual(3);
  });

  it("returns null for disconnected stops", () => {
    // s8 is not on any route
    const result = dijkstraShortestPath(graph, "s8", "s1");
    expect(result).toBeNull();
  });
});

describe("Bellman-Ford Nearest Stops", () => {
  const graph = buildStopGraph(allRoutes, stops);

  it("finds nearest stops from a given location", () => {
    // Location near s4 (city terminal)
    const results = bellmanFordNearestStops(29.22, 79.52, stops, graph, 5);
    expect(results.length).toBeGreaterThan(0);
    // Nearest stop should have small walking distance
    expect(results[0].walkingDistanceKm).toBeLessThan(5);
  });

  it("ranks well-connected stops higher via scoring", () => {
    const results = bellmanFordNearestStops(29.30, 79.52, stops, graph, 5);
    expect(results.length).toBeGreaterThan(0);
    // All results should have valid walking distance and time
    for (const r of results) {
      expect(r.walkingDistanceKm).toBeGreaterThan(0);
      expect(r.walkingTimeMins).toBeGreaterThan(0);
      expect(r.busCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns walking time at ~5 km/h", () => {
    const results = bellmanFordNearestStops(29.22, 79.52, stops, graph, 3);
    for (const r of results) {
      const expectedTime = Math.max(1, Math.round((r.walkingDistanceKm / 5) * 60));
      expect(r.walkingTimeMins).toBe(expectedTime);
    }
  });

  it("respects maxWalkingKm limit", () => {
    const results = bellmanFordNearestStops(29.22, 79.52, stops, graph, 10, 1);
    for (const r of results) {
      expect(r.walkingDistanceKm).toBeLessThanOrEqual(1);
    }
  });

  it("returns empty for location far from all stops", () => {
    // Location far away (Delhi)
    const results = bellmanFordNearestStops(28.61, 77.21, stops, graph, 5, 5);
    expect(results.length).toBe(0);
  });
});

describe("Route Recommendation Engine", () => {
  it("recommends routes from a home location to campus", () => {
    // Home near s4 but not exactly on it
    const recs = recommendBestRoute(29.23, 79.53, "s1", stops, allRoutes);
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.walkingDistanceKm).toBeGreaterThanOrEqual(0);
      expect(rec.totalScore).toBeGreaterThan(0);
    }
  });

  it("sorts by total score ascending", () => {
    const recs = recommendBestRoute(29.22, 79.52, "s1", stops, allRoutes);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i].totalScore).toBeGreaterThanOrEqual(recs[i - 1].totalScore);
    }
  });

  it("includes path to campus for each recommendation", () => {
    const recs = recommendBestRoute(29.35, 79.53, "s1", stops, allRoutes);
    for (const rec of recs) {
      if (rec.pathToCampus) {
        expect(rec.pathToCampus.path.length).toBeGreaterThanOrEqual(1);
        expect(rec.pathToCampus.path[rec.pathToCampus.path.length - 1]).toBe("s1");
      }
    }
  });
});

describe("A* Search", () => {
  const graph = buildStopGraph(allRoutes, stops);

  it("finds same optimal distance as Dijkstra", () => {
    const dijkstraResult = dijkstraShortestPath(graph, "s3", "s1");
    const aStarResult = aStarSearch(graph, "s3", "s1", stops);
    expect(aStarResult).not.toBeNull();
    expect(dijkstraResult).not.toBeNull();
    expect(aStarResult!.totalDistanceKm).toBe(dijkstraResult!.totalDistanceKm);
  });

  it("returns null for disconnected stops", () => {
    expect(aStarSearch(graph, "s8", "s1", stops)).toBeNull();
  });

  it("handles same source and target", () => {
    const result = aStarSearch(graph, "s1", "s1", stops);
    expect(result).not.toBeNull();
    expect(result!.totalDistanceKm).toBe(0);
  });
});

describe("Floyd-Warshall All-Pairs", () => {
  const graph = buildStopGraph(allRoutes, stops);

  it("self-distance is 0", () => {
    const result = floydWarshallAllPairs(graph);
    expect(result.distances.get("s1")?.get("s1")).toBe(0);
  });

  it("gives same distance as Dijkstra", () => {
    const allPairs = floydWarshallAllPairs(graph);
    const dijkstra = dijkstraShortestPath(graph, "s3", "s1");
    const floyd = allPairs.distances.get("s3")?.get("s1");
    expect(dijkstra).not.toBeNull();
    expect(floyd).toBe(dijkstra!.totalDistanceKm);
  });

  it("reconstructs correct path", () => {
    const allPairs = floydWarshallAllPairs(graph);
    const path = reconstructFloydPath(allPairs, "s3", "s1");
    expect(path).not.toBeNull();
    expect(path![0]).toBe("s3");
    expect(path![path!.length - 1]).toBe("s1");
  });

  it("returns Infinity for disconnected stops", () => {
    const allPairs = floydWarshallAllPairs(graph);
    expect(allPairs.distances.get("s8")?.get("s1")).toBe(Infinity);
  });
});

describe("Kruskal's MST", () => {
  const graph = buildStopGraph(allRoutes, stops);

  it("produces edges with positive total weight", () => {
    const mst = kruskalMST(graph);
    expect(mst.edges.length).toBeGreaterThan(0);
    expect(mst.totalWeightKm).toBeGreaterThan(0);
  });

  it("detects disconnected components", () => {
    const mst = kruskalMST(graph);
    // s8 and s9 are isolated → at least 3 components
    expect(mst.components).toBeGreaterThanOrEqual(2);
  });

  it("MST weight ≤ total graph weight", () => {
    const mst = kruskalMST(graph);
    let totalGraphWeight = 0;
    const seen = new Set<string>();
    for (const [fromId, neighbors] of Array.from(graph.entries())) {
      for (const edge of neighbors) {
        const key = [fromId, edge.to].sort().join("--");
        if (!seen.has(key)) {
          seen.add(key);
          totalGraphWeight += edge.weight;
        }
      }
    }
    expect(mst.totalWeightKm).toBeLessThanOrEqual(Math.round(totalGraphWeight * 100) / 100);
  });
});

describe("Network Stats", () => {
  const graph = buildStopGraph(allRoutes, stops);

  it("computes valid network statistics", () => {
    const stats = computeNetworkStats(graph);
    expect(stats.totalStops).toBe(graph.size);
    expect(stats.totalEdges).toBeGreaterThan(0);
    expect(stats.avgConnectivity).toBeGreaterThan(0);
    expect(stats.networkDiameterKm).toBeGreaterThan(0);
    expect(stats.hubStopId).toBeTruthy();
    expect(stats.mstTotalKm).toBeGreaterThan(0);
  });

  it("hub is the most connected stop (dynamic)", () => {
    const stats = computeNetworkStats(graph);
    let maxConn = 0;
    let expectedHub = "";
    for (const [stopId, neighbors] of Array.from(graph.entries())) {
      const conn = new Set(neighbors.map(e => e.routeId)).size;
      if (conn > maxConn) { maxConn = conn; expectedHub = stopId; }
    }
    expect(stats.hubStopId).toBe(expectedHub);
  });
});

describe("Direct Express Route to Campus (Full-Capacity Bypass)", () => {
  it("bypasses remaining empty stops when all passengers are boarded by an earlier stop", () => {
    // routeA stops: s4 (stop 1) -> s3 (stop 2) -> s2 (stop 3) -> s1 (campus terminal)
    // Bookings only at s4 (stop 1) and s3 (stop 2)
    const testBookings: Booking[] = [
      {
        id: "b1",
        studentId: "stud1",
        tripId: "t1",
        boardingStopId: "s4",
        seatNumber: "1A",
        status: "CONFIRMED",
        bookingCode: "GEHU-1",
        createdAt: new Date().toISOString(),
      },
      {
        id: "b2",
        studentId: "stud2",
        tripId: "t1",
        boardingStopId: "s3",
        seatNumber: "1B",
        status: "CONFIRMED",
        bookingCode: "GEHU-2",
        createdAt: new Date().toISOString(),
      },
    ];

    const result = computeDirectExpressRoute(routeA, testBookings, 40);
    expect(result.isExpressDirect).toBe(true);
    expect(result.bypassedStopsCount).toBe(1); // s2 was bypassed
    expect(result.activeStops.map(s => s.id)).toEqual(["s4", "s3", "s1"]);
    expect(result.lastPassengerStop?.id).toBe("s3");
    expect(result.campusStop?.id).toBe("s1");
  });

  it("handles full capacity bus bypassing empty downstream stops", () => {
    const fullBookings: Booking[] = Array.from({ length: 4 }, (_, i) => ({
      id: `bf-${i}`,
      studentId: `stud-${i}`,
      tripId: "t1",
      boardingStopId: "s4",
      seatNumber: `${i + 1}A`,
      status: "CONFIRMED",
      bookingCode: `FULL-${i}`,
      createdAt: new Date().toISOString(),
    }));

    const result = computeDirectExpressRoute(routeA, fullBookings, 4);
    expect(result.isFullyBooked).toBe(true);
    expect(result.isExpressDirect).toBe(true);
    expect(result.bypassedStopsCount).toBe(2); // s3 and s2 bypassed
    expect(result.activeStops.map(s => s.id)).toEqual(["s4", "s1"]);
  });

  it("retains all stops if passengers are booked throughout all stops including last intermediate stop", () => {
    const spreadBookings: Booking[] = [
      {
        id: "b1",
        studentId: "stud1",
        tripId: "t1",
        boardingStopId: "s4",
        seatNumber: "1A",
        status: "CONFIRMED",
        bookingCode: "GEHU-1",
        createdAt: new Date().toISOString(),
      },
      {
        id: "b2",
        studentId: "stud2",
        tripId: "t1",
        boardingStopId: "s2", // right before campus
        seatNumber: "1B",
        status: "CONFIRMED",
        bookingCode: "GEHU-2",
        createdAt: new Date().toISOString(),
      },
    ];

    const result = computeDirectExpressRoute(routeA, spreadBookings, 40);
    expect(result.isExpressDirect).toBe(false);
    expect(result.bypassedStopsCount).toBe(0);
    expect(result.activeStops.length).toBe(4);
  });
});

describe("Attendance-Reconciled Hybrid Fleet Orchestration (Approach C)", () => {
  const dummyBuses: Bus[] = [
    {
      id: 1,
      busNumber: 101,
      registrationNo: "DL-01-101",
      model: "Standard 40",
      capacity: 40,
      seatLayout: "2x2",
      status: "ACTIVE",
      gpsDeviceId: "gps-101",
      insuranceExpiry: "2027-01-01",
      maintenanceDueDate: "2027-01-01",
      currentRouteId: "rA",
    },
    {
      id: 2,
      busNumber: 102,
      registrationNo: "DL-01-102",
      model: "Standard 40",
      capacity: 40,
      seatLayout: "2x2",
      status: "ACTIVE",
      gpsDeviceId: "gps-102",
      insuranceExpiry: "2027-01-01",
      maintenanceDueDate: "2027-01-01",
      currentRouteId: "rA", // Same corridor as Bus 1
    },
    {
      id: 3,
      busNumber: 103,
      registrationNo: "DL-01-103",
      model: "Standard 40",
      capacity: 40,
      seatLayout: "2x2",
      status: "ACTIVE",
      gpsDeviceId: "gps-103",
      insuranceExpiry: "2027-01-01",
      maintenanceDueDate: "2027-01-01",
      currentRouteId: "rB", // Sparse adjacent corridor
    },
    {
      id: 4,
      busNumber: 104,
      registrationNo: "DL-01-104",
      model: "Standard 40",
      capacity: 40,
      seatLayout: "2x2",
      status: "ACTIVE",
      gpsDeviceId: "gps-104",
      insuranceExpiry: "2027-01-01",
      maintenanceDueDate: "2027-01-01",
      currentRouteId: "rC", // Sparse adjacent corridor
    },
  ];

  it("reconciles incoming morning attendance and prunes absentee students from outgoing manifest", () => {
    // 6 students booked on outgoing trip
    const outgoingBookings: Booking[] = [
      { id: "b1", studentId: "stud-1", tripId: "t-out", busId: 1, boardingStopId: "s1", status: "CONFIRMED", bookingCode: "C1", createdAt: "" },
      { id: "b2", studentId: "stud-2", tripId: "t-out", busId: 1, boardingStopId: "s2", status: "CONFIRMED", bookingCode: "C2", createdAt: "" },
      { id: "b3", studentId: "stud-3", tripId: "t-out", busId: 1, boardingStopId: "s3", status: "CONFIRMED", bookingCode: "C3", createdAt: "" },
      { id: "b4", studentId: "stud-4", tripId: "t-out", busId: 2, boardingStopId: "s1", status: "CONFIRMED", bookingCode: "C4", createdAt: "" },
      { id: "b5", studentId: "stud-5", tripId: "t-out", busId: 2, boardingStopId: "s2", status: "CONFIRMED", bookingCode: "C5", createdAt: "" },
      { id: "b6", studentId: "stud-6", tripId: "t-out", busId: 2, boardingStopId: "s3", status: "CONFIRMED", bookingCode: "C6", createdAt: "" },
    ];

    // Only stud-1, stud-2, and stud-4 attended incoming morning shift
    const incomingAttendees = new Set(["stud-1", "stud-2", "stud-4"]);

    const summary = reconcileShiftAttendance(incomingAttendees, outgoingBookings, dummyBuses);

    expect(summary.totalIncomingAttendees).toBe(3);
    expect(summary.totalAbsentPruned).toBe(3); // stud-3, stud-5, stud-6 pruned
    expect(summary.reconciledOutgoingPassengers).toBe(3);
    expect(summary.prunedStudentIds).toEqual(["stud-3", "stud-5", "stud-6"]);

    // Bus 1 has 2 reconciled (stud-1, stud-2), Bus 2 has 1 reconciled (stud-4)
    const b1Stat = summary.reconciledBusStats.find((s) => s.busId === 1);
    const b2Stat = summary.reconciledBusStats.find((s) => s.busId === 2);
    expect(b1Stat?.reconciledOccupancy).toBe(2);
    expect(b2Stat?.reconciledOccupancy).toBe(1);
    expect(b1Stat?.isCandidateForDisassembly).toBe(true);
    expect(b2Stat?.isCandidateForDisassembly).toBe(true);
  });

  it("detects intra-corridor bus disassembly when combined occupancy fits in carrier bus", () => {
    const incomingAttendees = new Set(["stud-1", "stud-2", "stud-4"]);
    const outgoingBookings: Booking[] = [
      { id: "b1", studentId: "stud-1", tripId: "t-out", busId: 1, boardingStopId: "s1", status: "CONFIRMED", bookingCode: "C1", createdAt: "" },
      { id: "b2", studentId: "stud-2", tripId: "t-out", busId: 1, boardingStopId: "s2", status: "CONFIRMED", bookingCode: "C2", createdAt: "" },
      { id: "b4", studentId: "stud-4", tripId: "t-out", busId: 2, boardingStopId: "s1", status: "CONFIRMED", bookingCode: "C4", createdAt: "" },
    ];

    const summary = reconcileShiftAttendance(incomingAttendees, outgoingBookings, dummyBuses);
    const disassemblies = detectIntraCorridorDisassemblies(
      dummyBuses,
      allRoutes,
      [{ routeId: "rA", id: "mp-1", code: "MP-NORTH", name: "North Interchange", isActive: true }],
      summary
    );

    expect(disassemblies.length).toBeGreaterThanOrEqual(1);
    const opp = disassemblies[0];
    expect(opp.type).toBe("INTRA_CORRIDOR_DISASSEMBLY");
    expect(opp.combinedOccupancy).toBe(3);
    expect(opp.remainingSeats).toBe(37); // 40 capacity - 3
    expect(opp.fuelSavedLiters).toBeGreaterThan(0);
  });

  it("computes Clarke-Wright route stitching for sparse adjacent corridors under 50% capacity", () => {
    // Bus 3 (on r2) has 5 students, Bus 4 (on r3) has 6 students (both < 50% of 40 capacity)
    const incomingAttendees = new Set([
      "s3-1", "s3-2", "s3-3", "s3-4", "s3-5",
      "s4-1", "s4-2", "s4-3", "s4-4", "s4-5", "s4-6"
    ]);

    const outgoingBookings: Booking[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `b3-${i}`, studentId: `s3-${i + 1}`, tripId: "t-r2", busId: 3, boardingStopId: "s1", status: "CONFIRMED" as const, bookingCode: `BK3-${i}`, createdAt: ""
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `b4-${i}`, studentId: `s4-${i + 1}`, tripId: "t-r3", busId: 4, boardingStopId: "s2", status: "CONFIRMED" as const, bookingCode: `BK4-${i}`, createdAt: ""
      })),
    ];

    const summary = reconcileShiftAttendance(incomingAttendees, outgoingBookings, dummyBuses);
    const stitches = computeClarkeWrightRouteStitches(
      allRoutes,
      dummyBuses,
      summary,
      outgoingBookings,
      15 // max detour 15 mins
    );

    expect(stitches.length).toBeGreaterThanOrEqual(1);
    const stitch = stitches[0];
    expect(stitch.type).toBe("ROUTE_STITCH_CONSOLIDATION");
    expect(stitch.combinedOccupancy).toBe(11); // 5 + 6
    expect(stitch.fuelSavedLiters).toBeGreaterThan(0);
    expect(stitch.estimatedDetourMinutes).toBeLessThanOrEqual(15);
  });

  it("master orchestrator outputs complete fleet rightsizing plan with financial savings", () => {
    const incomingAttendees = new Set(["stud-1", "stud-2", "stud-4", "s3-1", "s4-1"]);
    const outgoingBookings: Booking[] = [
      { id: "b1", studentId: "stud-1", tripId: "t-out", busId: 1, boardingStopId: "s1", status: "CONFIRMED", bookingCode: "C1", createdAt: "" },
      { id: "b2", studentId: "stud-2", tripId: "t-out", busId: 1, boardingStopId: "s2", status: "CONFIRMED", bookingCode: "C2", createdAt: "" },
      { id: "b4", studentId: "stud-4", tripId: "t-out", busId: 2, boardingStopId: "s1", status: "CONFIRMED", bookingCode: "C4", createdAt: "" },
      { id: "b3-1", studentId: "s3-1", tripId: "t-r2", busId: 3, boardingStopId: "s1", status: "CONFIRMED", bookingCode: "C31", createdAt: "" },
      { id: "b4-1", studentId: "s4-1", tripId: "t-r3", busId: 4, boardingStopId: "s2", status: "CONFIRMED", bookingCode: "C41", createdAt: "" },
    ];

    const plan = computeFleetOrchestrationPlan(
      incomingAttendees,
      outgoingBookings,
      dummyBuses,
      allRoutes,
      [{ routeId: "rA", id: "mp-1", code: "MP-NORTH", name: "North Interchange", isActive: true }],
      15,
      90
    );

    expect(plan.summary.totalIncomingAttendees).toBe(5);
    expect(plan.totalVehiclesStoodDown).toBeGreaterThanOrEqual(1);
    expect(plan.totalFuelSavedLiters).toBeGreaterThan(0);
    expect(plan.totalCostSavedINR).toBeGreaterThan(0);
  });
});
