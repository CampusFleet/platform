import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({ db: {} }));
import { formatClock } from "@/lib/students/leave-early";

describe("formatClock", () => {
  it("formats shift times as 12-hour clock", () => {
    expect(formatClock("13:30:00")).toBe("1:30 PM");
    expect(formatClock("07:05")).toBe("7:05 AM");
    expect(formatClock("00:15")).toBe("12:15 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
  });
  it("returns null for missing or broken values", () => {
    expect(formatClock(null)).toBeNull();
    expect(formatClock("")).toBeNull();
    expect(formatClock("soon")).toBeNull();
  });
});
