/**
 * CampusFleet Sequential Express Zone & Bus Clustering Algorithm
 * 
 * Implements the High-Efficiency Fleet Optimization Standard:
 * 1. Clusters and orders students along a route from [Route Start -> Route End / Campus].
 * 2. Sequentially fills buses starting from Stop #0.
 * 3. Once Bus 1 reaches 100% capacity, it converts to EXPRESS MODE:
 *    - Immediately bypasses all remaining intermediate stops and runs direct to Campus.
 *    - Saves 15-30 minutes for all onboard passengers.
 * 4. Bus 2 begins pickups directly from (Last Full Stop + 1):
 *    - Avoids driving empty or making redundant stops along the first leg.
 *    - Saves massive fleet fuel and deadhead mileage.
 * 5. Trailing buses only serve the short final segment near destination.
 */

import { Stop, Route, Bus, Student } from "./types";
import { calculateHaversineDistanceKm } from "./eta-calculator";

export interface ClusteredStudent {
  studentId: string;
  studentName?: string;
  pickupStopId: string;
  pickupStopName: string;
  stopOrder: number;
  homeLatitude?: number;
  homeLongitude?: number;
}

export interface ClusteredBusPlan {
  busId: string | number;
  busNumber: string | number;
  capacity: number;
  assignedStudentCount: number;
  assignedStudents: ClusteredStudent[];
  servicedStops: Stop[];
  startPickupStop: Stop;
  lastPickupStop: Stop;
  isExpressDirect: boolean;
  bypassedStops: Stop[];
  bypassedStopsCount: number;
  estimatedMinutesSaved: number;
  estimatedFuelSavedLiters: number;
}

export interface SequentialClusteringResult {
  routeId: string;
  routeName: string;
  totalStudents: number;
  totalBusesDeployed: number;
  totalExpressBuses: number;
  totalMinutesSavedFleet: number;
  totalFuelSavedLiters: number;
  busPlans: ClusteredBusPlan[];
  unassignedStudents: ClusteredStudent[];
}

/**
 * Runs the Sequential Fill & Express Clustering Algorithm for a corridor
 */
