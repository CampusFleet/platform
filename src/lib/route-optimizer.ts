/**
 * Route Optimizer — Graph-Based Routing Algorithms for CampusFleet
 *
 * Implements:
 * 1. Graph Builder — Weighted adjacency list from stops + routes
 * 2. Dijkstra's Algorithm — Shortest path between any two stops
 * 3. Bellman-Ford Algorithm — Nearest stops from home with connectivity scoring
 * 4. Route Recommendation Engine — Combines both for optimal bus selection
 */

import { Stop, Route, RouteStop, Booking, Bus } from "./types";
import { calculateHaversineDistanceKm } from "./eta-calculator";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single edge in the stop graph */
export interface GraphEdge {
  /** Target stop ID */
  to: string;
  /** Weight = distance in km (or adjusted cost) */
  weight: number;
  /** Which route this edge belongs to */
  routeId: string;
}

/** Adjacency list representation of the stop network */
export type StopGraph = Map<string, GraphEdge[]>;

/** Result of Dijkstra's shortest path */
export interface ShortestPathResult {
  /** Ordered list of stop IDs from source to target */
  path: string[];
  /** Total distance in km */
  totalDistanceKm: number;
  /** Estimated travel time in minutes (at avg 30 km/h campus speed) */
  totalEstimatedMins: number;
  /** Route IDs used along the path */
  routeIds: string[];
  /** Whether a transfer (route change) is needed */
  requiresTransfer: boolean;
  /** Number of intermediate stops */
  stopCount: number;
}

/** A nearest-stop recommendation from Bellman-Ford */
export interface NearestStopResult {
  /** The stop */
  stopId: string;
  /** Walking distance from home to this stop (km) */
  walkingDistanceKm: number;
  /** Number of bus routes serving this stop */
  busCount: number;
  /** Connectivity-adjusted score (lower = better) */
  score: number;
  /** Estimated walking time in minutes (at 5 km/h) */
  walkingTimeMins: number;
}

/** Full route recommendation combining nearest stop + shortest path */
export interface RouteRecommendation {
  /** Pickup stop */
  stopId: string;
  /** Walking distance from home */
  walkingDistanceKm: number;
  walkingTimeMins: number;
  /** Bus route to campus */
  pathToCampus: ShortestPathResult | null;
  /** How many buses serve this stop */
  busCount: number;
  /** Combined score (lower = better) */
  totalScore: number;
}

// ─── Min-Heap Priority Queue ─────────────────────────────────────────────────

/**
 * Binary min-heap for Dijkstra's algorithm.
 * O(log n) insert and extractMin.
 */
class MinHeap {
  private heap: { node: string; dist: number }[] = [];

  get size(): number {
    return this.heap.length;
  }

  insert(node: string, dist: number): void {
    this.heap.push({ node, dist });
    this.bubbleUp(this.heap.length - 1);
  }

  extractMin(): { node: string; dist: number } | null {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return min;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent].dist <= this.heap[idx].dist) break;
      [this.heap[parent], this.heap[idx]] = [this.heap[idx], this.heap[parent]];
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const length = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < length && this.heap[left].dist < this.heap[smallest].dist) smallest = left;
      if (right < length && this.heap[right].dist < this.heap[smallest].dist) smallest = right;
      if (smallest === idx) break;
      [this.heap[smallest], this.heap[idx]] = [this.heap[idx], this.heap[smallest]];
      idx = smallest;
    }
  }
}

// ─── Graph Builder ───────────────────────────────────────────────────────────

/**
 * Builds a weighted adjacency list from route stop sequences.
 *
 * Each route defines a chain: stop[0] → stop[1] → stop[2] → ...
 * Edges are bidirectional (buses run both directions).
 * Edge weight = Haversine distance between consecutive stops.
 */
export function buildStopGraph(routes: Route[], stops: Stop[]): StopGraph {
  const graph: StopGraph = new Map();
  const stopMap = new Map(stops.map(s => [s.id, s]));

  // Initialize all stops as nodes (even if not on any route)
  for (const stop of stops) {
    if (!graph.has(stop.id)) {
      graph.set(stop.id, []);
    }
  }

  // Build edges from route stop sequences
  for (const route of routes) {
    if (!route.isActive || !route.stops || route.stops.length < 2) continue;

    const routeStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);

    for (let i = 0; i < routeStops.length - 1; i++) {
      const fromStopId = routeStops[i].stopId;
      const toStopId = routeStops[i + 1].stopId;
      const fromStop = stopMap.get(fromStopId);
      const toStop = stopMap.get(toStopId);

      if (!fromStop || !toStop) continue;

      const distance = calculateHaversineDistanceKm(
        fromStop.latitude, fromStop.longitude,
        toStop.latitude, toStop.longitude
      );

      // Add bidirectional edges
      const forwardEdge: GraphEdge = { to: toStopId, weight: distance, routeId: route.id };
      const backwardEdge: GraphEdge = { to: fromStopId, weight: distance, routeId: route.id };

      graph.get(fromStopId)!.push(forwardEdge);
      graph.get(toStopId)!.push(backwardEdge);
    }
  }

  return graph;
}

/**
 * Returns the number of distinct routes serving a stop.
 */
export function getStopConnectivity(graph: StopGraph, stopId: string): number {
  const edges = graph.get(stopId) || [];
  const routeIds = new Set(edges.map(e => e.routeId));
  return routeIds.size;
}

// ─── Dijkstra's Shortest Path ────────────────────────────────────────────────

/**
 * Dijkstra's algorithm to find shortest path between two stops.
 *
 * Time complexity: O((V + E) log V) using binary min-heap.
 *
 * @param graph - Weighted adjacency list
 * @param sourceId - Source stop ID
 * @param targetId - Target stop ID
 * @returns ShortestPathResult or null if no path exists
 */
