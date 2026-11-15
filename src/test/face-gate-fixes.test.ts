import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({ supabaseAdmin: {}, db: {} }));
import { decide } from "@/lib/gate/decision";
import { pickReservation } from "@/lib/gate/processor";
import { checkEnrollmentPoses } from "@/lib/face/pose";

const base = {
  door: "OUT" as const,
  matchedStudentId: "s1",
  reservedOnThisBus: true,
  atStartStop: false,
  stopIdAtPosition: null,
  matchingOpenIncidentId: null,
  secondsSinceSameStudentSameDoor: null,
};

describe("decide without GPS", () => {
  it("treats a missing fix as unknown position, not an off-stop exit", () => {
    const d = decide({ ...base, gpsKnown: false });
    expect(d.outcome).toBe("ALIGHTED");
    expect(d.incidents).toEqual([]);
    expect(d.notifyConductor).toBe(false);
  });
  it("still flags a real off-stop exit when GPS is known", () => {
    const d = decide({ ...base, gpsKnown: true });
    expect(d.incidents.map((i) => i.type)).toContain("UNEXPECTED_EXIT");
  });
});

describe("pickReservation", () => {
  const roster = [
    { id: "am", student_id: "s1", status: "BOARDED", trip_id: "t-am", shift_id: "morning" },
    { id: "pm", student_id: "s1", status: "ASSIGNED", trip_id: "t-pm", shift_id: "evening" },
    { id: "x", student_id: "s2", status: "ASSIGNED", trip_id: null, shift_id: "evening" },
  ];
  it("uses the reservation of the capture's trip, not the first one", () => {
    expect(pickReservation(roster, "s1", { id: "t-pm", shift_id: "evening" })?.id).toBe("pm");
    expect(pickReservation(roster, "s1", { id: "t-am", shift_id: "morning" })?.id).toBe("am");
  });
  it("falls back to the same shift when the reservation has no trip yet", () => {
    expect(pickReservation(roster, "s2", { id: "t-pm", shift_id: "evening" })?.id).toBe("x");
  });
  it("returns null when the student is booked only on another trip", () => {
    expect(pickReservation(roster, "s2", { id: "t-am", shift_id: "morning" })).toBeNull();
  });
});

describe("checkEnrollmentPoses turn direction", () => {
  const gates = { frontalMax: 0.1, turnMin: 0.12 };
  it("accepts a turn to the requested side", () => {
    expect(checkEnrollmentPoses([0.02, 0.2], gates, { side: "LEFT", signed: [0.02, 0.2] })).toEqual({ ok: true });
    expect(checkEnrollmentPoses([0.02, 0.2], gates, { side: "RIGHT", signed: [0.02, -0.2] })).toEqual({ ok: true });
  });
  it("rejects a turn to the other side", () => {
    expect(checkEnrollmentPoses([0.02, 0.2], gates, { side: "RIGHT", signed: [0.02, 0.2] })).toEqual({ ok: false, code: "WRONG_TURN_DIRECTION" });
  });
  it("skips the side check when the face service sends no signed yaw", () => {
    expect(checkEnrollmentPoses([0.02, 0.2], gates, { side: "RIGHT", signed: [null, null] })).toEqual({ ok: true });
  });
});
