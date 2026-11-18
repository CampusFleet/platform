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

import { framingIssue, headBox } from "@/lib/face/pose";

/** 478 landmarks filling a box (cx, cy, w, h) in normalised units. */
function mesh(cx: number, cy: number, w: number, h: number) {
  return Array.from({ length: 478 }, (_, i) => ({ x: cx - w / 2 + ((i % 2) * w), y: cy - h / 2 + ((i % 3) / 2) * h }));
}

describe("full-head framing", () => {
  it("accepts a centred face with room for the head", () => {
    expect(framingIssue(mesh(0.5, 0.55, 0.35, 0.4))).toBeNull();
  });
  it("asks to move back when the top of the head is out of frame", () => {
    expect(framingIssue(mesh(0.5, 0.3, 0.35, 0.45))).toBe("HEAD_CUT");
  });
  it("estimates the crown above the mesh top", () => {
    const h = headBox(mesh(0.5, 0.5, 0.3, 0.4));
    expect(h.top).toBeCloseTo(0.5 - 0.2 - 0.12, 5);
    expect(h.bottom).toBeCloseTo(0.7, 5);
  });
});

import { checkTurnOrder, pitchRatio } from "@/lib/face/pose";

describe("multi-angle scan", () => {
  it("accepts sides in the challenged order and rejects the reverse", () => {
    expect(checkTurnOrder([0, 0.2, -0.2, 0, 0, 0], "LEFT", 0.12)).toBe(true);
    expect(checkTurnOrder([0, -0.2, 0.2, 0, 0, 0], "LEFT", 0.12)).toBe(false);
    expect(checkTurnOrder([0, -0.2, 0.2, 0, 0, 0], "RIGHT", 0.12)).toBe(true);
  });
  it("does not fail when the face service sends no signed yaw", () => {
    expect(checkTurnOrder([null, null, null], "LEFT", 0.12)).toBe(true);
  });
  it("measures vertical tilt from landmarks", () => {
    const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    for (const i of [33, 133, 362, 263]) lm[i] = { x: 0.5, y: 0.4 };
    lm[1] = { x: 0.5, y: 0.5 };
    lm[152] = { x: 0.5, y: 0.65 };
    expect(pitchRatio(lm)).toBeCloseTo(0.4, 5);
  });
});