export function dijkstraShortestPath(
  graph: StopGraph,
  sourceId: string,
  targetId: string
): ShortestPathResult | null {
  // Edge case: same source and target
  if (sourceId === targetId) {
    return {
      path: [sourceId],
      totalDistanceKm: 0,
      totalEstimatedMins: 0,
      routeIds: [],
      requiresTransfer: false,
      stopCount: 1,
    };
  }

  // Check nodes exist in graph
  if (!graph.has(sourceId) || !graph.has(targetId)) {
    return null;
  }

  const dist: Map<string, number> = new Map();
  const prev: Map<string, string | null> = new Map();
  const prevEdge: Map<string, GraphEdge | null> = new Map();
  const visited: Set<string> = new Set();
  const pq = new MinHeap();

  // Initialize distances
  for (const nodeId of Array.from(graph.keys())) {
    dist.set(nodeId, Infinity);
    prev.set(nodeId, null);
    prevEdge.set(nodeId, null);
  }

  dist.set(sourceId, 0);
  pq.insert(sourceId, 0);

  while (pq.size > 0) {
    const current = pq.extractMin();
    if (!current) break;

    const { node: u, dist: currentDist } = current;

    // Skip if already visited (stale entry)
    if (visited.has(u)) continue;
    visited.add(u);

    // Found target — early exit
    if (u === targetId) break;

    // Skip if current distance is stale
    if (currentDist > (dist.get(u) || Infinity)) continue;

    // Relax neighbors
    const neighbors = graph.get(u) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.to)) continue;

      const newDist = (dist.get(u) || 0) + edge.weight;
      if (newDist < (dist.get(edge.to) || Infinity)) {
        dist.set(edge.to, newDist);
        prev.set(edge.to, u);
        prevEdge.set(edge.to, edge);
        pq.insert(edge.to, newDist);
      }
    }
  }

  // Reconstruct path
  if (!visited.has(targetId) || dist.get(targetId) === Infinity) {
    return null; // No path exists
  }

  const path: string[] = [];
  const edgesUsed: GraphEdge[] = [];
  let current: string | null = targetId;

  while (current !== null) {
    path.unshift(current);
    const edge = prevEdge.get(current);
    if (edge) edgesUsed.unshift(edge);
    current = prev.get(current) || null;
  }

  // Collect unique route IDs used
  const routeIds = Array.from(new Set(edgesUsed.map(e => e.routeId)));
  const totalDistanceKm = Math.round((dist.get(targetId) || 0) * 100) / 100;

  // Estimate time at average 30 km/h campus speed + 1 min per stop for boarding
  const travelTimeMins = (totalDistanceKm / 30) * 60;
  const stopDelayMins = (path.length - 1) * 1; // 1 min per intermediate stop
  const totalEstimatedMins = Math.max(1, Math.round(travelTimeMins + stopDelayMins));

  return {
    path,
    totalDistanceKm,
    totalEstimatedMins,
    routeIds,
    requiresTransfer: routeIds.length > 1,
    stopCount: path.length,
  };
}

// ─── Bellman-Ford Nearest Stop ───────────────────────────────────────────────

/**
 * Bellman-Ford algorithm to find nearest bus stops from a home location.
 *
 * Creates a virtual "home" node connected to all stops via edges weighted
 * by Haversine walking distance. Then applies a connectivity bonus:
 * well-connected stops (many bus routes) get a negative weight adjustment,
 * making Bellman-Ford necessary (it handles negative edges correctly).
 *
 * Time complexity: O(V * E)
 *
 * @param homeLat - Home latitude
 * @param homeLng - Home longitude
 * @param stops - All available stops
 * @param graph - The stop network graph (for connectivity scoring)
 * @param maxResults - Maximum number of nearest stops to return
 * @param maxWalkingKm - Maximum walking distance to consider (default 10km)
 * @returns Sorted array of nearest stop recommendations
 */
export function bellmanFordNearestStops(
  homeLat: number,
  homeLng: number,
  stops: Stop[],
  graph: StopGraph,
  maxResults: number = 5,
  maxWalkingKm: number = 10
): NearestStopResult[] {
  if (stops.length === 0) return [];

  const VIRTUAL_HOME = "__HOME__";
  const CONNECTIVITY_BONUS_PER_ROUTE = 0.15; // km discount per additional bus route

  // Build extended edge list: home → all stops + all stop→stop edges
  interface BFEdge {
    from: string;
    to: string;
    weight: number;
  }

  const edges: BFEdge[] = [];
  const nodes = new Set<string>();
  nodes.add(VIRTUAL_HOME);

  // Home → all stops (walking distance)
  for (const stop of stops) {
    nodes.add(stop.id);
    const walkDist = calculateHaversineDistanceKm(
      homeLat, homeLng,
      stop.latitude, stop.longitude
    );

    if (walkDist <= maxWalkingKm) {
      // Connectivity bonus: subtract discount for well-connected stops
      const connectivity = getStopConnectivity(graph, stop.id);
      const bonus = Math.min(connectivity * CONNECTIVITY_BONUS_PER_ROUTE, walkDist * 0.4);
      const adjustedWeight = walkDist - bonus; // Can be slightly negative for very connected stops

      edges.push({ from: VIRTUAL_HOME, to: stop.id, weight: adjustedWeight });
    }
  }

  // Stop → stop edges from the graph (for network-aware scoring)
  for (const [fromId, neighbors] of Array.from(graph.entries())) {
    nodes.add(fromId);
    for (const edge of neighbors) {
      nodes.add(edge.to);
      edges.push({ from: fromId, to: edge.to, weight: edge.weight });
    }
  }

  // Initialize distances
  const dist: Map<string, number> = new Map();
  for (const node of Array.from(nodes)) {
    dist.set(node, node === VIRTUAL_HOME ? 0 : Infinity);
  }

  // Bellman-Ford: relax all edges |V|-1 times
  const V = nodes.size;
  for (let i = 0; i < V - 1; i++) {
    let updated = false;
    for (const edge of edges) {
      const du = dist.get(edge.from) ?? Infinity;
      const dv = dist.get(edge.to) ?? Infinity;
      if (du !== Infinity && du + edge.weight < dv) {
        dist.set(edge.to, du + edge.weight);
        updated = true;
      }
    }
    // Early exit if no updates (already converged)
    if (!updated) break;
  }

  // Negative cycle detection (shouldn't happen with our data, but safety check)
  for (const edge of edges) {
    const du = dist.get(edge.from) ?? Infinity;
    const dv = dist.get(edge.to) ?? Infinity;
    if (du !== Infinity && du + edge.weight < dv) {
      console.warn("Bellman-Ford: Negative cycle detected in stop graph");
      break;
    }
  }

  // Collect results for stops only (not virtual home node)
  const results: NearestStopResult[] = [];
  for (const stop of stops) {
    const adjustedDist = dist.get(stop.id) ?? Infinity;
    if (adjustedDist === Infinity) continue;

    const rawWalkDist = calculateHaversineDistanceKm(
      homeLat, homeLng,
      stop.latitude, stop.longitude
    );

    if (rawWalkDist > maxWalkingKm) continue;

    const connectivity = getStopConnectivity(graph, stop.id);

    results.push({
      stopId: stop.id,
      walkingDistanceKm: Math.round(rawWalkDist * 100) / 100,
      busCount: connectivity,
      score: Math.round(adjustedDist * 100) / 100,
      walkingTimeMins: Math.max(1, Math.round((rawWalkDist / 5) * 60)), // 5 km/h walking speed
    });
  }

  // Sort by Bellman-Ford score (lower = better)
  results.sort((a, b) => a.score - b.score);

  return results.slice(0, maxResults);
}

