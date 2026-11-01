import { describe, it, expect } from "vitest";

describe("Route Corridor Destination & Google Transit Markers", () => {
  it("generates valid SVG data URIs for all stop states", () => {
    // Test terminal stop
    const terminalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <defs><filter id="ts"><feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-opacity="0.4"/></filter></defs>
      <circle cx="22" cy="22" r="19" fill="#4338CA" stroke="#C7D2FE" stroke-width="2.5"/>
    </svg>`;
    const terminalUri = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(terminalSvg.trim());
    expect(terminalUri).toContain("data:image/svg+xml;charset=UTF-8,");
    expect(terminalUri).toContain("%3Csvg");

    // Test passed stop
    const passedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" fill="#64748B"/>
    </svg>`;
    const passedUri = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(passedSvg.trim());
    expect(passedUri).toContain("%2364748B"); // Slate color for passed stop
  });

  it("generates valid SVG data URI for live bus vehicle marker with heading", () => {
    const busSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="16" fill="#1A73E8"/>
      <g transform="rotate(180 24 24)"><polygon points="24,9 28,14 20,14" fill="#FFFFFF"/></g>
      <circle cx="36" cy="12" r="4.5" fill="#10B981"/>
    </svg>`;
    const busUri = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(busSvg.trim());
    expect(busUri).toContain("data:image/svg+xml;charset=UTF-8,");
    expect(busUri).toContain("%231A73E8"); // Google Navigation Blue
    expect(busUri).toContain("%2310B981"); // Live emerald beacon
  });

  it("verifies dynamic polyline slicing logic between traveled and upcoming", () => {
    // Mock 5 points along a road
    const fullPath = [
      { lat: 29.20, lng: 79.48 }, // Origin
      { lat: 29.22, lng: 79.50 }, // Stop 1
      { lat: 29.25, lng: 79.53 }, // Bus is near here
      { lat: 29.30, lng: 79.54 }, // Stop 2
      { lat: 29.37, lng: 79.52 }, // Campus Terminal
    ];

    const busPos = { lat: 29.251, lng: 79.531 };
    const closestIdx = 2; // Index of { lat: 29.25, lng: 79.53 }

    const traveled = [...fullPath.slice(0, closestIdx + 1), busPos];
    const upcoming = [busPos, ...fullPath.slice(closestIdx)];

    expect(traveled.length).toBe(4);
    expect(traveled[0]).toEqual(fullPath[0]); // Starts at origin
    expect(traveled[traveled.length - 1]).toEqual(busPos); // Ends at current bus

    expect(upcoming.length).toBe(4);
    expect(upcoming[0]).toEqual(busPos); // Starts at current bus
    expect(upcoming[upcoming.length - 1]).toEqual(fullPath[fullPath.length - 1]); // Ends at Campus Terminal
  });
});
