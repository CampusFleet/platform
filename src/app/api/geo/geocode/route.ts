import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface GeocodeItem {
  formattedAddress: string;
  mainText: string;
  secondaryText: string;
  latitude: number;
  longitude: number;
  provider?: string;
}

/**
 * Normalizes OpenStreetMap Nominatim item to clean Google Maps-style place item
 */
function normalizeOsmItem(item: any): GeocodeItem {
  const displayName = item.display_name || "";
  const parts = displayName.split(",").map((p: string) => p.trim());
  const mainText = parts[0] || item.name || "Selected Location";
  const secondaryText = parts.slice(1, 4).join(", ") || parts.slice(1).join(", ");

  return {
    formattedAddress: displayName,
    mainText,
    secondaryText,
    latitude: parseFloat(item.lat),
    longitude: parseFloat(item.lon),
    provider: "osm_nominatim",
  };
}

/**
 * Normalizes Google Maps Geocoding item to clean place item
 */
function normalizeGoogleItem(item: any): GeocodeItem {
  const formattedAddress = item.formatted_address || "";
  const parts = formattedAddress.split(",").map((p: string) => p.trim());
  const mainText = parts[0] || "Selected Location";
  const secondaryText = parts.slice(1, 4).join(", ") || parts.slice(1).join(", ");

  return {
    formattedAddress,
    mainText,
    secondaryText,
    latitude: item.geometry.location.lat,
    longitude: item.geometry.location.lng,
    provider: "google",
  };
}

/**
 * Searches Nominatim with timeout and user-agent
 */
async function queryOsm(query: string, limit = 5): Promise<GeocodeItem[]> {
  try {
    const osmRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=1`,
      {
        headers: {
          "User-Agent": "CampusFleet-Transit-Geocode/2.0 (transit@campusfleet.local)",
          "Accept-Language": "en",
        },
        signal: AbortSignal.timeout(4500),
      }
    );
    if (!osmRes.ok) return [];
    const osmData = await osmRes.json();
    if (!Array.isArray(osmData)) return [];
    return osmData.map(normalizeOsmItem);
  } catch {
    return [];
  }
}

/**
 * GET /api/geo/geocode?address=... or ?q=...
 * Forward Geocoding & Multi-Result Google Maps Style Autocomplete
 * With progressive fuzzy token relaxation if exact address is not found.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQuery = (searchParams.get("address") || searchParams.get("q") || "").trim();

    if (!rawQuery) {
      return NextResponse.json(
        { success: false, message: "Missing address or q query parameter." },
        { status: 400 }
      );
    }

    const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    let directResults: GeocodeItem[] = [];

    // 1. Try Google Geocoding API if configured
    if (googleKey) {
      try {
        const googleRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(rawQuery)}&key=${googleKey}`,
          { signal: AbortSignal.timeout(4500) }
        );
        if (googleRes.ok) {
          const data = await googleRes.json();
          if (data.status === "OK" && Array.isArray(data.results) && data.results.length > 0) {
            directResults = data.results.slice(0, 5).map(normalizeGoogleItem);
          }
        }
      } catch (gErr) {
        console.warn("[geocode] Google API failed or timed out, using OSM:", gErr);
      }
    }

    // 2. Try OpenStreetMap Nominatim if no Google results
    if (directResults.length === 0) {
      directResults = await queryOsm(rawQuery, 5);
    }

    // Direct matches found: return results
    if (directResults.length > 0) {
      const top = directResults[0];
      return NextResponse.json({
        success: true,
        latitude: top.latitude,
        longitude: top.longitude,
        formattedAddress: top.formattedAddress,
        mainText: top.mainText,
        secondaryText: top.secondaryText,
        results: directResults,
        provider: top.provider,
      });
    }

    // 3. FUZZY & SIMILAR LOCATION FALLBACK (Google Maps Standard)
    // If exact query returned 0 results (e.g. "Talli Bamori kham pilli kothi compo" or typos),
    // progressively relax the query by stripping colloquial noise words and searching key components.
    const cleanTokens = rawQuery
      .replace(/[^\w\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const noiseWords = new Set(["kham", "compo", "compound", "near", "opp", "opposite", "behind", "gali", "lane", "road", "colony", "ward"]);
    const filteredTokens = cleanTokens.filter((w) => !noiseWords.has(w.toLowerCase()));

    // Generate relaxed candidate queries
    const fallbackQueries: string[] = [];
    if (filteredTokens.length >= 2) {
      fallbackQueries.push(filteredTokens.slice(0, 2).join(" ")); // e.g. "Talli Bamori"
    }
    if (filteredTokens.length >= 4) {
      fallbackQueries.push(filteredTokens.slice(2, 4).join(" ")); // e.g. "pilli kothi"
    }
    if (filteredTokens.length >= 1) {
      fallbackQueries.push(`${filteredTokens[0]} Haldwani`);
      fallbackQueries.push(`${filteredTokens[0]} Uttarakhand`);
    }

    const suggestionsMap = new Map<string, GeocodeItem>();

    for (const fbQuery of fallbackQueries) {
      if (suggestionsMap.size >= 4) break;
      const candidates = await queryOsm(fbQuery, 3);
      for (const cand of candidates) {
        const key = `${cand.latitude.toFixed(3)}_${cand.longitude.toFixed(3)}`;
        if (!suggestionsMap.has(key)) {
          suggestionsMap.set(key, cand);
        }
      }
    }

    const suggestions = Array.from(suggestionsMap.values());

    if (suggestions.length > 0) {
      return NextResponse.json({
        success: false,
        isFuzzy: true,
        message: `Exact location not found for "${rawQuery}". Did you mean one of these nearby areas?`,
        suggestions,
        query: rawQuery,
      });
    }

    // If completely nothing found
    return NextResponse.json(
      {
        success: false,
        isFuzzy: false,
        message: `Could not locate "${rawQuery}". Try typing your city, sector, or nearest main road (e.g. "Mukhani Haldwani").`,
      },
      { status: 404 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to geocode address." },
      { status: 500 }
    );
  }
}