// ─── Route Recommendation Engine ─────────────────────────────────────────────

/**
 * Calculates which bus routes cover a given student stop or neighborhood based on roadway corridor path proximity.
 * In a campus transit system, stops are dynamic: if a bus travels along a path nearby a student's house/stop,
 * that bus directly services that student at that pickup point.
 *
 * @param stopLat - Latitude of the student pickup point
 * @param stopLng - Longitude of the student pickup point
 * @param routes - All active bus routes
 * @param stops - All transit stops
 * @param maxCatchmentKm - Maximum corridor proximity threshold (default 2.5 km)
 */
export function findCorridorsServingStop(
  stopLat: number,
  stopLng: number,
  routes: Route[],
  stops: Stop[],
  maxCatchmentKm: number = 2.5
): { route: Route; distanceToCorridorKm: number }[] {
  const stopMap = new Map(stops.map(s => [s.id, s]));
  const results: { route: Route; distanceToCorridorKm: number }[] = [];

  for (const route of routes) {
    if (!route.isActive || !route.stops || route.stops.length === 0) continue;

    let minDistance = Infinity;
    for (const rs of route.stops) {
      const s = stopMap.get(rs.stopId) || rs.stop;
      if (s) {
        const d = calculateHaversineDistanceKm(stopLat, stopLng, s.latitude, s.longitude);
        if (d < minDistance) {
          minDistance = d;
        }
      }
    }

    if (minDistance <= maxCatchmentKm) {
      results.push({
        route,
        distanceToCorridorKm: Math.round(minDistance * 100) / 100,
      });
    }
  }

  // Fallback: if no route within radius, include the closest route so students always have coverage
  if (results.length === 0 && routes.length > 0) {
    let closestRoute = routes[0];
    let minD = Infinity;
    for (const route of routes) {
      for (const rs of route.stops || []) {
        const s = stopMap.get(rs.stopId) || rs.stop;
        if (s) {
          const d = calculateHaversineDistanceKm(stopLat, stopLng, s.latitude, s.longitude);
          if (d < minD) {
            minD = d;
            closestRoute = route;
          }
        }
      }
    }
    results.push({ route: closestRoute, distanceToCorridorKm: Math.round(minD * 100) / 100 });
  }

  return results.sort((a, b) => a.distanceToCorridorKm - b.distanceToCorridorKm);
}

/**
 * Combined route recommender: finds the best pickup stop + bus route to campus.
 *
 * Algorithm:
 * 1. Bellman-Ford → Find top N nearest stops from home
 * 2. Dynamic Corridor Traversal → Connects neighborhood stops to passing bus routes
 * 3. Dijkstra → For each candidate stop, find shortest path to campus
 * 4. Score → walking_distance * 4 + bus_distance + doorstep_bonus + transfer_penalty
 * 5. Sort by total score and return ranked recommendations
 */
export function recommendBestRoute(
  homeLat: number,
  homeLng: number,
  campusStopId: string,
  stops: Stop[],
  routes: Route[],
  graph?: StopGraph,
  topN: number = 8
): RouteRecommendation[] {
  const stopGraph = graph || buildStopGraph(routes, stops);
  const stopMap = new Map(stops.map(s => [s.id, s]));

  // Step 1: Bellman-Ford — find nearest stops
  const nearestStops = bellmanFordNearestStops(
    homeLat, homeLng, stops, stopGraph, topN
  );

  if (nearestStops.length === 0) return [];

  // Step 2: Dijkstra — find shortest path from each candidate to campus
  const recommendations: RouteRecommendation[] = [];

  for (const candidate of nearestStops) {
    let pathToCampus = dijkstraShortestPath(
      stopGraph, candidate.stopId, campusStopId
    );
    let effectiveBusCount = candidate.busCount;

    // Multimodal connection: if candidate stop is not directly on a campus-bound route,
    // connect it seamlessly to the closest active transit corridor stop
    if (!pathToCampus) {
      const candidateStop = stopMap.get(candidate.stopId);
      if (candidateStop) {
        let bestConnectingStop: Stop | null = null;
        let minConnectingDist = Infinity;
        let bestConnectingPath: ShortestPathResult | null = null;

        for (const s of stops) {
          if (s.id === candidate.stopId) continue;
          const sConn = getStopConnectivity(stopGraph, s.id);
          if (sConn > 0) {
            const p = dijkstraShortestPath(stopGraph, s.id, campusStopId);
            if (p) {
              const d = calculateHaversineDistanceKm(
                candidateStop.latitude, candidateStop.longitude,
                s.latitude, s.longitude
              );
              if (d < minConnectingDist && d <= 6.0) {
                minConnectingDist = d;
                bestConnectingStop = s;
                bestConnectingPath = p;
                effectiveBusCount = sConn;
              }
            }
          }
        }

        if (bestConnectingPath && bestConnectingStop) {
          pathToCampus = {
            path: [candidate.stopId, ...bestConnectingPath.path],
            totalDistanceKm: Math.round((minConnectingDist + bestConnectingPath.totalDistanceKm) * 100) / 100,
            totalEstimatedMins: Math.round(minConnectingDist * 10 + bestConnectingPath.totalEstimatedMins),
            routeIds: bestConnectingPath.routeIds,
            requiresTransfer: true,
            stopCount: bestConnectingPath.stopCount + 1,
          };
        }
      }
    }

    // Score calculation (Standard Transit Gravity Model):
    // Walking weight = 4x (walking is significantly more effort than riding in a bus)
    // Doorstep bonus = -3 for stops <= 100m (0km away)
    // Transfer penalty = 1.5 per transfer
    const walkScore = candidate.walkingDistanceKm * 4;
    const doorstepBonus = candidate.walkingDistanceKm <= 0.1 ? -3 : 0;
    const busScore = pathToCampus ? pathToCampus.totalDistanceKm : 100;
    const transferPenalty = pathToCampus?.requiresTransfer ? 1.5 : 0;
    const totalScore = Math.round((walkScore + busScore + transferPenalty + doorstepBonus) * 100) / 100;

    recommendations.push({
      stopId: candidate.stopId,
      walkingDistanceKm: candidate.walkingDistanceKm,
      walkingTimeMins: candidate.walkingTimeMins,
      pathToCampus,
      busCount: effectiveBusCount,
      totalScore,
    });
  }

  // Sort by total score (lower = better)
  recommendations.sort((a, b) => a.totalScore - b.totalScore);

  return recommendations;
}

