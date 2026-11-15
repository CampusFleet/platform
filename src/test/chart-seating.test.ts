import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  reservations: [] as { id: string; student_id: string; chosen_seat: string | null; status: string }[],
  clashOnce: null as string | null,
  teachers: [] as { id: string; user_id: string; chosen_seat: string | null; status: string }[],
};

vi.mock("@/lib/supabaseClient", () => {
  const from = (table: string) => {
    const q: any = { filters: {} as Record<string, unknown>, patch: null as any };
    q.select = () => q;
    q.eq = (k: string, v: unknown) => ((q.filters[k] = v), q);
    q.not = () => q;
    q.neq = () => q;
    q.in = () => q;
    q.is = () => q;
    q.update = (patch: any) => ((q.patch = patch), q);
    q.maybeSingle = async () => {
      if (table === "buses") return { data: { id: 1, capacity: 8, seat_layout: "2x2", total_rows: null, teacher_seats_count: 2 } };
      if (table === "teacher_reservations" && q.patch) {
        const t = state.teachers.find((x) => x.id === q.filters.id && !x.chosen_seat);
        if (!t) return { data: null, error: null };
        t.chosen_seat = q.patch.chosen_seat;
        return { data: { id: t.id }, error: null };
      }
      if (table === "bus_reservations" && q.patch) {
        const seat = q.patch.chosen_seat;
        if (state.clashOnce === seat) {
          state.clashOnce = null;
          return { data: null, error: { code: "23505" } };
        }
        const r = state.reservations.find((x) => x.id === q.filters.id && !x.chosen_seat);
        if (!r) return { data: null, error: null };
        r.chosen_seat = seat;
        return { data: { id: r.id }, error: null };
      }
      return { data: null };
    };
    q.then = (resolve: any) =>
      resolve(
        table === "bus_reservations"
          ? { data: state.reservations.map((r) => ({ ...r })) }
          : table === "teacher_reservations"
          ? { data: state.teachers.map((t) => ({ ...t })) }
          : { data: [] }
      );
    return q;
  };
  return { db: { from } };
});

import { assignTripSeats } from "@/lib/students/seating";
import { generateSeatLayout, getTeacherStartingSeats } from "@/lib/utils";

describe("assignTripSeats (boarding chart seats)", () => {
  beforeEach(() => {
    state.teachers = [];
    state.clashOnce = null;
    state.reservations = [
      { id: "r1", student_id: "s1", chosen_seat: null, status: "ASSIGNED" },
      { id: "r2", student_id: "s2", chosen_seat: null, status: "ASSIGNED" },
      { id: "r3", student_id: "s3", chosen_seat: "3A", status: "ASSIGNED" },
    ];
  });

  it("gives every unseated passenger a distinct free seat, never a teacher seat", async () => {
    const n = await assignTripSeats("t1", 1);
    expect(n).toBe(2);
    const seats = state.reservations.map((r) => r.chosen_seat);
    expect(new Set(seats).size).toBe(3);
    const teacher = getTeacherStartingSeats(generateSeatLayout(8, "2x2"), 2);
    expect(seats.some((s) => teacher.includes(s!))).toBe(false);
  });

  it("tries the next seat when another caller took one at the same moment", async () => {
    const layout = generateSeatLayout(8, "2x2");
    state.clashOnce = layout.find((s) => !getTeacherStartingSeats(layout, 2).includes(s) && s !== "3A")!;
    const n = await assignTripSeats("t1", 1);
    expect(n).toBe(2);
    expect(state.reservations.every((r) => r.chosen_seat)).toBe(true);
  });

  it("does nothing without a bus", async () => {
    expect(await assignTripSeats("t1", null)).toBe(0);
  });
});

describe("teacher front seats", () => {
  it("students fill front seats only after every other seat is taken", async () => {
    state.clashOnce = null;
    state.teachers = [];
    state.reservations = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, student_id: `s${i}`, chosen_seat: null, status: "ASSIGNED" }));
    await assignTripSeats("t1", 1);
    const layout = generateSeatLayout(8, "2x2");
    const front = getTeacherStartingSeats(layout, 2);
    const used = state.reservations.map((r) => r.chosen_seat!);
    expect(new Set(used).size).toBe(7);
    // 6 non-front seats used first, then exactly one front seat
    expect(used.filter((s) => front.includes(s)).length).toBe(layout.length - front.length < 7 ? 7 - (layout.length - front.length) : 0);
  });
});

describe("teachers first", () => {
  it("teachers get the front seats before any student", async () => {
    state.clashOnce = null;
    state.teachers = [{ id: "t1", user_id: "u-t1", chosen_seat: null, status: "ASSIGNED" }];
    state.reservations = [{ id: "r1", student_id: "s1", chosen_seat: null, status: "ASSIGNED" }];
    await assignTripSeats("t1", 1);
    const layout = generateSeatLayout(8, "2x2");
    expect(state.teachers[0].chosen_seat).toBe(layout[0]);
    expect(getTeacherStartingSeats(layout, 2)).not.toContain(state.reservations[0].chosen_seat);
    state.teachers = [];
  });
});