export function clusterRouteStudentsSequentially(
  route: Route,
  allStops: Stop[],
  students: {
    studentId: string;
    studentName?: string;
    pickupStopId: string;
    homeLatitude?: number;
    homeLongitude?: number;
  }[],
  availableBuses: Bus[],
  campusStop?: Stop
): SequentialClusteringResult {
  const routeStopMap = new Map<string, number>();
  const stopObjectMap = new Map<string, Stop>();

  allStops.forEach((s) => stopObjectMap.set(s.id, s));

  // Extract ordered stops for this route
  const orderedRouteStops: Stop[] = (route.stops || [])
    .map((rs: any) => {
      const stopObj = rs.stop || stopObjectMap.get(rs.stopId || rs.stop_id);
      return {
        stop: stopObj,
        order: rs.stopOrder ?? rs.stop_order ?? 0,
      };
    })
    .filter((item: any) => item.stop)
    .sort((a: any, b: any) => a.order - b.order)
    .map((item: any) => item.stop);

  // If route stops were empty, fallback to allStops
  const effectiveStops = orderedRouteStops.length > 0 ? orderedRouteStops : allStops;
  effectiveStops.forEach((s, idx) => routeStopMap.set(s.id, idx));

  // Campus terminal resolution
  const campus =
    campusStop ||
    effectiveStops[effectiveStops.length - 1] || {
      id: "campus-terminal",
      name: "Campus Terminal",
      code: "CAMPUS",
      latitude: 29.375,
      longitude: 79.529,
    };

  // 1. Group & Sort students strictly by their stop index along the route [0 -> N]
  const clusteredStudents: ClusteredStudent[] = students
    .map((s) => {
      const stopIdx = routeStopMap.has(s.pickupStopId) ? routeStopMap.get(s.pickupStopId)! : 999;
      const stopObj = stopObjectMap.get(s.pickupStopId);
      return {
        studentId: s.studentId,
        studentName: s.studentName || `Student ${s.studentId}`,
        pickupStopId: s.pickupStopId,
        pickupStopName: stopObj?.name || "Designated Stop",
        stopOrder: stopIdx,
        homeLatitude: s.homeLatitude,
        homeLongitude: s.homeLongitude,
      };
    })
    .filter((s) => s.stopOrder !== 999)
    .sort((a, b) => a.stopOrder - b.stopOrder);

  // 2. Sequential Bus Filling
  const busPlans: ClusteredBusPlan[] = [];
  let studentCursor = 0;
  const activeBuses = availableBuses.filter((b) => b.status !== "MAINTENANCE" && b.status !== "INACTIVE");

  for (let bIdx = 0; bIdx < activeBuses.length; bIdx++) {
    if (studentCursor >= clusteredStudents.length) break;

    const bus = activeBuses[bIdx];
    const capacity = bus.capacity || 50;
    const assignedForThisBus: ClusteredStudent[] = [];

    while (studentCursor < clusteredStudents.length && assignedForThisBus.length < capacity) {
      assignedForThisBus.push(clusteredStudents[studentCursor]);
      studentCursor++;
    }

    if (assignedForThisBus.length === 0) continue;

    // First and last pickup stop for this bus
    const firstStopIdx = assignedForThisBus[0].stopOrder;
    const lastStopIdx = assignedForThisBus[assignedForThisBus.length - 1].stopOrder;

    const startPickupStop = effectiveStops[firstStopIdx] || effectiveStops[0];
    const lastPickupStop = effectiveStops[lastStopIdx] || effectiveStops[effectiveStops.length - 1];

    // Check if bus reached capacity and can run EXPRESS
    const isFullCapacity = assignedForThisBus.length >= capacity;
    const hasRemainingStops = lastStopIdx < effectiveStops.length - 1;
    const isExpressDirect = isFullCapacity && hasRemainingStops;

    // Serviced stops: from firstStopIdx to lastStopIdx, plus Campus
    const serviced = effectiveStops.slice(firstStopIdx, lastStopIdx + 1);
    if (!serviced.some((s) => s.id === campus.id)) {
      serviced.push(campus);
    }

    // Bypassed stops (stops between last pickup and campus that this bus skips)
    const bypassed = isExpressDirect
      ? effectiveStops.slice(lastStopIdx + 1, effectiveStops.length).filter((s) => s.id !== campus.id)
      : [];

    // Savings metrics
    const bypassedStopsCount = bypassed.length;
    // Average 2.5 minutes dwell & deceleration saved per bypassed stop
    const estimatedMinutesSaved = bypassedStopsCount * 2.5;

    // Fuel savings: ~0.4L saved per skipped stop plus deadhead avoidance
    // For subsequent buses (bIdx > 0), they start at firstStopIdx, skipping stops [0 -> firstStopIdx - 1]
    const skippedStartStops = firstStopIdx;
    const estimatedFuelSavedLiters = Math.round((bypassedStopsCount * 0.35 + skippedStartStops * 0.5) * 10) / 10;

    busPlans.push({
      busId: bus.id,
      busNumber: bus.busNumber || `Bus ${bus.id}`,
      capacity,
      assignedStudentCount: assignedForThisBus.length,
      assignedStudents: assignedForThisBus,
      servicedStops: serviced,
      startPickupStop,
      lastPickupStop,
      isExpressDirect,
      bypassedStops: bypassed,
      bypassedStopsCount,
      estimatedMinutesSaved,
      estimatedFuelSavedLiters,
    });
  }

  const unassignedStudents = clusteredStudents.slice(studentCursor);
  const totalExpressBuses = busPlans.filter((b) => b.isExpressDirect).length;
  const totalMinutesSavedFleet = busPlans.reduce((acc, b) => acc + b.estimatedMinutesSaved, 0);
  const totalFuelSavedLiters = busPlans.reduce((acc, b) => acc + b.estimatedFuelSavedLiters, 0);

  return {
    routeId: route.id,
    routeName: route.name,
    totalStudents: clusteredStudents.length,
    totalBusesDeployed: busPlans.length,
    totalExpressBuses,
    totalMinutesSavedFleet,
    totalFuelSavedLiters,
    busPlans,
    unassignedStudents,
  };
}