// ─── A* Search (Heuristic-Guided Shortest Path) ─────────────────────────────

/**
 * A* Search algorithm — faster than Dijkstra for point-to-point queries.
 *
 * Uses Haversine distance to the target as an admissible heuristic,
 * guaranteeing optimal results while exploring fewer nodes.
 *
 * Time complexity: O((V + E) log V) worst case, but typically much faster
 * than Dijkstra due to heuristic pruning.
 *
 * @param graph - Weighted adjacency list
 * @param sourceId - Source stop ID
 * @param targetId - Target stop ID
 * @param stops - All stops (needed for heuristic calculation)
 * @returns ShortestPathResult or null if no path exists
 */
export function aStarSearch(
  graph: StopGraph,
  sourceId: string,
  targetId: string,
  stops: Stop[]
): ShortestPathResult | null {
  if (sourceId === targetId) {
    return {
      path: [sourceId],
      totalDistanceKm: 0,
      totalEstimatedMins: 0,
      routeIds: [],
      requiresTransfer: false,
      stopCount: 1,
    };
  }

  if (!graph.has(sourceId) || !graph.has(targetId)) return null;

  const stopMap = new Map(stops.map(s => [s.id, s]));
  const targetStop = stopMap.get(targetId);
  if (!targetStop) return null;

  // Heuristic: Haversine distance to target (admissible — never overestimates)
  function heuristic(nodeId: string): number {
    const stop = stopMap.get(nodeId);
    if (!stop) return 0;
    return calculateHaversineDistanceKm(
      stop.latitude, stop.longitude,
      targetStop!.latitude, targetStop!.longitude
    );
  }

  const gScore: Map<string, number> = new Map(); // Actual cost from source
  const fScore: Map<string, number> = new Map(); // gScore + heuristic
  const prev: Map<string, string | null> = new Map();
  const prevEdge: Map<string, GraphEdge | null> = new Map();
  const closedSet: Set<string> = new Set();
  const pq = new MinHeap();

  gScore.set(sourceId, 0);
  fScore.set(sourceId, heuristic(sourceId));
  pq.insert(sourceId, fScore.get(sourceId)!);

  while (pq.size > 0) {
    const current = pq.extractMin();
    if (!current) break;

    const u = current.node;

    if (u === targetId) {
      // Reconstruct path
      const path: string[] = [];
      const edgesUsed: GraphEdge[] = [];
      let node: string | null = targetId;
      while (node !== null) {
        path.unshift(node);
        const edge = prevEdge.get(node);
        if (edge) edgesUsed.unshift(edge);
        node = prev.get(node) ?? null;
      }

      const routeIds = Array.from(new Set(edgesUsed.map(e => e.routeId)));
      const totalDistanceKm = Math.round((gScore.get(targetId) || 0) * 100) / 100;
      const travelTimeMins = (totalDistanceKm / 30) * 60;
      const stopDelayMins = (path.length - 1) * 1;

      return {
        path,
        totalDistanceKm,
        totalEstimatedMins: Math.max(1, Math.round(travelTimeMins + stopDelayMins)),
        routeIds,
        requiresTransfer: routeIds.length > 1,
        stopCount: path.length,
      };
    }

    if (closedSet.has(u)) continue;
    closedSet.add(u);

    const neighbors = graph.get(u) || [];
    for (const edge of neighbors) {
      if (closedSet.has(edge.to)) continue;

      const tentativeG = (gScore.get(u) || 0) + edge.weight;

      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        prev.set(edge.to, u);
        prevEdge.set(edge.to, edge);
        gScore.set(edge.to, tentativeG);
        fScore.set(edge.to, tentativeG + heuristic(edge.to));
        pq.insert(edge.to, fScore.get(edge.to)!);
      }
    }
  }

  return null; // No path found
}

// ─── Floyd-Warshall All-Pairs Shortest Paths ─────────────────────────────────

/** Precomputed all-pairs distance matrix */
export interface AllPairsResult {
  /** Distance from stop i to stop j: distances[i][j] */
  distances: Map<string, Map<string, number>>;
  /** Next hop on shortest path from i to j */
  nextHop: Map<string, Map<string, string | null>>;
  /** All stop IDs in the matrix */
  stopIds: string[];
}

/**
 * Floyd-Warshall algorithm — precomputes shortest distances between ALL pairs of stops.
 *
 * After running once, any distance lookup is O(1).
 * Path reconstruction is O(path_length).
 *
 * Time complexity: O(V³)
 * Space complexity: O(V²)
 *
 * Best for: Dashboard analytics, network-wide metrics, repeated queries.
 */
export function floydWarshallAllPairs(graph: StopGraph): AllPairsResult {
  const stopIds = Array.from(graph.keys());
  const n = stopIds.length;
  const idxMap = new Map(stopIds.map((id, idx) => [id, idx]));

  // Initialize distance and next-hop matrices
  const dist: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => Infinity)
  );
  const next: (number | null)[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => null)
  );

  // Self-distance = 0
  for (let i = 0; i < n; i++) {
    dist[i][i] = 0;
    next[i][i] = i;
  }

  // Initialize from graph edges
  for (const [fromId, edges] of Array.from(graph.entries())) {
    const i = idxMap.get(fromId)!;
    for (const edge of edges) {
      const j = idxMap.get(edge.to);
      if (j !== undefined && edge.weight < dist[i][j]) {
        dist[i][j] = edge.weight;
        next[i][j] = j;
      }
    }
  }

  // Floyd-Warshall triple loop
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
          next[i][j] = next[i][k];
        }
      }
    }
  }

  // Convert to Map-based result for easy lookup
  const distances = new Map<string, Map<string, number>>();
  const nextHop = new Map<string, Map<string, string | null>>();

  for (let i = 0; i < n; i++) {
    const dMap = new Map<string, number>();
    const nMap = new Map<string, string | null>();
    for (let j = 0; j < n; j++) {
      dMap.set(stopIds[j], Math.round(dist[i][j] * 100) / 100);
      nMap.set(stopIds[j], next[i][j] !== null ? stopIds[next[i][j]!] : null);
    }
    distances.set(stopIds[i], dMap);
    nextHop.set(stopIds[i], nMap);
  }

  return { distances, nextHop, stopIds };
}

/**
 * Reconstruct path from Floyd-Warshall precomputed next-hop matrix.
 * O(path_length) time.
 */
