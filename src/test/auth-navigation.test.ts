import { describe, expect, it } from "vitest";
import { homeForRole, safeNextPath } from "@/lib/client/auth-navigation";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/portal")).toBe("/portal");
    expect(safeNextPath("/login?error=no_email")).toBe("/login?error=no_email");
  });
  it("rejects off-site or empty targets", () => {
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "portal"]) {
      expect(safeNextPath(bad)).toBe("/login");
    }
  });
});

describe("homeForRole", () => {
  it("maps staff roles and defaults to the student portal", () => {
    expect(homeForRole("conductor")).toBe("/conductor");
    expect(homeForRole("student")).toBe("/portal");
    expect(homeForRole(null)).toBe("/portal");
  });
});
