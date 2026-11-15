import { describe, it, expect } from "vitest";
import { planTrips, type PlanShift } from "@/lib/trip-planner";

const shifts: PlanShift[] = [
  { id: "in-7", direction: "HOME_TO_CAMPUS", start: "07:15:00", end: "08:30:00" },
  { id: "out-1", direction: "CAMPUS_TO_HOME", start: "13:00:00", end: "14:15:00" },
  { id: "out-4", direction: "CAMPUS_TO_HOME", start: "16:30:00", end: "17:45:00" },
  { id: "out-430", direction: "CAMPUS_TO_HOME", start: "16:30:00", end: "17:45:00" },
];
const routes = [{ id: "r1" }, { id: "r2" }];

describe("planTrips", () => {
  it("one trip per needed shift on a route, all on the one bus when times do not overlap", () => {
    const plan = planTrips({ routes, buses: [{ id: 1, routeId: "r1" }], shifts, demand: new Map([["r1", new Set(["in-7", "out-1", "out-4"])]]) });
    expect(plan).toEqual([
      { routeId: "r1", shiftId: "in-7", busId: 1 },
      { routeId: "r1", shiftId: "out-1", busId: 1 },
      { routeId: "r1", shiftId: "out-4", busId: 1 },
    ]);
  });

  it("overlapping shifts use a second bus on the route, else are created without a bus", () => {
    const demand = new Map([["r1", new Set(["out-4", "out-430"])]]);
    const two = planTrips({ routes, buses: [{ id: 1, routeId: "r1" }, { id: 2, routeId: "r1" }], shifts, demand });
    expect(two.map((t) => t.busId)).toEqual([1, 2]);
    const one = planTrips({ routes, buses: [{ id: 1, routeId: "r1" }], shifts, demand });
    expect(one.map((t) => t.busId)).toEqual([1, null]);
  });

  it("skips routes and shifts nobody needs, and pairs that already exist", () => {
    const plan = planTrips({
      routes,
      buses: [{ id: 1, routeId: "r1" }, { id: 2, routeId: "r2" }],
      shifts,
      demand: new Map([["r1", new Set(["in-7", "out-1"])]]),
      existing: new Set(["r1|in-7"]),
    });
    expect(plan).toEqual([{ routeId: "r1", shiftId: "out-1", busId: 1 }]);
  });

  it("without any timetable: first incoming + every outgoing shift, only on routes with a bus", () => {
    const plan = planTrips({ routes, buses: [{ id: 1, routeId: "r1" }], shifts, demand: null });
    expect(plan.map((t) => t.shiftId)).toEqual(["in-7", "out-1", "out-4", "out-430"]);
    expect(plan.every((t) => t.routeId === "r1")).toBe(true);
  });
});