export function reconstructFloydPath(
  allPairs: AllPairsResult,
  sourceId: string,
  targetId: string
): string[] | null {
  const nextMap = allPairs.nextHop.get(sourceId);
  if (!nextMap) return null;

  const dist = allPairs.distances.get(sourceId)?.get(targetId);
  if (dist === undefined || dist === Infinity) return null;

  const path: string[] = [sourceId];
  let current = sourceId;

  while (current !== targetId) {
    const hop = allPairs.nextHop.get(current)?.get(targetId);
    if (!hop || hop === current) return null; // Prevent infinite loops
    path.push(hop);
    current = hop;
  }

  return path;
}

// ─── Kruskal's Minimum Spanning Tree ─────────────────────────────────────────

/** MST edge result */
export interface MSTEdge {
  from: string;
  to: string;
  weight: number;
  routeId: string;
}

/** MST result with total weight and coverage stats */
export interface MSTResult {
  /** Edges forming the MST */
  edges: MSTEdge[];
  /** Total distance of MST (km) */
  totalWeightKm: number;
  /** Number of connected stops */
  connectedStops: number;
  /** Number of disconnected components */
  components: number;
}

/**
 * Union-Find (Disjoint Set Union) with path compression and union by rank.
 * Used by Kruskal's algorithm for cycle detection.
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  makeSet(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!)); // Path compression
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): boolean {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return false; // Already in same set (would create cycle)

    // Union by rank
    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;
    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
    return true;
  }

  getComponentCount(): number {
    const roots = new Set<string>();
    for (const node of Array.from(this.parent.keys())) {
      roots.add(this.find(node));
    }
    return roots.size;
  }
}

/**
 * Kruskal's Minimum Spanning Tree algorithm.
 *
 * Finds the minimum-weight set of edges that connects all reachable stops.
 * Useful for:
 * - Analyzing optimal network coverage
 * - Finding redundant routes
 * - Identifying critical connections (bridges)
 * - Admin dashboard: "minimum infrastructure needed to connect all stops"
 *
 * Time complexity: O(E log E) for sorting edges
 */
export function kruskalMST(graph: StopGraph): MSTResult {
  // Collect all unique edges (deduplicate bidirectional)
  const edgeSet = new Map<string, MSTEdge>();

  for (const [fromId, neighbors] of Array.from(graph.entries())) {
    for (const edge of neighbors) {
      const key = [fromId, edge.to].sort().join("--");
      if (!edgeSet.has(key) || edge.weight < edgeSet.get(key)!.weight) {
        edgeSet.set(key, {
          from: fromId,
          to: edge.to,
          weight: edge.weight,
          routeId: edge.routeId,
        });
      }
    }
  }

  // Sort edges by weight (ascending)
  const sortedEdges = Array.from(edgeSet.values()).sort((a, b) => a.weight - b.weight);

  // Initialize Union-Find
  const uf = new UnionFind();
  for (const nodeId of Array.from(graph.keys())) {
    uf.makeSet(nodeId);
  }

  // Kruskal's: greedily add edges that don't create cycles
  const mstEdges: MSTEdge[] = [];
  let totalWeight = 0;

  for (const edge of sortedEdges) {
    if (uf.union(edge.from, edge.to)) {
      mstEdges.push(edge);
      totalWeight += edge.weight;
    }
  }

  return {
    edges: mstEdges,
    totalWeightKm: Math.round(totalWeight * 100) / 100,
    connectedStops: graph.size,
    components: uf.getComponentCount(),
  };
}

// ─── Network Analytics (powered by Floyd-Warshall + MST) ─────────────────────

/** Network-wide statistics for admin dashboard */
export interface NetworkStats {
  /** Total stops in the network */
  totalStops: number;
  /** Total unique edges (connections between stops) */
  totalEdges: number;
  /** Average connectivity (edges per stop) */
  avgConnectivity: number;
  /** Diameter = longest shortest path between any two connected stops (km) */
  networkDiameterKm: number;
  /** Most connected stop (hub) */
  hubStopId: string;
  /** MST total distance (minimum infrastructure needed) */
  mstTotalKm: number;
  /** Number of disconnected components */
  disconnectedComponents: number;
}

/**
 * Compute comprehensive network statistics for the admin dashboard.
 * Combines Floyd-Warshall + Kruskal's MST for complete analysis.
 */
export function computeNetworkStats(graph: StopGraph): NetworkStats {
  const allPairs = floydWarshallAllPairs(graph);
  const mst = kruskalMST(graph);

  // Count unique edges
  let totalEdges = 0;
  const edgeKeys = new Set<string>();
  for (const [fromId, neighbors] of Array.from(graph.entries())) {
    for (const edge of neighbors) {
      const key = [fromId, edge.to].sort().join("--");
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        totalEdges++;
      }
    }
  }

  // Find network diameter (longest shortest path)
  let maxDist = 0;
  for (const [, innerMap] of Array.from(allPairs.distances)) {
    for (const [, dist] of Array.from(innerMap)) {
      if (dist !== Infinity && dist > maxDist) {
        maxDist = dist;
      }
    }
  }

  // Find hub (most connected stop)
  let hubStopId = "";
  let maxConnectivity = 0;
  for (const [stopId, neighbors] of Array.from(graph.entries())) {
    const connectivity = new Set(neighbors.map(e => e.routeId)).size;
    if (connectivity > maxConnectivity) {
      maxConnectivity = connectivity;
      hubStopId = stopId;
    }
  }

  const avgConnectivity = graph.size > 0
    ? Math.round((totalEdges * 2 / graph.size) * 10) / 10
    : 0;

  return {
    totalStops: graph.size,
    totalEdges,
    avgConnectivity,
    networkDiameterKm: Math.round(maxDist * 100) / 100,
    hubStopId,
    mstTotalKm: mst.totalWeightKm,
    disconnectedComponents: mst.components,
  };
}

// ─── Direct Express to Campus Engine (Full-Capacity Bypass) ──────────────────

export interface DirectExpressRouteResult {
  /** True if the bus is bypassing remaining empty stops directly to campus */
  isExpressDirect: boolean;
  /** Human-readable explanation */
  reason: string;
  /** Active sequence of stops the bus will actually serve */
  activeStops: Stop[];
  /** The last stop where a student is scheduled to be picked up */
  lastPassengerStop: Stop | null;
  /** Final destination campus stop */
  campusStop: Stop | null;
  /** Number of empty intermediate stops skipped */
  bypassedStopsCount: number;
  /** Whether the bus has reached physical seating capacity */
  isFullyBooked: boolean;
}

/**
 * Computes whether a shuttle should bypass remaining empty intermediate stops
 * and head directly non-stop to the university campus once full or past all passenger pickups.
 */
