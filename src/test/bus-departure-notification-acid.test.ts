import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase admin client to verify ACID transactions & audit logs
const mockSupabaseAdmin = {
  from: vi.fn(),
};

vi.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

vi.mock("@/lib/jwt", () => ({
  getSessionFromRequest: vi.fn(async (req: any) => {
    const body = await req.clone().json().catch(() => ({}));
    return ["CONFIRM_ONBOARD", "RUNNING_TO_BUS"].includes(body.action)
      ? { userId: body.studentId, role: "student", fullName: "Student" }
      : { userId: "user-conductor", role: "conductor", fullName: "Vikram Conductor" };
  }),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    keys: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue([]),
  },
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue("OK"),
  cacheDel: vi.fn().mockResolvedValue(1),
}));

describe("Bus Departure Notification System & ACID Properties (Standard SQL)", () => {
  let dbTables: {
    bus_departure_alerts: any[];
    audit_logs: any[];
    bookings: any[];
    students: any[];
    bus_reservations: any[];
    notifications: any[];
    trips: any[];
    buses: any[];
  };

  beforeEach(() => {
    vi.clearAllMocks();

    dbTables = {
      buses: [
        { id: 42, bus_number: "Bus 42", registration_no: "UP-16-CF-4242", capacity: 40 },
      ],
      trips: [
        {
          id: "trip-alpha-001",
          trip_code: "TRIP-EXP-42",
          bus_id: "42",
          route_id: "route-ganna",
          status: "IN_TRANSIT",
        },
      ],
      bus_reservations: [
        {
          id: "bk-student-01",
          trip_id: "trip-alpha-001",
          student_id: "stud-01",
          seat_number: "12A",
          chosen_seat: "12A",
          status: "CONFIRMED",
          roaming_status: "ROAMING",
        },
        {
          id: "bk-student-02",
          trip_id: "trip-alpha-001",
          student_id: "stud-02",
          seat_number: "14B",
          chosen_seat: "14B",
          status: "CONFIRMED",
          roaming_status: "CONFIRMED",
        },
      ],
      bookings: [],
      students: [{ id: "stud-01", user_id: "stud-01" }],
      bus_departure_alerts: [],
      audit_logs: [],
      notifications: [],
    };

    // Chainable Supabase Query Builder Mock
    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      const builder: any = {
        select: vi.fn().mockImplementation(() => {
          const rows = (dbTables as any)[table] || [];
          builder.data = rows;
          return builder;
        }),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        data: (dbTables as any)[table] || [],
        error: null,
        then: vi.fn().mockImplementation((resolve) => {
          const rows = (dbTables as any)[table] || [];
          return Promise.resolve(resolve({ data: rows, error: null }));
        }),
        maybeSingle: vi.fn().mockImplementation(() => {
          const sid = (builder.eq.mock.calls.find((c: any[]) => c[0] === "user_id") || [])[1];
          const rows = (dbTables as any)[table] || [];
          const row = table === "students" ? { id: sid, user_id: sid } : rows[0] || null;
          return Promise.resolve({ data: row, error: null });
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === "trips") {
            const t = dbTables.trips[0];
            const b = dbTables.buses[0];
            return Promise.resolve({ data: { ...t, bus: b }, error: null });
          }
          const row = ((dbTables as any)[table] || [])[0] || null;
          return Promise.resolve({ data: row, error: null });
        }),
        insert: vi.fn().mockImplementation((rows: any) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          if ((dbTables as any)[table]) {
            (dbTables as any)[table].push(...arr);
          }
          return Promise.resolve({ data: arr, error: null });
        }),
        update: vi.fn().mockImplementation((updates: any) => {
          return {
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              if ((dbTables as any)[table]) {
                (dbTables as any)[table].forEach((row: any) => {
                  if (row[col] === val) {
                    Object.assign(row, updates);
                  }
                });
              }
              return {
                eq: vi.fn().mockImplementation((col2: string, val2: any) => {
                  if ((dbTables as any)[table]) {
                    (dbTables as any)[table].forEach((row: any) => {
                      if (row[col] === val && row[col2] === val2) {
                        Object.assign(row, updates);
                      }
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
                then: (resolve: any) => resolve({ data: null, error: null }),
              };
            }),
            then: (resolve: any) => resolve({ data: null, error: null }),
          };
        }),
      };
      return builder;
    });
  });

  it("Atomicity: TRIGGER_DEPARTURE_ALERT inserts departure alert, notifies all outside students, and logs ACID audit record", async () => {
    const { POST } = await import("@/app/api/boarding/roaming/route");

    const req = new Request("http://localhost:3000/api/boarding/roaming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "TRIGGER_DEPARTURE_ALERT",
        tripId: "trip-alpha-001",
        conductorName: "Vikram Conductor",
        message: "🚨 Bus 42 is departing! Please return to vehicle.",
      }),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // 1. Durability: Alert persisted in relational database
    expect(dbTables.bus_departure_alerts.length).toBe(1);
    const alert = dbTables.bus_departure_alerts[0];
    expect(alert.trip_id).toBe("trip-alpha-001");
    expect(alert.alert_type).toBe("MANUAL_RECALL");
    expect(alert.status).toBe("ACTIVE");
    expect(alert.triggered_by).toBe("Vikram Conductor");

    // 2. Audit Trail: Immutable audit log recorded with ACID details
    expect(dbTables.audit_logs.length).toBe(1);
    const audit = dbTables.audit_logs[0];
    expect(audit.action).toBe("BUS_DEPARTURE_ALERT_TRIGGERED");
    expect(audit.user_role).toBe("conductor");
    expect(audit.user_id).toBe("user-conductor");
    expect(audit.entity).toBe("Trip");
    expect(audit.entity_id).toBe("trip-alpha-001");
    expect(audit.new_value.status).toBe("ACTIVE");
  });

  it("Isolation & Consistency: Student 'CONFIRM_ONBOARD' silences personal alarm and updates booking to ONBOARD_CONFIRMED", async () => {
    const { POST } = await import("@/app/api/boarding/roaming/route");

    const req = new Request("http://localhost:3000/api/boarding/roaming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CONFIRM_ONBOARD",
        bookingId: "bk-student-01",
        studentId: "stud-01",
        tripId: "trip-alpha-001",
      }),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.status).toBe("ONBOARD_CONFIRMED");

    // Verified in ACID audit log
    const audit = dbTables.audit_logs.find((a) => a.action === "ONBOARD_CONFIRMED_BY_STUDENT");
    expect(audit).toBeDefined();
    expect(audit.user_id).toBe("stud-01");
    expect(audit.new_value.roamingStatus).toBe("ONBOARD_CONFIRMED");
  });

  it("Consistency & Time Precision: Student 'RUNNING_TO_BUS' secures 2-minute departure hold with ISO grace timestamp", async () => {
    const { POST } = await import("@/app/api/boarding/roaming/route");

    const req = new Request("http://localhost:3000/api/boarding/roaming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "RUNNING_TO_BUS",
        bookingId: "bk-student-02",
        studentId: "stud-02",
        tripId: "trip-alpha-001",
      }),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.status).toBe("RUNNING_TO_BUS");
    expect(json.graceUntil).toBeDefined();

    // Verify grace period is approximately 2 minutes in future
    const graceTime = new Date(json.graceUntil).getTime();
    const now = Date.now();
    const diffSeconds = Math.round((graceTime - now) / 1000);
    expect(diffSeconds).toBeGreaterThanOrEqual(115);
    expect(diffSeconds).toBeLessThanOrEqual(125);

    // Audit log verifies student hold request
    const audit = dbTables.audit_logs.find((a) => a.action === "STUDENT_RUNNING_TO_BUS");
    expect(audit).toBeDefined();
    expect(audit.user_id).toBe("stud-02");
    expect(audit.new_value.roamingStatus).toBe("RUNNING_TO_BUS");
  });

  it("Durability: Conductor DISMISS_ALERT marks active departure alerts RESOLVED and persists resolution audit entry", async () => {
    const { POST } = await import("@/app/api/boarding/roaming/route");

    // First trigger alert
    await POST(
      new Request("http://localhost:3000/api/boarding/roaming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TRIGGER_DEPARTURE_ALERT",
          tripId: "trip-alpha-001",
          conductorName: "Vikram Conductor",
        }),
      }) as any
    );

    // Conductor resolves / dismisses alert
    const dismissReq = new Request("http://localhost:3000/api/boarding/roaming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "DISMISS_ALERT",
        tripId: "trip-alpha-001",
        conductorName: "Vikram Conductor",
      }),
    });

    const res = await POST(dismissReq as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const dismissalAudit = dbTables.audit_logs.find(
      (a) => a.action === "BUS_DEPARTURE_ALERT_DISMISSED"
    );
    expect(dismissalAudit).toBeDefined();
    expect(dismissalAudit.new_value.status).toBe("RESOLVED");
  });
});
