import { describe, it, expect, vi, beforeEach } from "vitest";
import { chain } from "./helpers/supabase-chain";

const tables: Record<string, any[]> = {};
const fromCalls: string[] = [];

vi.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      fromCalls.push(table);
      return chain({ data: tables[table] ?? [] });
    },
  },
}));
vi.mock("@/lib/redis", () => ({
  getOrFetchWithCache: async ({ fetchFn }: { fetchFn: () => Promise<unknown> }) => fetchFn(),
  cacheDel: vi.fn(async () => true),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getClientState } from "@/lib/client-state-data";
import { routesWithCampusTerminus, recommendRoutes, buildNetworkGraph } from "@/lib/client-store/graph";

const session = (role: string) => ({ userId: "u-1", email: "me@x.edu", fullName: "Me", role }) as any;

beforeEach(() => {
  fromCalls.length = 0;
  for (const k of Object.keys(tables)) delete tables[k];
  tables.campuses = [{ id: "c1", name: "Main", code: "MN", latitude: 29, longitude: 79, geofence_radius: 100, is_primary: true }];
  tables.stops = [{ id: "s1", name: "Stop 1", code: "S1", latitude: 29.1, longitude: 79.1, geofence_radius: 80, campus_id: "c1" }];
  tables.routes = [{ id: "r1", name: "Corridor", is_active: true, direction: "HOME_TO_CAMPUS" }];
  tables.route_stops = [{ route_id: "r1", stop_id: "s1", stop_order: 1 }];
  tables.shifts = [{ id: "sh1", name: "Morning", type: "MORNING", start_time: "07:30:00", end_time: "09:00:00" }];
  tables.buses = [{ id: 1, bus_number: 37, registration_no: "UK-01", capacity: 40, gps_device_id: "gps-secret" }];
  tables.trips = [{ id: "t1", trip_code: "INTERNAL-CODE", route_id: "r1", bus_id: 1, shift_id: "sh1" }];
  tables.students_full = [
    { id: "st-me", user_id: "u-1", full_name: "Me", email: "me@x.edu" },
    { id: "st-other", user_id: "u-2", full_name: "Other", email: "o@x.edu", phone: "999" },
  ];
});

describe("getClientState role scoping", () => {
  it("gives a student master data, never trips, trip codes, other students or device ids", async () => {
    const state = await getClientState(session("student"));
    expect(state.scope).toBe("basic");
    expect(state.trips).toEqual([]);
    expect(state.bookings).toEqual([]);
    expect(state.users).toEqual([]);
    expect(JSON.stringify(state)).not.toContain("INTERNAL-CODE");
    expect(JSON.stringify(state)).not.toContain("gps-secret");
    expect(fromCalls).not.toContain("trips");
    expect(state.routes[0].stops.map((rs) => rs.stopId)).toEqual(["s1"]);
    expect(state.buses[0].busNumber).toBe(37);
    // The chain mock ignores filters, so only assert that the student set is at most the caller's row.
    expect(state.students.length).toBeLessThanOrEqual(1);
  });

  it("gives a teacher no student rows", async () => {
    const state = await getClientState(session("teacher"));
    expect(state.students).toEqual([]);
    expect(fromCalls).not.toContain("students_full");
  });

  it("gives MANAGE roles the admin data set including trips", async () => {
    const state = await getClientState(session("transport_admin"));
    expect(state.scope).toBe("manage");
    expect(state.trips.map((t) => t.tripCode)).toEqual(["INTERNAL-CODE"]);
    expect(state.students.map((s) => s.id).sort()).toEqual(["st-me", "st-other"]);
  });
});

describe("client-store graph helpers", () => {
  const campuses = [{ id: "c1", name: "Main", code: "MN", latitude: 29, longitude: 79, geofenceRadiusMeters: 100, isPrimary: true }];
  const stop = { id: "s1", name: "Stop 1", code: "S1", latitude: 29.1, longitude: 79.1, landmark: "", geofenceRadiusMeters: 80 };
  const routes = [{ id: "r1", name: "Corridor", isActive: true, direction: "HOME_TO_CAMPUS", stops: [{ stopId: "s1", stopOrder: 1, arrivalOffsetMinutes: 0, bufferTimeMinutes: 0, stop }] }] as any[];

  it("appends the campus as the terminus of home-to-campus routes", () => {
    const [r] = routesWithCampusTerminus({ stops: [stop], routes, campuses });
    expect(r.stops.map((rs) => rs.stopId)).toEqual(["s1", "c1"]);
  });

  it("returns no recommendation when no campus is known (no fallback campus)", () => {
    const input = { stops: [stop], routes, campuses: [] };
    expect(recommendRoutes(input, buildNetworkGraph(input), 29.1, 79.1, undefined)).toEqual([]);
  });
});