export function computeDirectExpressRoute(
  route?: Route | null,
  tripBookings: Booking[] = [],
  busCapacity: number = 32
): DirectExpressRouteResult {
  const allRouteStops = (route?.stops || []).map(rs => rs.stop).filter(Boolean);
  
  if (allRouteStops.length <= 2) {
    return {
      isExpressDirect: false,
      reason: "Standard direct corridor",
      activeStops: allRouteStops,
      lastPassengerStop: allRouteStops[0] || null,
      campusStop: allRouteStops[allRouteStops.length - 1] || null,
      bypassedStopsCount: 0,
      isFullyBooked: false,
    };
  }

  const campusStop = allRouteStops[allRouteStops.length - 1];
  const confirmedBookings = tripBookings.filter(
    b => b.status === "CONFIRMED" || b.status === "BOARDED"
  );
  const isFullyBooked = confirmedBookings.length >= busCapacity;

  // Identify all stops along this route that have passenger reservations
  const bookedStopIds = new Set(
    confirmedBookings.map(b => b.boardingStopId).filter(Boolean)
  );

  let maxBookedStopIdx = -1;
  allRouteStops.forEach((stop, idx) => {
    if (bookedStopIds.has(stop.id)) {
      maxBookedStopIdx = Math.max(maxBookedStopIdx, idx);
    }
  });

  // If there are bookings and stops between the last passenger pickup and the campus:
  const hasIntermediateStopsToBypass =
    maxBookedStopIdx >= 0 && maxBookedStopIdx < allRouteStops.length - 2;

  if (isFullyBooked || (confirmedBookings.length > 0 && hasIntermediateStopsToBypass)) {
    // Take all stops up to the last passenger pickup stop, then head DIRECTLY to the campus!
    const effectiveStops = allRouteStops.slice(0, maxBookedStopIdx + 1);
    if (!effectiveStops.some(s => s.id === campusStop.id)) {
      effectiveStops.push(campusStop);
    }

    const bypassedStopsCount = Math.max(0, allRouteStops.length - effectiveStops.length);

    return {
      isExpressDirect: bypassedStopsCount > 0,
      reason: isFullyBooked
        ? `⚡ Full Capacity Reached (${confirmedBookings.length}/${busCapacity} seats filled). Bypassing ${bypassedStopsCount} empty stops directly to GEHU Campus!`
        : `⚡ All confirmed passengers picked up by stop #${maxBookedStopIdx + 1}. Bypassing ${bypassedStopsCount} empty stops direct to Campus!`,
      activeStops: effectiveStops,
      lastPassengerStop: allRouteStops[maxBookedStopIdx] || null,
      campusStop,
      bypassedStopsCount,
      isFullyBooked,
    };
  }

  return {
    isExpressDirect: false,
    reason: "Standard route sequence",
    activeStops: allRouteStops,
    lastPassengerStop: maxBookedStopIdx >= 0 ? allRouteStops[maxBookedStopIdx] : null,
    campusStop,
    bypassedStopsCount: 0,
    isFullyBooked,
  };
}

// ─── Attendance-Reconciled Fleet Orchestration Engine (Approach C) ───────────

export interface AttendanceReconciliationSummary {
  tripDate: string;
  totalIncomingAttendees: number;
  totalAbsentPruned: number;
  initialOutgoingPassengers: number;
  reconciledOutgoingPassengers: number;
  prunedStudentIds: string[];
  reconciledBusStats: {
    busId: number | string;
    busNumber: number | string;
    routeId?: string;
    routeName?: string;
    capacity: number;
    initialOccupancy: number;
    reconciledOccupancy: number;
    loadFactorPercent: number;
    isCandidateForDisassembly: boolean;
  }[];
}

export interface IntraCorridorDisassemblyOpportunity {
  id: string;
  type: "INTRA_CORRIDOR_DISASSEMBLY";
  routeId: string;
  routeName: string;
  mergePointId: string;
  mergePointCode: string;
  mergePointName: string;
  sourceBusId: string | number;
  sourceBusNumber: string | number;
  sourceOccupancy: number;
  targetBusId: string | number;
  targetBusNumber: string | number;
  targetOccupancy: number;
  targetCapacity: number;
  combinedOccupancy: number;
  remainingSeats: number;
  fuelSavedLiters: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
}

export interface RouteStitchOpportunity {
  id: string;
  type: "ROUTE_STITCH_CONSOLIDATION";
  primaryRouteId: string;
  primaryRouteName: string;
  secondaryRouteId: string;
  secondaryRouteName: string;
  sourceBusId: string | number; // Bus stood down (disassembled)
  sourceBusNumber: string | number;
  sourceOccupancy: number;
  targetBusId: string | number; // Consolidated active carrier bus
  targetBusNumber: string | number;
  targetOccupancy: number;
  targetCapacity: number;
  combinedOccupancy: number;
  remainingSeats: number;
  activeStops: Stop[];
  bypassedStopsCount: number;
  clarkeWrightSavingsKm: number;
  estimatedDetourMinutes: number;
  fuelSavedLiters: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
}

export interface FleetOrchestrationPlan {
  summary: AttendanceReconciliationSummary;
  disassemblyOpportunities: IntraCorridorDisassemblyOpportunity[];
  routeStitchOpportunities: RouteStitchOpportunity[];
  totalVehiclesStoodDown: number;
  totalFuelSavedLiters: number;
  totalCostSavedINR: number;
}

/**
 * Stage 1: Reconciles incoming shift attendance with outgoing shift bookings.
 * Identifies students who did NOT attend the morning shift and prunes them from
 * the outgoing shift manifest to obtain 100% deterministic demand.
 */
