import { describe, it, expect } from "vitest";
import { decide, stopAtPosition, DUPLICATE_WINDOW_S, type DecisionInput } from "@/lib/gate/decision";

const base: DecisionInput = {
  door: "IN",
  matchedStudentId: null,
  reservedOnThisBus: false,
  atStartStop: false,
  stopIdAtPosition: "stop-1",
  matchingOpenIncidentId: null,
  secondsSinceSameStudentSameDoor: null,
};

describe("In-camera rules", () => {
  it("own bus rider → BOARDED (attendance + reservation)", () => {
    const d = decide({ ...base, matchedStudentId: "s1", reservedOnThisBus: true });
    expect(d.outcome).toBe("BOARDED");
    expect(d.attendance).toBe("BOARDED");
    expect(d.reservationStatus).toBe("BOARDED");
    expect(d.incidents).toHaveLength(0);
  });

  it("known student without reservation on this bus → WRONG_BUS alert", () => {
    const d = decide({ ...base, matchedStudentId: "s1", reservedOnThisBus: false });
    expect(d.outcome).toBe("WRONG_BUS");
    expect(d.attendance).toBe("WRONG_BUS_TAP");
    expect(d.reservationStatus).toBeNull();
    expect(d.incidents[0]).toMatchObject({ type: "WRONG_BUS_BOARDING", withEvidence: true });
  });

  it("unknown face → UNAUTHORIZED incident with evidence + stored face for exit matching", () => {
    const d = decide(base);
    expect(d.outcome).toBe("UNAUTHORIZED");
    expect(d.attendance).toBeNull();
    expect(d.incidents[0]).toMatchObject({ type: "UNAUTHORIZED_INTRUDER", severity: "CRITICAL", withEvidence: true, storeFaceForExitMatching: true });
  });

  it("same student at same door inside the window → DUPLICATE, no side effects", () => {
    const d = decide({ ...base, matchedStudentId: "s1", reservedOnThisBus: true, secondsSinceSameStudentSameDoor: 30 });
    expect(d.outcome).toBe("DUPLICATE");
    expect(d.attendance).toBeNull();
    expect(d.incidents).toHaveLength(0);
  });

  it("same student after the window → processed again", () => {
    const d = decide({ ...base, matchedStudentId: "s1", reservedOnThisBus: true, secondsSinceSameStudentSameDoor: DUPLICATE_WINDOW_S + 1 });
    expect(d.outcome).toBe("BOARDED");
  });
});

describe("Out-camera rules at the start stop", () => {
  const start = { ...base, door: "OUT" as const, atStartStop: true, stopIdAtPosition: "stop-start" };

  it("valid rider steps out → ROAMING + conductor notified", () => {
    const d = decide({ ...start, matchedStudentId: "s1", reservedOnThisBus: true });
    expect(d.outcome).toBe("ROAMING");
    expect(d.roaming).toBe(true);
    expect(d.notifyConductor).toBe(true);
    expect(d.reservationStatus).toBeNull();
  });

  it("unknown person who was flagged boarding leaves → incident resolved", () => {
    const d = decide({ ...start, matchingOpenIncidentId: "inc-9" });
    expect(d.outcome).toBe("INTRUDER_LEFT");
    expect(d.resolveIncidentId).toBe("inc-9");
    expect(d.incidents).toHaveLength(0);
  });

  it("unknown person not previously flagged → logged only", () => {
    const d = decide(start);
    expect(d.outcome).toBe("UNKNOWN_LEFT_AT_START");
    expect(d.incidents).toHaveLength(0);
  });
});

describe("Out-camera rules en route", () => {
  const route = { ...base, door: "OUT" as const, atStartStop: false };

  it("rider exits at a stop → ALIGHTED", () => {
    const d = decide({ ...route, matchedStudentId: "s1", reservedOnThisBus: true, stopIdAtPosition: "stop-5" });
    expect(d.outcome).toBe("ALIGHTED");
    expect(d.reservationStatus).toBe("ALIGHTED");
    expect(d.incidents).toHaveLength(0);
  });

  it("rider exits away from every stop → ALIGHTED + UNEXPECTED_EXIT", () => {
    const d = decide({ ...route, matchedStudentId: "s1", reservedOnThisBus: true, stopIdAtPosition: null });
    expect(d.outcome).toBe("ALIGHTED");
    expect(d.incidents.map((x) => x.type)).toEqual(["UNEXPECTED_EXIT"]);
    expect(d.notifyConductor).toBe(true);
  });

  it("unknown person exits at a stop → UNKNOWN_DEBOARDER incident with evidence", () => {
    const d = decide({ ...route, stopIdAtPosition: "stop-5" });
    expect(d.outcome).toBe("UNKNOWN_DEBOARDER");
    expect(d.incidents.map((x) => x.type)).toEqual(["UNKNOWN_DEBOARDER"]);
    expect(d.incidents[0].withEvidence).toBe(true);
  });

  it("unknown person exits off-stop → UNKNOWN_DEBOARDER + UNEXPECTED_EXIT", () => {
    const d = decide({ ...route, stopIdAtPosition: null });
    expect(d.incidents.map((x) => x.type)).toEqual(["UNKNOWN_DEBOARDER", "UNEXPECTED_EXIT"]);
  });

  it("flagged intruder exits en route → resolve their incident", () => {
    const d = decide({ ...route, matchingOpenIncidentId: "inc-1", stopIdAtPosition: "stop-5" });
    expect(d.outcome).toBe("INTRUDER_LEFT");
    expect(d.resolveIncidentId).toBe("inc-1");
    expect(d.incidents).toHaveLength(0);
  });
});

describe("stopAtPosition geofence", () => {
  const stops = [
    { id: "a", latitude: 29.35, longitude: 79.55, geofence_radius: 100 },
    { id: "b", latitude: 29.36, longitude: 79.56, geofence_radius: null },
  ];
  it("inside the radius", () => expect(stopAtPosition(stops, 29.3502, 79.5501)).toBe("a"));
  it("outside every radius", () => expect(stopAtPosition(stops, 29.4, 79.6)).toBeNull());
  it("missing GPS counts as no stop", () => expect(stopAtPosition(stops, null, null)).toBeNull());
  it("default radius 120 m when unset", () => expect(stopAtPosition(stops, 29.3609, 79.56)).toBe("b"));
});
