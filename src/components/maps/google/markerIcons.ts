// High-DPI Inline SVG Data URIs for Hardware-Accelerated Native Google Maps Markers

export function createStopMarkerSvgUri(params: {
  index: number;
  state: "passed" | "next" | "upcoming" | "selected";
  isTerminal: boolean;
  label?: string;
}): string {
  const { index, state, isTerminal } = params;

  if (isTerminal) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <defs>
        <filter id="ts" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-opacity="0.4"/>
        </filter>
      </defs>
      <circle cx="22" cy="22" r="19" fill="#4338CA" stroke="#C7D2FE" stroke-width="2.5" filter="url(#ts)"/>
      <path d="M14 27h16M16 27v-8M22 27v-8M28 27v-8M13 19l9-6 9 6H13z" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
  }

  if (state === "passed") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" fill="#64748B" stroke="#CBD5E1" stroke-width="2"/>
      <path d="M11 16l3.5 3.5L21 12" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
  }

  if (state === "next" || state === "selected") {
    const color = state === "selected" ? "#059669" : "#2563EB";
    const ringColor = state === "selected" ? "#34D399" : "#93C5FD";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <defs>
        <filter id="ns" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-opacity="0.35"/>
        </filter>
      </defs>
      <circle cx="20" cy="20" r="18" fill="none" stroke="${ringColor}" stroke-width="2.5" opacity="0.85"/>
      <circle cx="20" cy="20" r="14" fill="${color}" stroke="#FFFFFF" stroke-width="2.5" filter="url(#ns)"/>
      <text x="20" y="24.5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="13" fill="#FFFFFF">${index}</text>
    </svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
  }

  // Upcoming
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs>
      <filter id="us" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.2"/>
      </filter>
    </defs>
    <circle cx="16" cy="16" r="12" fill="#FFFFFF" stroke="#1D4ED8" stroke-width="2.5" filter="url(#us)"/>
    <text x="16" y="20.5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="12" fill="#1E40AF">${index}</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

export function createBusMarkerSvgUri(busLabel: string, headingDeg: number = 0): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <defs>
      <filter id="bs" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.4"/>
      </filter>
    </defs>
    <circle cx="24" cy="24" r="21" fill="#1A73E8" fill-opacity="0.18"/>
    <circle cx="24" cy="24" r="16" fill="#1A73E8" stroke="#FFFFFF" stroke-width="2.5" filter="url(#bs)"/>
    ${headingDeg ? `
      <g transform="rotate(${headingDeg} 24 24)">
        <polygon points="24,9 28,14 20,14" fill="#FFFFFF"/>
      </g>
    ` : ""}
    <g transform="translate(16.5, 16.5) scale(0.62)">
      <path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" fill="#FFFFFF"/>
    </g>
    <circle cx="36" cy="12" r="4.5" fill="#10B981" stroke="#FFFFFF" stroke-width="1.5"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

export function createHomePinMarkerSvgUri(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <defs>
      <filter id="hps" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.35"/>
      </filter>
    </defs>
    <circle cx="22" cy="22" r="18" fill="#10B981" stroke="#FFFFFF" stroke-width="2.5" filter="url(#hps)"/>
    <path d="M14 23l8-7 8 7v7h-5v-5h-6v5h-5v-7z" fill="#FFFFFF"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