export function reconcileShiftAttendance(
  incomingAttendeeStudentIds: Set<string>,
  outgoingBookings: Booking[],
  buses: Bus[],
  tripDate: string = new Date().toISOString().split("T")[0]
): AttendanceReconciliationSummary {
  const confirmedOutgoing = outgoingBookings.filter(
    (b) => b.status === "CONFIRMED" || b.status === "BOARDED" || b.status === "WAITLISTED"
  );

  const prunedStudentIds: string[] = [];
  const initialBusCounts = new Map<string, number>();
  const reconciledBusCounts = new Map<string, number>();

  for (const b of confirmedOutgoing) {
    const bId = String(b.busId || "unassigned");
    initialBusCounts.set(bId, (initialBusCounts.get(bId) || 0) + 1);

    // If student did NOT attend morning incoming trip, prune them from outgoing trip
    if (!incomingAttendeeStudentIds.has(b.studentId)) {
      prunedStudentIds.push(b.studentId);
    } else {
      reconciledBusCounts.set(bId, (reconciledBusCounts.get(bId) || 0) + 1);
    }
  }

  const busStats = buses.map((bus) => {
    const bId = String(bus.id);
    const initialOcc = initialBusCounts.get(bId) || 0;
    const reconciledOcc = reconciledBusCounts.get(bId) || 0;
    const cap = bus.capacity || 50;
    const loadFactor = Math.round((reconciledOcc / cap) * 100);

    return {
      busId: bus.id,
      busNumber: bus.busNumber,
      routeId: bus.currentRouteId,
      capacity: cap,
      initialOccupancy: initialOcc,
      reconciledOccupancy: reconciledOcc,
      loadFactorPercent: loadFactor,
      isCandidateForDisassembly: loadFactor <= 50,
    };
  });

  return {
    tripDate,
    totalIncomingAttendees: incomingAttendeeStudentIds.size,
    totalAbsentPruned: prunedStudentIds.length,
    initialOutgoingPassengers: confirmedOutgoing.length,
    reconciledOutgoingPassengers: confirmedOutgoing.length - prunedStudentIds.length,
    prunedStudentIds,
    reconciledBusStats: busStats,
  };
}

/**
 * Stage 2A: Detects intra-corridor bus disassembly opportunities.
 * If two buses run on the same corridor or meet at a designated merge point,
 * and their combined reconciled occupancy fits inside one bus, one bus is stood down.
 */
export function detectIntraCorridorDisassemblies(
  buses: Bus[],
  routes: Route[],
  mergePoints: any[],
  reconciledStats: AttendanceReconciliationSummary
): IntraCorridorDisassemblyOpportunity[] {
  const statsMap = new Map(reconciledStats.reconciledBusStats.map((s) => [String(s.busId), s]));
  const routeMap = new Map(routes.map((r) => [r.id, r]));

  // Group buses by route
  const routeBuses = new Map<string, Bus[]>();
  for (const b of buses) {
    if (b.status === "MAINTENANCE" || b.status === "INACTIVE" || b.status === "MERGED") continue;
    const rId = b.currentRouteId;
    if (rId) {
      if (!routeBuses.has(rId)) routeBuses.set(rId, []);
      routeBuses.get(rId)!.push(b);
    }
  }

  const opportunities: IntraCorridorDisassemblyOpportunity[] = [];

  for (const [routeId, busesOnRoute] of Array.from(routeBuses.entries())) {
    if (busesOnRoute.length < 2) continue;

    // Find designated merge point for this route
    const mp = mergePoints.find((p) => p.routeId === routeId && p.isActive !== false) || {
      id: "AUTO-MERGE-" + routeId,
      code: "MP-INTERCHANGE",
      name: "Designated Route Interchange",
    };

    const route = routeMap.get(routeId);
    const routeDistanceKm = route?.totalDistanceKm || 22;
    // Fuel consumption: ~3.8 km/L
    const estimatedFuelSaved = Math.round((routeDistanceKm / 3.8) * 10) / 10;

    for (let i = 0; i < busesOnRoute.length; i++) {
      for (let j = i + 1; j < busesOnRoute.length; j++) {
        const b1 = busesOnRoute[i];
        const b2 = busesOnRoute[j];

        const s1 = statsMap.get(String(b1.id));
        const s2 = statsMap.get(String(b2.id));

        const occ1 = s1?.reconciledOccupancy ?? 0;
        const occ2 = s2?.reconciledOccupancy ?? 0;
        const cap1 = b1.capacity || 50;
        const cap2 = b2.capacity || 50;
        const combined = occ1 + occ2;

        let source = null;
        let target = null;

        if (combined <= cap1) {
          source = b2;
          target = b1;
        } else if (combined <= cap2) {
          source = b1;
          target = b2;
        }

        if (source && target) {
          const targetCap = target.capacity || 50;
          opportunities.push({
            id: `DISASM-${source.id}-${target.id}`,
            type: "INTRA_CORRIDOR_DISASSEMBLY",
            routeId,
            routeName: route?.name || `Route ${routeId}`,
            mergePointId: mp.id,
            mergePointCode: mp.code,
            mergePointName: mp.name,
            sourceBusId: source.id,
            sourceBusNumber: source.busNumber,
            sourceOccupancy: source.id === b1.id ? occ1 : occ2,
            targetBusId: target.id,
            targetBusNumber: target.busNumber,
            targetOccupancy: target.id === b1.id ? occ1 : occ2,
            targetCapacity: targetCap,
            combinedOccupancy: combined,
            remainingSeats: Math.max(0, targetCap - combined),
            fuelSavedLiters: estimatedFuelSaved,
            status: "PENDING",
          });
        }
      }
    }
  }

  return opportunities;
}

/**
 * Stage 2B: Inter-Corridor Route Stitching via Clarke-Wright Savings Algorithm.
 * When two distinct routes both have low load factors (<= 50%), their active passenger
 * drop-off stops are merged into a single multi-stop sequence served by one bus,
 * standing down the second bus to maximize fuel and fleet efficiency.
 */
