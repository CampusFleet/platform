import { describe, expect, it, vi, beforeEach } from "vitest";
import { chain } from "./helpers/supabase-chain";

let tripsToday: any[] = [];
vi.mock("@/lib/supabaseClient", () => ({
  supabaseAdmin: { from: vi.fn(() => chain({ data: tripsToday })) },
  db: {},
}));
vi.mock("@/lib/daily-rollover", () => ({ executeDailyRollover: vi.fn() }));
import { checkShiftChange, type ShiftRow } from "@/lib/shifts/changes";

const old: ShiftRow = { id: "sh", name: "Morning", start_time: "07:30:00", end_time: "08:45:00", booking_cutoff_minutes: 30, direction: "HOME_TO_CAMPUS", is_active: true };
const run = (p: Partial<any> = {}) => ({ id: "t", bus_id: 1, status: "SCHEDULED", manifest_locked: false, started_at: null, ...p });

describe("checkShiftChange", () => {
  beforeEach(() => (tripsToday = []));
  it("allows a time change before today's run leaves", async () => {
    tripsToday = [run()];
    expect(await checkShiftChange(old, { start_time: "07:45:00" })).toBeNull();
  });
  it("refuses a time change once the run left or its chart is final", async () => {
    tripsToday = [run({ status: "IN_PROGRESS" })];
    expect(await checkShiftChange(old, { start_time: "07:45:00" })).toMatch(/already left/);
    tripsToday = [run({ manifest_locked: true })];
    expect(await checkShiftChange(old, { booking_cutoff_minutes: 15 })).toMatch(/already left/);
  });
  it("refuses switching off a shift with unfinished runs today", async () => {
    tripsToday = [run()];
    expect(await checkShiftChange(old, { is_active: false })).toMatch(/Cancel them/);
  });
  it("refuses a direction change while runs exist", async () => {
    tripsToday = [run()];
    expect(await checkShiftChange(old, { direction: "CAMPUS_TO_HOME" })).toMatch(/direction/);
  });
  it("ignores a rename", async () => {
    tripsToday = [run({ status: "IN_PROGRESS" })];
    expect(await checkShiftChange(old, {})).toBeNull();
  });
});