export function computeClarkeWrightRouteStitches(
  routes: Route[],
  buses: Bus[],
  reconciledStats: AttendanceReconciliationSummary,
  outgoingBookings: Booking[],
  maxDetourMinutes: number = 15
): RouteStitchOpportunity[] {
  const statsMap = new Map(reconciledStats.reconciledBusStats.map((s) => [String(s.busId), s]));
  const routeMap = new Map(routes.map((r) => [r.id, r]));

  // Active bookings that were not pruned
  const prunedSet = new Set(reconciledStats.prunedStudentIds);
  const activeBookings = outgoingBookings.filter(
    (b) => !prunedSet.has(b.studentId) && (b.status === "CONFIRMED" || b.status === "BOARDED")
  );

  // Group active bookings by route
  const bookingsByRoute = new Map<string, Booking[]>();
  for (const b of activeBookings) {
    const bus = buses.find((bs) => bs.id === b.busId);
    const rId = bus?.currentRouteId;
    if (rId) {
      if (!bookingsByRoute.has(rId)) bookingsByRoute.set(rId, []);
      bookingsByRoute.get(rId)!.push(b);
    }
  }

  // Find candidate routes with low load (occupancy <= 50% of assigned bus)
  const candidateRoutes: { route: Route; bus: Bus; occupancy: number }[] = [];
  for (const route of routes) {
    const assignedBus = buses.find((b) => b.currentRouteId === route.id && b.status !== "MAINTENANCE");
    if (!assignedBus) continue;

    const stat = statsMap.get(String(assignedBus.id));
    const occ = stat ? stat.reconciledOccupancy : (bookingsByRoute.get(route.id)?.length || 0);
    const cap = assignedBus.capacity || 50;

    // Must be <= 50% full to be eligible for route stitching consolidation
    if (occ > 0 && occ / cap <= 0.55) {
      candidateRoutes.push({ route, bus: assignedBus, occupancy: occ });
    }
  }

  const stitchOpportunities: RouteStitchOpportunity[] = [];
  const matchedBusIds = new Set<string>();

  for (let i = 0; i < candidateRoutes.length; i++) {
    for (let j = i + 1; j < candidateRoutes.length; j++) {
      const c1 = candidateRoutes[i];
      const c2 = candidateRoutes[j];

      if (matchedBusIds.has(String(c1.bus.id)) || matchedBusIds.has(String(c2.bus.id))) {
        continue;
      }

      const combinedOccupancy = c1.occupancy + c2.occupancy;
      const targetCap = Math.max(c1.bus.capacity, c2.bus.capacity);

      // Check capacity feasibility
      if (combinedOccupancy > targetCap) continue;

      // Choose target carrier (the bus with greater capacity or higher occupancy)
      const target = c1.bus.capacity >= c2.bus.capacity ? c1 : c2;
      const source = target === c1 ? c2 : c1;

      // Get active stops with passenger drop-offs for both routes
      const bookedStops1 = new Set((bookingsByRoute.get(c1.route.id) || []).map((b) => b.boardingStopId));
      const bookedStops2 = new Set((bookingsByRoute.get(c2.route.id) || []).map((b) => b.boardingStopId));

      const activeStops1 = (c1.route.stops || [])
        .filter((rs) => bookedStops1.has(rs.stopId) || (rs.stop && bookedStops1.has(rs.stop.id)))
        .map((rs) => rs.stop || ({ id: rs.stopId, name: `Stop ${rs.stopId}`, code: rs.stopId, latitude: 0, longitude: 0, landmark: "", geofenceRadiusMeters: 50 } as Stop));
      const activeStops2 = (c2.route.stops || [])
        .filter((rs) => bookedStops2.has(rs.stopId) || (rs.stop && bookedStops2.has(rs.stop.id)))
        .map((rs) => rs.stop || ({ id: rs.stopId, name: `Stop ${rs.stopId}`, code: rs.stopId, latitude: 0, longitude: 0, landmark: "", geofenceRadiusMeters: 50 } as Stop));

      const allActiveStops = Array.from(new Set([...activeStops1, ...activeStops2]));
      // If no stops matched explicitly, use all stops from both routes as active
      const finalStops = allActiveStops.length > 0 
        ? allActiveStops 
        : (c1.route.stops || []).map(rs => rs.stop).filter(Boolean);

      // Clarke-Wright Savings Estimation:
      // Distance of depot to R1 + depot to R2 - distance(R1, R2)
      const d1 = c1.route.totalDistanceKm || 20;
      const d2 = c2.route.totalDistanceKm || 20;
      const directInterDistance = Math.max(4, Math.abs(d1 - d2) + 3); // Approx cross-corridor link
      const savingsKm = Math.round((d1 + d2 - (Math.max(d1, d2) + directInterDistance)) * 10) / 10;

      // Detour time estimation (at campus transit avg 30 km/h)
      const extraKm = directInterDistance;
      const detourMins = Math.round((extraKm / 30) * 60);

      // Verify SLA: maximum detour limit
      if (detourMins > maxDetourMinutes) continue;

      // Calculate net fuel saved: standing down source bus saves its entire run minus extra detour
      const netKmSaved = Math.max(0, source.route.totalDistanceKm - extraKm);
      const fuelSavedLiters = Math.round((netKmSaved / 3.8) * 10) / 10;

      // Total empty intermediate stops bypassed across both full routes
      const totalPossibleStops = (c1.route.stops?.length || 0) + (c2.route.stops?.length || 0);
      const bypassedCount = Math.max(0, totalPossibleStops - finalStops.length);

      matchedBusIds.add(String(c1.bus.id));
      matchedBusIds.add(String(c2.bus.id));

      stitchOpportunities.push({
        id: `STITCH-${source.bus.id}-${target.bus.id}`,
        type: "ROUTE_STITCH_CONSOLIDATION",
        primaryRouteId: target.route.id,
        primaryRouteName: target.route.name,
        secondaryRouteId: source.route.id,
        secondaryRouteName: source.route.name,
        sourceBusId: source.bus.id,
        sourceBusNumber: source.bus.busNumber,
        sourceOccupancy: source.occupancy,
        targetBusId: target.bus.id,
        targetBusNumber: target.bus.busNumber,
        targetOccupancy: target.occupancy,
        targetCapacity: target.bus.capacity,
        combinedOccupancy,
        remainingSeats: Math.max(0, target.bus.capacity - combinedOccupancy),
        activeStops: finalStops,
        bypassedStopsCount: bypassedCount,
        clarkeWrightSavingsKm: Math.max(0, savingsKm),
        estimatedDetourMinutes: detourMins,
        fuelSavedLiters,
        status: "PENDING",
      });
    }
  }

  return stitchOpportunities;
}

/**
 * Stage 3: Master Orchestrator — executes the complete Attendance-Reconciled
 * Hybrid Orchestration Pipeline (Approach C).
 */
export function computeFleetOrchestrationPlan(
  incomingAttendeeStudentIds: Set<string>,
  outgoingBookings: Booking[],
  buses: Bus[],
  routes: Route[],
  mergePoints: any[] = [],
  maxDetourMinutes: number = 15,
  fuelPricePerLiter: number = 90
): FleetOrchestrationPlan {
  // 1. Reconcile attendance
  const summary = reconcileShiftAttendance(incomingAttendeeStudentIds, outgoingBookings, buses);

  // 2. Intra-corridor disassemblies
  const disassemblies = detectIntraCorridorDisassemblies(buses, routes, mergePoints, summary);

  // 3. Inter-corridor route stitches (Clarke-Wright)
  const stitches = computeClarkeWrightRouteStitches(routes, buses, summary, outgoingBookings, maxDetourMinutes);

  const totalFuel = Math.round(
    ([...disassemblies, ...stitches].reduce((acc, curr) => acc + curr.fuelSavedLiters, 0)) * 10
  ) / 10;

  return {
    summary,
    disassemblyOpportunities: disassemblies,
    routeStitchOpportunities: stitches,
    totalVehiclesStoodDown: disassemblies.length + stitches.length,
    totalFuelSavedLiters: totalFuel,
    totalCostSavedINR: Math.round(totalFuel * fuelPricePerLiter),
  };
}

